"use client";

import { useAuth } from "@/contexts/AuthContext";
import { LogOut, CheckCircle2, AlertCircle } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import SwipeableLayout from "@/components/SwipeableLayout";
import UserProfileForm from "@/components/UserProfileForm";

export default function Home() {
  const { user, profile, loading, isApproved, signInWithGoogle, signOut } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    await signInWithGoogle();
    setIsSigningIn(false);
  };

  // ローディング画面
  if (loading || isSigningIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-500 font-medium animate-pulse">読み込み中...</p>
      </div>
    );
  }

  // ==== 1. 未ログイン状態 ====
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl overflow-hidden border border-white"
        >
          <div className="p-8 pb-6 flex flex-col items-center pt-10">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200">
              <CheckCircle2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">AI Secretary Tasks</h1>
            <p className="text-gray-500 text-center mb-8 text-sm">
              あなたのタスクとスケジュールを最適化する<br />次世代のバディ
            </p>

            <button
              onClick={handleSignIn}
              className="w-full relative flex items-center justify-center gap-3 bg-white text-gray-700 font-semibold py-3.5 px-4 rounded-xl shadow-sm border border-gray-200 hover:bg-gray-50 hover:shadow-md transition-all active:scale-[0.98]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Googleでログインして始める
            </button>
          </div>
          <div className="p-4 bg-gray-50/50 text-center border-t border-gray-100">
            <p className="text-xs text-gray-400">
              ※本アプリは管理者による承認制です。
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // ==== 2. ログイン済み だが 未承認 (Pending) ====
  if (!isApproved) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gray-50 p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-orange-100 p-8 text-center"
        >
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-3">承認待ちです</h2>
          <p className="text-gray-600 mb-6 text-sm leading-relaxed">
            アカウントの作成に成功しましたが、まだ利用の権限が付与されていません。<br />
            管理者が承認するまでしばらくお待ちください。
          </p>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl mb-6 text-left">
            <div>
              <p className="text-xs text-gray-500 mb-1">現在のアカウント</p>
              <p className="text-sm font-medium text-gray-900">{user.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="text-sm font-medium text-gray-500 hover:text-gray-900 flex items-center justify-center gap-2 mx-auto transition-colors"
          >
            <LogOut className="w-4 h-4" /> ログアウトして別のアカウントを使用
          </button>
        </motion.div>
      </div>
    );
  }

  // ==== 3. ログイン済み ＆ 承認済み (メインアプリ) ====
  if (!profile || !profile.nickname || isEditingProfile) {
    return (
      <UserProfileForm
        onComplete={() => setIsEditingProfile(false)}
        onCancel={profile?.nickname ? () => setIsEditingProfile(false) : undefined}
      />
    );
  }

  return <SwipeableLayout onEditProfile={() => setIsEditingProfile(true)} />;
}
