/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Send, Sparkles, User, Bot, Loader2, ChevronUp, ChevronDown, Mic, MicOff, Volume2, VolumeX, Trash2, ListChecks, Heart, LayoutDashboard, CalendarDays } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { SHOPPING_LOCATIONS } from "@/lib/constants";
import { useAuth } from "@/contexts/AuthContext";

type Message = {
    role: "user" | "assistant";
    content: string;
};

export default function ChatBuddy({ onTaskProposed }: { onTaskProposed?: (tasks: any[]) => void }) {
    const { user, profile, googleAccessToken, googleRefreshToken } = useAuth();
    const [messages, setMessages] = useState<Message[]>([
        { role: "assistant", content: "こんにちは！あなたの秘書のバディです。何かお手伝いできることはありますか？雑談も大歓迎ですよ！" }
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [hasSummarized, setHasSummarized] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);
    const isSummarizingRef = useRef(false);

    // 日付が変わったらチャットをリセットする処理
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const today = new Date().toLocaleDateString();
                const lastUsed = localStorage.getItem('chat_last_used_date');
                if (lastUsed && lastUsed !== today) {
                    setMessages([{ role: "assistant", content: "おはようございます！新しい一日ですね。今日も一日サポートいたします。" }]);
                    setHasSummarized(false); // 新日のため要約を再生成
                }
                localStorage.setItem('chat_last_used_date', today);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        handleVisibilityChange(); // 初回マウント時にも実行

        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // 起動時の要約生成
    useEffect(() => {
        if (googleAccessToken && user && !hasSummarized && !isSummarizingRef.current) {
            isSummarizingRef.current = true;
            const fetchSummary = async () => {
                try {
                    if (!db) return;

                    // 1. Firestore から直近のキャッシュを取得
                    const calDoc = await getDoc(doc(db, "users", user.uid, "google_cache", "calendar"));
                    let calData = [];
                    if (calDoc.exists()) {
                        calData = calDoc.data().events || [];
                    }

                    const tasksDoc = await getDoc(doc(db, "users", user.uid, "google_cache", "tasks"));
                    let tasksData = [];
                    if (tasksDoc.exists()) {
                        const googleTasks = tasksDoc.data().items || [];
                        const metaSnap = await getDocs(collection(db, "users", user.uid, "tasks_metadata"));
                        const metadataMap = new Map();
                        metaSnap.forEach(snap => metadataMap.set(snap.id, snap.data()));

                        tasksData = googleTasks.map((t: any) => {
                            const meta = metadataMap.get(t.id);
                            return {
                                ...t,
                                place: meta?.place || "2nd",
                                importance: meta?.importance || 2,
                                urgency: meta?.urgency || 2
                            };
                        });
                    }

                    // キャッシュが空の場合は同期を待つか、今回はあるものだけで要約する方針（最悪0件で「今日の予定はありません」となる）

                    // 2. 要約の生成
                    const sumRes = await fetch("/api/ai/summarize", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            tasks: tasksData,
                            calendarEvents: calData,
                            userProfile: profile
                        })
                    });

                    if (!sumRes.ok) throw new Error("Summarization failed");
                    const sumData = await sumRes.json();

                    setMessages(prev => [
                        ...prev,
                        { role: "assistant", content: "今日の予定と今後の見通しをまとめました！\n\n" + sumData.summary }
                    ]);
                    setHasSummarized(true);
                } catch (error) {
                    console.error("Initialization summary error:", error);
                } finally {
                    isSummarizingRef.current = false;
                }
            };
            fetchSummary();
        }
    }, [googleAccessToken, user, profile, hasSummarized]);

    // 音声読み上げ (TTS)
    const speak = useCallback((text: string, index: number) => {
        if (typeof window === "undefined") return;
        window.speechSynthesis.cancel();

        // マークダウン記号や絵文字を削除して読み上げやすくする
        const cleanText = text
            .replace(/[#*`_~]/g, '') // マークダウン記号
            .replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, ''); // 絵文字

        if (!cleanText.trim()) return;

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = "ja-JP";
        utterance.rate = 1.1;
        utterance.onstart = () => {
            setSpeakingIndex(index);
        };
        utterance.onend = () => {
            setSpeakingIndex(null);
        };
        utterance.onerror = () => {
            setSpeakingIndex(null);
        };
        window.speechSynthesis.speak(utterance);
    }, []);

    const stopSpeaking = useCallback(() => {
        if (typeof window === "undefined") return;
        window.speechSynthesis.cancel();
        setSpeakingIndex(null);
    }, []);

    // 音声認識 (STT) のセットアップ
    useEffect(() => {
        if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.lang = "ja-JP";
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;

            recognitionRef.current.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                setInput(transcript);
                setIsListening(false);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                setIsListening(false);
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        }
    }, []);

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
        } else {
            setInput("");
            recognitionRef.current?.start();
            setIsListening(true);
        }
    };

    // メッセージが追加されたら下までスクロール
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, hasSummarized]);

    const handleQuickAction = async (action: 'summarize' | 'summarize10' | 'organize' | 'encourage') => {
        setIsExpanded(true);
        let prompt = "";
        switch (action) {
            case 'summarize':
                prompt = "今日の予定とタスクを簡潔に要約して教えて。";
                break;
            case 'summarize10':
                prompt = "今日から10日間の予定とタスクを整理して教えてください。";
                break;
            case 'organize':
                prompt = "今のタスクリストを見て、アイゼンハワーマトリクスや2分ルール、カエルを食べるなどの観点から、効率的な進め方をアドバイスして。大きすぎるタスクがあれば分割案も出して。";
                break;
            case 'encourage':
                prompt = "ちょっと疲れたので、やる気が出るような言葉をかけて。";
                break;
        }
        setInput(prompt);
        // 少しディレイを置いてから送信（UIフィードバックのため）
        setTimeout(() => handleSend(undefined, prompt), 100);
    };

    const handleSend = async (e?: React.FormEvent, overrideInput?: string) => {
        e?.preventDefault();
        const messageText = overrideInput || input;
        if (!messageText.trim() || isLoading || !user) return;

        const userMessage: Message = { role: "user", content: messageText };
        setMessages(prev => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            let tasksCache = [];
            let calCache = [];

            let shoppingLocs = SHOPPING_LOCATIONS;

            if (user && db) {
                const calDoc = await getDoc(doc(db, "users", user.uid, "google_cache", "calendar"));
                if (calDoc.exists()) {
                    calCache = calDoc.data().events || [];
                }

                const tasksDoc = await getDoc(doc(db, "users", user.uid, "google_cache", "tasks"));
                if (tasksDoc.exists()) {
                    const googleTasks = tasksDoc.data().items || [];
                    const metaSnap = await getDocs(collection(db, "users", user.uid, "tasks_metadata"));
                    const metadataMap = new Map();
                    metaSnap.forEach(snap => metadataMap.set(snap.id, snap.data()));

                    tasksCache = googleTasks.map((t: any) => {
                        const meta = metadataMap.get(t.id);
                        return {
                            ...t,
                            place: meta?.place || "2nd",
                            importance: meta?.importance || 2,
                            urgency: meta?.urgency || 2,
                            taskType: meta?.task_type || 'todo',
                            createdAt: meta?.created_at
                        };
                    });
                }

                const shoppingDoc = await getDoc(doc(db, "users", user.uid, "settings", "shopping"));
                if (shoppingDoc.exists() && Array.isArray(shoppingDoc.data().locations)) {
                    shoppingLocs = shoppingDoc.data().locations;
                }
            }

            const res = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    userProfile: profile,
                    contextData: {
                        tasks: tasksCache,
                        calendarEvents: calCache,
                        shoppingLocations: shoppingLocs
                    },
                    mode: overrideInput ? 'action' : 'chat' // モードを付与
                })
            });

            if (!res.ok) throw new Error("Chat failed");
            const data = await res.json();
            let content = data.content;

            // タスク提案の抽出 (単一/複数の両対応)
            const singleTaskMatch = content.match(/\[TASK_PROPOSED:\s*(\{[\s\S]*?\})\]/);
            const multiTasksMatch = content.match(/\[TASKS_PROPOSED:\s*(\[[\s\S]*?\])\]/);

            let extractedTasks: any[] = [];
            if (multiTasksMatch) {
                try {
                    extractedTasks = JSON.parse(multiTasksMatch[1]);
                    content = content.replace(/\[TASKS_PROPOSED:[\s\S]*?\]/, "").trim();
                } catch (e) {
                    console.error("Tasks parsing error from chat:", e);
                }
            } else if (singleTaskMatch) {
                try {
                    const proposedTask = JSON.parse(singleTaskMatch[1]);
                    extractedTasks = [proposedTask];
                    content = content.replace(/\[TASK_PROPOSED:[\s\S]*?\]/, "").trim();
                } catch (e) {
                    console.error("Task parsing error from chat:", e);
                }
            }

            if (extractedTasks.length > 0 && onTaskProposed) {
                onTaskProposed(extractedTasks);
            }

            setMessages(prev => [...prev, { role: "assistant", content }]);
        } catch (error) {
            console.error("Chat Error:", error);
            setMessages(prev => [...prev, { role: "assistant", content: "すみません、少し調子が悪いみたいです。もう一度お話しいただけますか？" }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={`fixed bottom-0 left-0 right-0 z-30 transition-all duration-300 ease-in-out ${isExpanded ? "h-[92dvh]" : "h-24"} bg-white/90 backdrop-blur-xl border-t border-gray-200 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)] rounded-t-[2.5rem] flex flex-col overflow-hidden`}>
            {/* ヘッダー/インジケーター */}
            <div
                className="h-10 flex items-center justify-center cursor-pointer shrink-0 relative"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="w-12 h-1.5 bg-gray-200 rounded-full mb-1" />

                {isExpanded && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setMessages([{ role: "assistant", content: "チャット履歴をクリアしました。何か他にお手伝いしましょうか？" }]);
                        }}
                        className="absolute left-6 text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="履歴をクリア"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}

                {isExpanded ? <ChevronDown className="absolute right-6 w-5 h-5 text-gray-400" /> : <ChevronUp className="absolute right-6 w-5 h-5 text-gray-400" />}
            </div>

            {/* クイックアクションボタン */}
            <div className={`px-6 py-3 flex gap-2 overflow-x-auto no-scrollbar shrink-0 transition-opacity duration-300 ${isExpanded ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                <button
                    onClick={() => handleQuickAction('summarize')}
                    className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-blue-100 transition-colors border border-blue-100 shadow-sm"
                >
                    <LayoutDashboard className="w-3.5 h-3.5" />
                    今日の要約
                </button>
                <button
                    onClick={() => handleQuickAction('summarize10')}
                    className="flex items-center gap-2 bg-purple-50 text-purple-700 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-purple-100 transition-colors border border-purple-100 shadow-sm"
                >
                    <CalendarDays className="w-3.5 h-3.5" />
                    10日間の要約
                </button>
                <button
                    onClick={() => handleQuickAction('organize')}
                    className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-indigo-100 transition-colors border border-indigo-100 shadow-sm"
                >
                    <ListChecks className="w-3.5 h-3.5" />
                    タスク整理・分割
                </button>
                <button
                    onClick={() => handleQuickAction('encourage')}
                    className="flex items-center gap-2 bg-pink-50 text-pink-700 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-pink-100 transition-colors border border-pink-100 shadow-sm"
                >
                    <Heart className="w-3.5 h-3.5" />
                    励まして
                </button>
            </div>

            {/* チャット履歴 (展開時のみ表示) */}
            <div
                ref={scrollRef}
                className={`flex-1 overflow-y-auto px-6 space-y-4 py-2 transition-opacity duration-300 ${isExpanded ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            >
                {messages.map((m, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                        <div className={`max-w-[85%] rounded-2xl p-4 text-sm shadow-sm flex flex-col gap-2 ${m.role === "user"
                            ? "bg-blue-600 text-white rounded-tr-none"
                            : "bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200"
                            }`}>
                            <div className="flex items-center justify-between opacity-70">
                                <div className="flex items-center gap-2">
                                    {m.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                                    <span className="text-[10px] font-bold uppercase tracking-widest">
                                        {m.role === "user" ? "You" : "Buddy"}
                                    </span>
                                </div>
                                {m.role === "assistant" && (
                                    <button
                                        onClick={() => {
                                            if (speakingIndex === i) {
                                                stopSpeaking();
                                            } else {
                                                speak(m.content, i);
                                            }
                                        }}
                                        className="p-1.5 hover:bg-black/5 rounded-full transition-colors active:scale-90"
                                        title={speakingIndex === i ? "読み上げ停止" : "読み上げる"}
                                    >
                                        {speakingIndex === i ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                                    </button>
                                )}
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                        </div>
                    </motion.div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-2xl p-4 border border-gray-200">
                            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                        </div>
                    </div>
                )}
            </div>

            {/* 入力エリア (ボイスファーストUI) */}
            <div className="p-4 px-6 shrink-0 bg-white space-y-3">
                <div className="flex items-center gap-4">
                    <form
                        onSubmit={handleSend}
                        className="flex-1 flex items-center gap-3 bg-gray-100 rounded-full px-4 py-2 border border-gray-200 focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:bg-white transition-all"
                    >
                        <Sparkles className="w-5 h-5 text-indigo-500 shrink-0" />
                        <input
                            type="text"
                            placeholder="バディに相談・雑談..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onFocus={() => setIsExpanded(true)}
                            className="flex-1 bg-transparent border-none py-2 text-sm focus:outline-none text-gray-800"
                        />
                        {input.trim() ? (
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="bg-blue-600 text-white p-2 rounded-full shadow-md disabled:opacity-30 transition-all active:scale-90"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </button>
                        ) : (
                            <div className="w-8" />
                        )}
                    </form>
                </div>

                {/* メインのマイクボタン (音声70%の象徴) */}
                <div className="flex flex-col items-center">
                    <motion.button
                        whileTap={{ scale: 0.9 }}
                        animate={isListening ? { scale: [1, 1.1, 1] } : {}}
                        transition={isListening ? { repeat: Infinity, duration: 1.5 } : {}}
                        onClick={toggleListening}
                        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${isListening ? "bg-red-500 text-white shadow-red-200" : "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-blue-200"}`}
                    >
                        {isListening ? <MicOff className="w-6 h-6 animate-pulse" /> : <Mic className="w-6 h-6" />}
                    </motion.button>
                    <p className="text-[10px] text-gray-400 mt-2 font-bold tracking-widest uppercase">
                        {isListening ? "Listening..." : "Talk to Buddy"}
                    </p>
                </div>
            </div>
        </div>
    );
}
