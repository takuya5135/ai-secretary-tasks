"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, User, Bot, Loader2, ChevronUp, ChevronDown, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Message = {
    role: "user" | "assistant";
    content: string;
};

export default function ChatBuddy({ onTaskProposed }: { onTaskProposed?: (tasks: any[]) => void }) {
    const { user, profile, googleAccessToken } = useAuth();
    const [messages, setMessages] = useState<Message[]>([
        { role: "assistant", content: "こんにちは！あなたの秘書のバディです。何かお手伝いできることはありますか？雑談も大歓迎ですよ！" }
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [hasSummarized, setHasSummarized] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [useSpeech, setUseSpeech] = useState(true); // 自動読み上げ設定
    const scrollRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);

    // 起動時の要約生成
    useEffect(() => {
        if (googleAccessToken && user && !hasSummarized) {
            const fetchSummary = async () => {
                try {
                    // 1. タスクとカレンダーの取得
                    const [tasksRes, calRes] = await Promise.all([
                        fetch("/api/tasks", { headers: { Authorization: `Bearer ${googleAccessToken}` } }),
                        fetch("/api/calendar", { headers: { Authorization: `Bearer ${googleAccessToken}` } })
                    ]);

                    const tasksData = await tasksRes.json();
                    const calData = await calRes.json();

                    // 2. 要約の生成
                    const sumRes = await fetch("/api/ai/summarize", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            tasks: tasksData.tasks,
                            calendarEvents: calData.events,
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
                }
            };
            fetchSummary();
        }
    }, [googleAccessToken, user, profile, hasSummarized]);

    // 音声読み上げ (TTS)
    const speak = useCallback((text: string) => {
        if (!useSpeech || typeof window === "undefined") return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "ja-JP";
        utterance.rate = 1.1;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
    }, [useSpeech]);

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

    // メッセージが追加されたら下までスクロール & 自動読み上げ
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }

        // 最後のメッセージがアシスタントの場合のみ読み上げ
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === "assistant" && hasSummarized) {
            speak(lastMessage.content);
        }
    }, [messages, hasSummarized, speak]);

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading || !user) return;

        const userMessage: Message = { role: "user", content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            const res = await fetch("/api/ai/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [...messages, userMessage],
                    userProfile: profile,
                    contextData: { /* 追加で直近の予定などを入れる場合はここ */ }
                })
            });

            if (!res.ok) throw new Error("Chat failed");
            const data = await res.json();
            let content = data.content;

            // タスク提案の抽出
            const taskMatch = content.match(/\[TASK_PROPOSED:\s*(\{.*?\})\]/);
            if (taskMatch && onTaskProposed) {
                try {
                    const proposedTask = JSON.parse(taskMatch[1]);
                    onTaskProposed([proposedTask]);
                    // タスク提案部分をメッセージからは削除（あるいは整形）
                    content = content.replace(/\[TASK_PROPOSED:.*?\]/, "").trim();
                } catch (e) {
                    console.error("Task parsing error from chat:", e);
                }
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
        <div className={`fixed bottom-0 left-0 right-0 z-30 transition-all duration-300 ease-in-out ${isExpanded ? "h-[60vh]" : "h-24"} bg-white/90 backdrop-blur-xl border-t border-gray-200 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)] rounded-t-[2.5rem] flex flex-col overflow-hidden`}>
            {/* ヘッダー/インジケーター */}
            <div
                className="h-10 flex items-center justify-center cursor-pointer shrink-0"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="w-12 h-1.5 bg-gray-200 rounded-full mb-1" />
                {isExpanded ? <ChevronDown className="absolute right-6 w-5 h-5 text-gray-400" /> : <ChevronUp className="absolute right-6 w-5 h-5 text-gray-400" />}
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
                        <div className={`max-w-[85%] rounded-2xl p-4 text-sm shadow-sm ${m.role === "user"
                            ? "bg-blue-600 text-white rounded-tr-none"
                            : "bg-gray-100 text-gray-800 rounded-tl-none border border-gray-200"
                            }`}>
                            <div className="flex items-center gap-2 mb-1 opacity-70">
                                {m.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                                <span className="text-[10px] font-bold uppercase tracking-widest">
                                    {m.role === "user" ? "You" : "Buddy"}
                                </span>
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
                    {/* 音声読み上げトグル */}
                    <button
                        onClick={() => setUseSpeech(!useSpeech)}
                        className={`p-2 rounded-lg transition-colors ${useSpeech ? "text-blue-600 bg-blue-50" : "text-gray-400 bg-gray-50"}`}
                        title={useSpeech ? "読み上げ中" : "ミュート中"}
                    >
                        {useSpeech ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </button>

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
