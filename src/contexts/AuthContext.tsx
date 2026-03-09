/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { UserProfile } from "@/lib/types";

declare global {
    interface Window {
        google?: {
            accounts: {
                oauth2: {
                    initCodeClient: (config: any) => any;
                }
            }
        }
    }
}

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
    const [isFirestoreLoaded, setIsFirestoreLoaded] = useState(false);
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

        // モバイルでリロードしてもセッションが維持されるよう明示的に宣言
        setPersistence(auth, browserLocalPersistence).catch(console.error);

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
                        console.log('Firestoreから取得したgoogleRefreshTokenを設定', data.googleRefreshToken);
                    } else {
                        setGoogleRefreshToken(null);
                        localStorage.removeItem('googleRefreshToken');
                        console.log('FirestoreにgoogleRefreshTokenが無い');
                    }

                    // Stateへのセットだけでなく、確実にキャッシュもローカル変数から即時更新する
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

                setIsFirestoreLoaded(true);
            } else {
                setIsApproved(false);
                setGoogleAccessToken(null);
                setGoogleRefreshToken(null);
                setProfile(null);
                setIsFirestoreLoaded(true);
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

    // 【修正】自動での connectGoogleTasks 呼び出しを削除。
    // useEffect内での自動signInWithPopupは、モバイルブラウザのポップアップブロックに引っかかる、またはリロードループを引き起こす原因となります。
    // その代わり、アクセストークンが無い（または切れた）場合はUI上でユーザーのタップにより再連携を促します。

    // Google Tasks連携（初回のみ・リフレッシュトークン取得）
    const connectGoogleTasks = async () => {
        if (!auth || !user) return;

        // Google Identity Services の初期化と呼び出し
        if (typeof window !== "undefined" && window.google) {
            const client = window.google.accounts.oauth2.initCodeClient({
                client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
                scope: 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar',
                ux_mode: 'popup',
                callback: async (response: any) => {
                    if (response.error) {
                        console.error('Consent error:', response.error);
                        alert(`Google連携エラー: ${response.error}`);
                        return;
                    }
                    if (response.code) {
                        try {
                            const res = await fetch("/api/auth/exchange", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ code: response.code })
                            });
                            if (!res.ok) throw new Error("Failed to exchange auth code");
                            const data = await res.json();

                            if (data.access_token) {
                                setGoogleAccessToken(data.access_token);
                                localStorage.setItem('googleAccessToken', data.access_token);
                            }
                            if (data.refresh_token) {
                                setGoogleRefreshToken(data.refresh_token);
                                localStorage.setItem('googleRefreshToken', data.refresh_token);
                                if (user && db) {
                                    const userRef = doc(db, "users", user.uid);
                                    await setDoc(userRef, { googleRefreshToken: data.refresh_token }, { merge: true });
                                }
                            }
                            // 画面更新を促す
                            window.location.reload();
                        } catch (err: any) {
                            console.error("Exchange error:", err);
                            alert(`トークン交換エラー: ${err.message}`);
                        }
                    }
                },
            });
            client.requestCode();
        } else {
            console.error("Google Identity Services script not loaded.");
            alert("Google認証スクリプトが読み込めていません。リロードしてください。");
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
