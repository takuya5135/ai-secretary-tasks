"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { UserProfile } from "@/lib/types";

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    isApproved: boolean; // 管理者から承認されているか
    googleAccessToken: string | null; // Taks API呼び出し用（一時的）
    googleRefreshToken: string | null; // 自動更新用永続トークン
    signInWithGoogle: () => Promise<void>;
    connectGoogleTasks: () => Promise<void>;
    signOut: () => Promise<void>;
    updateProfile: (data: Partial<UserProfile>) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
    isApproved: false,
    googleAccessToken: null,
    googleRefreshToken: null,
    signInWithGoogle: async () => { },
    connectGoogleTasks: async () => { },
    signOut: async () => { },
    updateProfile: async () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(() => {
        if (typeof window !== "undefined") {
            const cachedProfile = localStorage.getItem("cachedUserProfile");
            return cachedProfile ? JSON.parse(cachedProfile) : null;
        }
        return null;
    });
    const [loading, setLoading] = useState(false); // 初期値falseにして即座にUI表示
    const [isApproved, setIsApproved] = useState(() => {
        if (typeof window !== "undefined") {
            const cachedApproved = localStorage.getItem("cachedUserApproved");
            return cachedApproved === "true";
        }
        return false;
    });
    const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("googleAccessToken");
        }
        return null;
    });
    const [googleRefreshToken, setGoogleRefreshToken] = useState<string | null>(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("googleRefreshToken");
        }
        return null;
    });

    useEffect(() => {
        // リロード時のために、localStorageからトークンや状態を復元（クライアントサイドのみ）
        if (typeof window !== "undefined") {

            // キャッシュからユーザー情報を復元して即座に画面を表示（SWR: Stale-While-Revalidate）
            const cachedProfile = localStorage.getItem("cachedUserProfile");
            const cachedApproved = localStorage.getItem("cachedUserApproved");
            // user自体はFirebaseのonAuthStateChangedで比較的早く取れるのでnullのままか最低限でOK。
            // ただし今回はキャッシュを優先して画面遷移を減らすため、擬似的にプロファイルをセット
            if (cachedProfile) setProfile(JSON.parse(cachedProfile));
            if (cachedApproved) setIsApproved(cachedApproved === "true");
        }

        if (!auth || !db) {
            console.warn("Firebase is not initialized. Environment variables might be missing.");
            return;
        }

        // ログイン状態の監視
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            if (currentUser && db) {
                // ユーザーがログインした時、Firestoreのusersコレクションを確認・作成
                const userRef = doc(db, "users", currentUser.uid);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    // すでにデータがある場合は承認ステータスを取得
                    const data = userSnap.data();
                    const approved = data.is_approved === true;
                    const userProfile = data.profile || null;

                    setIsApproved(approved);
                    setProfile(userProfile);
                    if (data.googleRefreshToken) {
                        setGoogleRefreshToken(data.googleRefreshToken);
                        localStorage.setItem('googleRefreshToken', data.googleRefreshToken);
                    } else {
                        setGoogleRefreshToken(null);
                        localStorage.removeItem('googleRefreshToken');
                    }

                    // 最新状態をキャッシュ（次回起動用）
                    localStorage.setItem("cachedUserApproved", String(approved));
                    if (userProfile) {
                        localStorage.setItem("cachedUserProfile", JSON.stringify(userProfile));
                    } else {
                        localStorage.removeItem("cachedUserProfile");
                    }
                } else {
                    // 初回ログイン時はusersドキュメントを作成 (デフォルトは未承認)
                    await setDoc(userRef, {
                        email: currentUser.email,
                        displayName: currentUser.displayName,
                        photoURL: currentUser.photoURL,
                        is_approved: false, // 管理者が後から手動でtrueにするまで使えない
                        profile: null,
                        createdAt: new Date().toISOString(),
                    });
                    setIsApproved(false);
                    setProfile(null);
                    setGoogleRefreshToken(null);
                    localStorage.setItem("cachedUserApproved", "false");
                    localStorage.removeItem("cachedUserProfile");
                    localStorage.removeItem("googleRefreshToken");
                }
            } else {
                setIsApproved(false);
                setGoogleAccessToken(null);
                setGoogleRefreshToken(null);
                setProfile(null);
                if (typeof window !== "undefined") {
                    localStorage.removeItem("googleAccessToken");
                    localStorage.removeItem("googleRefreshToken");
                    localStorage.removeItem("cachedUserApproved");
                    localStorage.removeItem("cachedUserProfile");
                }
            }

            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        if (!auth) return;
        const provider = new GoogleAuthProvider();

        try {
            await signInWithPopup(auth, provider);
        } catch (error: any) {
            console.error("Sign in error:", error);
            alert(`ログインエラー: ${error.message || "予期せぬエラーが発生しました"}`);
        }
    };

    // Google Tasks連携（初回のみ・リフレッシュトークン取得）
    const connectGoogleTasks = async () => {
        if (!auth || !user) return;
        const provider = new GoogleAuthProvider();

        provider.addScope('https://www.googleapis.com/auth/tasks');
        provider.addScope('https://www.googleapis.com/auth/calendar');
        provider.setCustomParameters({
            prompt: 'consent',     // 毎回同意画面を出し、確実にリフレッシュトークンをもらう
            access_type: 'offline' // リフレッシュトークンを要求
        });

        try {
            const result = await signInWithPopup(auth, provider);
            // ※ Firebaseの signInWithPopup から直接はGoogle Refresh Tokenを取得できない（Server Auth Codeが必要）。
            // そのため、credentialFromResult ではなく、OAuthの仕組みでコードをバックエンドに送り交換するフローが主流だが、
            // Firebase Authの機能で連携するなら、バックエンドを用いずにAccessTokenだけキャッシュする旧方式に戻るか、
            // または `firebase-admin` や Google Cloud 経由でリフレッシュトークンを扱うなどの工夫が必要。
            // 今回は signInWithPopup が返す credential に含まれる authorizationCode（もしあれば）を利用するか、
            // idToken をバックエンドに送り、バックエンドで取得するなどの方法になる。
            // 
            // （修正）: 現行のFirebase SDK (web) の signInWithPopup は、refresh_token を直接含みません。
            // したがって /api/auth/exchange と連携するためには、OAuthの Authorization Code Flow を自作するか、Google Identity Services を利用する必要があります。
            // ここでは簡易的に、フロントエンド側で Google Identity Services の SDK (gapi) 相当を利用するか、
            // バックエンドへのリダイレクトで処理する必要があります。
            //
            // ★今回の仕様: 独自の `/auth/callback` リダイレクト画面を使わず、Googleの gsiライブラリを用いて authorization code を取得し、それをAPIに投げる。
            // (簡易実装として、一旦アクセストークンを取得し localStorage に保存する旧フローも残しつつ、後で拡張可能にする)

            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                setGoogleAccessToken(credential.accessToken);
                localStorage.setItem('googleAccessToken', credential.accessToken);
                // 本当はここで code を貰って /api/auth/exchange に投げる必要がある。
                // (今回は簡略化のため、まずはアクセストークンのみ保存。後続のAPI修正で考慮する)
            }
        } catch (error: any) {
            console.error("Google connect error:", error);
            alert(`Google連携エラー: ${error.message}`);
        }
    }

    const signOut = async () => {
        if (!auth) return;
        try {
            await firebaseSignOut(auth);
            setGoogleAccessToken(null);
            setGoogleRefreshToken(null);
            setProfile(null);
            if (typeof window !== "undefined") {
                localStorage.removeItem('googleAccessToken');
                localStorage.removeItem('googleRefreshToken');
                localStorage.removeItem('cachedUserApproved');
                localStorage.removeItem('cachedUserProfile');
            }
        } catch (error) {
            console.error("Sign out error:", error);
        }
    };

    const updateProfile = async (data: Partial<UserProfile>) => {
        if (!user || !db) return false;
        try {
            const userRef = doc(db, "users", user.uid);
            const newProfile = { ...profile, ...data } as UserProfile;
            // Firestoreにマージで書き込み
            await setDoc(userRef, { profile: newProfile }, { merge: true });
            setProfile(newProfile);
            localStorage.setItem("cachedUserProfile", JSON.stringify(newProfile));
            return true;
        } catch (error) {
            console.error("Profile update error:", error);
            return false;
        }
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, isApproved, googleAccessToken, googleRefreshToken, signInWithGoogle, connectGoogleTasks, signOut, updateProfile }}>
            {children}
        </AuthContext.Provider>
    );
};
