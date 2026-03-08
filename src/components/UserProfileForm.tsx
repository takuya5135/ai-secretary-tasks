"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { UserProfile } from "@/lib/types";
import { motion } from "framer-motion";
import { User, Briefcase, Heart, Users, Calendar, AlertCircle, Sparkles } from "lucide-react";

export default function UserProfileForm({ onComplete, onCancel }: { onComplete: () => void; onCancel?: () => void }) {
    const { profile, updateProfile, loading: authLoading } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // フォームの初期値（既存プロファイルがあればそれをセット）
    const [formData, setFormData] = useState<Partial<UserProfile>>({
        nickname: profile?.nickname || "",
        gender: profile?.gender || "",
        birth_year: profile?.birth_year || "",
        occupation: profile?.occupation || "",
        marital_status: profile?.marital_status || "",
        children_count: profile?.children_count || "",
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const success = await updateProfile(formData);
            if (success) {
                onComplete();
            } else {
                setError("プロフィールの保存に失敗しました。時間をおいて再度お試しください。");
            }
        } catch (err: unknown) {
            console.error(err);
            setError(err instanceof Error ? err.message : "予期せぬエラーが発生しました。");
        } finally {
            setLoading(false);
        }
    };

    if (authLoading) return null;

    return (
        <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gradient-to-br from-indigo-50 to-blue-50 p-6 py-12">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-lg bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl overflow-hidden border border-white"
            >
                <div className="p-8 pb-6 bg-gradient-to-b from-blue-600/5 to-transparent">
                    <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mb-5 shadow-inner">
                        <Sparkles className="w-7 h-7 text-blue-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">プロフィール設定</h2>
                    <p className="text-gray-500 text-sm leading-relaxed">
                        AIバディがあなたに合わせた最適なアドバイスやタスク提案を行えるよう、少しだけあなたのことを教えてください。
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="p-8 pt-2 space-y-5">
                    {error && (
                        <div className="flex items-start gap-3 p-3 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <p>{error}</p>
                        </div>
                    )}

                    {/* ニックネーム */}
                    <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <User className="w-4 h-4 text-gray-400" />
                            お呼びする名前（ニックネーム） <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            name="nickname"
                            required
                            value={formData.nickname}
                            onChange={handleChange}
                            placeholder="例: たくや"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        {/* 性別 */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                                性別
                            </label>
                            <select
                                name="gender"
                                value={formData.gender}
                                onChange={handleChange}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-gray-700"
                            >
                                <option value="">選択してください</option>
                                <option value="男性">男性</option>
                                <option value="女性">女性</option>
                                <option value="その他">その他</option>
                                <option value="回答しない">回答しない</option>
                            </select>
                        </div>

                        {/* 年齢 -> 生まれ年 */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                生まれ年
                            </label>
                            <select
                                name="birth_year"
                                value={formData.birth_year}
                                onChange={handleChange}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-gray-700 max-h-48"
                            >
                                <option value="">選択してください</option>
                                {Array.from({ length: 120 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                                    <option key={year} value={year.toString()}>
                                        {year}年
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 職業 */}
                    <div className="space-y-1.5">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <Briefcase className="w-4 h-4 text-gray-400" />
                            ご職業・役割（なるべく詳しく）
                        </label>
                        <textarea
                            name="occupation"
                            rows={2}
                            value={formData.occupation}
                            onChange={handleChange}
                            placeholder="例: IT企業のプロジェクトマネージャー、フリーランスのデザイナー、専業主婦"
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none resize-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        {/* 結婚 */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                                <Heart className="w-4 h-4 text-gray-400" />
                                パートナー関係
                            </label>
                            <select
                                name="marital_status"
                                value={formData.marital_status}
                                onChange={handleChange}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-gray-700"
                            >
                                <option value="">選択してください</option>
                                <option value="未婚">未婚</option>
                                <option value="既婚">既婚</option>
                                <option value="回答しない">回答しない</option>
                            </select>
                        </div>

                        {/* 子供の数 */}
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                                <Users className="w-4 h-4 text-gray-400" />
                                お子様の数
                            </label>
                            <input
                                type="text"
                                name="children_count"
                                value={formData.children_count}
                                onChange={handleChange}
                                placeholder="例: 0人, 2人"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                            />
                        </div>
                    </div>

                    <div className="pt-6 flex gap-3">
                        {onCancel && (
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={loading}
                                className="w-1/3 flex items-center justify-center gap-2 bg-white text-gray-600 border border-gray-200 font-medium py-3.5 px-4 rounded-xl hover:bg-gray-50 focus:ring-4 focus:ring-gray-100 transition-all active:scale-[0.98] disabled:opacity-50"
                            >
                                キャンセル
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={loading || !formData.nickname}
                            className={`${onCancel ? "w-2/3" : "w-full"} flex items-center justify-center gap-2 bg-blue-600 text-white font-medium py-3.5 px-4 rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 focus:ring-4 focus:ring-blue-600/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none`}
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                "プロフィールを保存"
                            )}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
