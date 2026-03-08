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
    googleAccessToken: string | null; // Taks API呼び出し用
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    updateProfile: (data: Partial<UserProfile>) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
    isApproved: false,
    googleAccessToken: null,
    signInWithGoogle: async () => { },
    signOut: async () => { },
    updateProfile: async () => false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [isApproved, setIsApproved] = useState(false);
    const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

    useEffect(() => {
        if (!auth || !db) {
            setLoading(false);
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
                    setIsApproved(data.is_approved === true);
                    setProfile(data.profile || null);
                } else {
                    // 初回ログイン時はusersドキュメントを作成 (デフォルトは未承認)
                    await setDoc(userRef, {
                        email: currentUser.email,
                        displayName: currentUser.displayName,
                        photoURL: currentUser.photoURL,
                        is_approved: false, // 管理者が後から手動でtrueにするまで使えない
                        profile: null,
                        createdAt: new Date().toISOString()
                    });
                    setIsApproved(false);
                    setProfile(null);
                }
            } else {
                setIsApproved(false);
                setGoogleAccessToken(null);
                setProfile(null);
            }

            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const signInWithGoogle = async () => {
        if (!auth) return;
        const provider = new GoogleAuthProvider();
        // TasksとCalendarのAPIスコープを要求する (後々Geminiと連携するため)
        provider.addScope('https://www.googleapis.com/auth/tasks');
        provider.addScope('https://www.googleapis.com/auth/calendar');

        try {
            const result = await signInWithPopup(auth, provider);
            // ログイン結果からCredential（アクセストークンを含む）を取得する
            const credential = GoogleAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                setGoogleAccessToken(credential.accessToken);
            }
        } catch (error: any) {
            console.error("Sign in error:", error);
            alert(`ログインエラー: ${error.message || "予期せぬエラーが発生しました"}`);
        }
    };

    const signOut = async () => {
        if (!auth) return;
        try {
            await firebaseSignOut(auth);
            setGoogleAccessToken(null);
            setProfile(null);
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
            return true;
        } catch (error) {
            console.error("Profile update error:", error);
            return false;
        }
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, isApproved, googleAccessToken, signInWithGoogle, signOut, updateProfile }}>
            {children}
        </AuthContext.Provider>
    );
};
