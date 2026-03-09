/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

function CallbackContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        const handleCallback = async () => {
            const code = searchParams.get("code");
            const error = searchParams.get("error");

            if (error) {
                setStatus("error");
                setErrorMessage(`Google連携がキャンセルされたか失敗しました: ${error}`);
                return;
            }

            if (!code) {
                // 通常のアクセス（URL直打ちなど）はトップへ戻す
                router.push("/");
                return;
            }

            if (!user) {
                // Firebaseユーザーが初期化されるまで待機するが、タイムアウトしたらエラーにする
                // AuthContextがロードされる前にここに到達する可能性があるため少し様子見するか、
                // 実際にはログイン完了後にしかここに来ないはず。
                return;
            }

            try {
                // バックエンドAPIにAuthorization Codeを送信
                const res = await fetch("/api/auth/exchange", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code })
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || "トークンの取得に失敗しました");
                }

                const data = await res.json();

                // Firestoreにリフレッシュトークンを保存
                if (data.refresh_token && db) {
                    await setDoc(doc(db, "users", user.uid), {
                        googleRefreshToken: data.refresh_token,
                        googleTokenExpiry: data.expiry_date || null
                    }, { merge: true });

                    // ローカルストレージとStateにも反映（AuthContextのリッスンで拾えるが、念のため手動でも）
                    localStorage.setItem("googleRefreshToken", data.refresh_token);
                }

                setStatus("success");

                // 少し表示してトップページへ戻る
                setTimeout(() => {
                    router.push("/");
                }, 1500);

            } catch (err: any) {
                console.error("Token exchange error:", err);
                setStatus("error");
                setErrorMessage(err.message || "予期せぬエラーが発生しました");
            }
        };

        handleCallback();

    }, [searchParams, router, user]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
            <div className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full text-center">
                {status === "loading" && (
                    <div className="space-y-4">
                        <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto" />
                        <h2 className="text-xl font-bold text-gray-900">Googleと連携中...</h2>
                        <p className="text-sm text-gray-500">トークンを取得しています。画面を閉じないでください。</p>
                    </div>
                )}

                {status === "success" && (
                    <div className="space-y-4">
                        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
                        <h2 className="text-xl font-bold text-gray-900">連携完了</h2>
                        <p className="text-sm text-gray-500">Google Tasksと正常に連携しました。ホーム画面へ戻ります。</p>
                    </div>
                )}

                {status === "error" && (
                    <div className="space-y-4">
                        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto" />
                        <h2 className="text-xl font-bold text-gray-900">連携エラー</h2>
                        <p className="text-sm text-red-600">{errorMessage}</p>
                        <button
                            onClick={() => router.push("/")}
                            className="mt-6 w-full py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-colors"
                        >
                            ホームへ戻る
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CallbackPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>}>
            <CallbackContent />
        </Suspense>
    );
}
