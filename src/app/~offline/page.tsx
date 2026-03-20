"use client";

import { AlertCircle } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gray-50 p-6 text-center">
      <AlertCircle className="w-16 h-16 text-gray-400 mb-6" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">インターネット接続がありません</h1>
      <p className="text-gray-600 text-sm max-w-sm mb-8">
        現在オフラインのため、このページを表示できません。<br />
        ネットワーク接続を確認して、もう一度お試しください。
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-2 bg-blue-600 text-white rounded-xl font-medium shadow-sm hover:bg-blue-700 transition"
      >
        再読み込み
      </button>
    </div>
  );
}
