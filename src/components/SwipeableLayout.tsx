/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlaceType, PLACES } from "@/lib/constants";
import { Mic, Plus, Send, X, Sparkles, Zap, AlertCircle, RotateCw, Calendar as CalendarIcon, ChevronDown, ChevronUp, User, LogOut, Activity } from "lucide-react";
import TaskList from "./TaskList";
import ChatBuddy from "./ChatBuddy";
import WeightTracker from "./WeightTracker";
import { useAuth } from "@/contexts/AuthContext";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AIParsedTask } from "@/app/api/ai/parse-task/route";
import { RoutineConfig } from "@/lib/types";
import { useSync } from "@/hooks/useSync";

export default function SwipeableLayout({ onEditProfile }: { onEditProfile?: () => void }) {
    const { user, profile, googleAccessToken, googleRefreshToken, signOut, connectGoogleTasks } = useAuth();
    const [activePlaceId, setActivePlaceId] = useState<PlaceType>("2nd");
    const [refreshKey, setRefreshKey] = useState(0);

    // 新規タスク追加用のState
    const [isAddingTask, setIsAddingTask] = useState(false);
    const [newTaskTitle, setNewTaskTitle] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDetails, setShowDetails] = useState(false); // 詳細設定の開閉

    // データ同期用フック
    const { syncData, syncError, isSyncing } = useSync();

    // 初回マウント時＋認証情報変更時にバックグラウンドで最新データをFirebaseへ同期
    useEffect(() => {
        syncData();
    }, [syncData]);

    // 詳細設定用State
    const [addImportance, setAddImportance] = useState(2);
    const [addUrgency, setAddUrgency] = useState(2);
    const [addDueDate, setAddDueDate] = useState("");
    const [addIsRoutine, setAddIsRoutine] = useState(false);
    const [addRoutineConfig, setAddRoutineConfig] = useState<RoutineConfig>({ type: 'none' });
    const [addIsFrog, setAddIsFrog] = useState(false);

    // AI提案用のState
    const [proposedTasks, setProposedTasks] = useState<AIParsedTask[] | null>(null);

    // ユーザーメニュー(ログアウト等)の開閉State
    const [showUserMenu, setShowUserMenu] = useState(false);

    // 体重管理ミニアプリの開閉State
    const [showWeightTracker, setShowWeightTracker] = useState(false);

    const activePlaceIndex = PLACES.findIndex(p => p.id === activePlaceId);
    const activePlace = PLACES[activePlaceIndex];

    // タブ切り替えハンドラ
    const handleTabClick = (id: PlaceType) => {
        setActivePlaceId(id);
        setIsAddingTask(false); // タブを切り替えたら入力バーを閉じる
    };

    // タスク追加処理
    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskTitle.trim() || !user || (!googleAccessToken && !googleRefreshToken) || !db) return;
        setIsSubmitting(true);
        try {
            // 1. Google Tasks に追加
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (googleAccessToken) headers["Authorization"] = `Bearer ${googleAccessToken}`;
            if (googleRefreshToken) headers["x-google-refresh-token"] = googleRefreshToken;

            const res = await fetch("/api/tasks", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    title: newTaskTitle,
                    due: addDueDate ? new Date(addDueDate).toISOString() : null
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.details || "API Error");
            }
            const data = await res.json();

            // 2. Firestore にメタデータを追加
            if (db) { // dbがnullでないことを確認
                await setDoc(doc(db, "users", user.uid, "tasks_metadata", data.id), {
                    google_task_id: data.id,
                    place: activePlaceId,
                    importance: addImportance,
                    urgency: addUrgency,
                    is_routine: addIsRoutine,
                    routine_config: addRoutineConfig,
                    is_frog: addIsFrog,
                    created_at: new Date().toISOString()
                });
            }


            // 3. 成功したらリセット & リストをリロードする
            setNewTaskTitle("");
            setIsAddingTask(false);
            setShowDetails(false);
            // 初期値に戻す
            setAddImportance(2);
            setAddUrgency(2);
            setAddDueDate("");
            setAddIsRoutine(false);
            setAddRoutineConfig({ type: 'none' });
            setRefreshKey(prev => prev + 1);

            // Googleに追加した新規タスクをFirestoreキャッシュにも即座に反映
            await syncData();
        } catch (error) {
            console.error("Task add error:", error);
            alert("タスクの追加に失敗しました。詳細をご確認ください。");
        } finally {
            setIsSubmitting(false);
        }
    };

    // AIによる文章解析処理
    const handleAIParse = async () => {
        if (!newTaskTitle.trim() || !user) return;
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/ai/parse-task", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: newTaskTitle,
                    userProfile: profile
                })
            });
            if (!res.ok) throw new Error("AI解析に失敗しました");
            const data = await res.json();
            setProposedTasks(data.tasks);
        } catch (error) {
            console.error("AI Parse Error:", error);
            alert("AIによる解析ができませんでした。APIキーの設定を確認してください。");
        } finally {
            setIsSubmitting(false);
        }
    };

    // AI提案を一括保存する処理
    const handleSaveProposedTasks = async () => {
        if (!proposedTasks || !user || (!googleAccessToken && !googleRefreshToken)) return;
        setIsSubmitting(true);
        try {
            for (const task of proposedTasks) {
                // 1. Google Tasksに追加
                const headers: Record<string, string> = {
                    "Content-Type": "application/json",
                };
                if (googleAccessToken) headers["Authorization"] = `Bearer ${googleAccessToken}`;
                if (googleRefreshToken) headers["x-google-refresh-token"] = googleRefreshToken;

                const res = await fetch("/api/tasks", {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        title: task.title,
                        notes: task.notes,
                        dueDate: task.dueDate
                    })
                });
                if (!res.ok) continue;
                const gTask = await res.json();

                // 2. Firestoreにメタデータを追加
                if (db) {
                    await setDoc(doc(db, "users", user.uid, "tasks_metadata", gTask.id), {
                        google_task_id: gTask.id,
                        place: task.place,
                        importance: task.importance,
                        urgency: task.urgency,
                        is_frog: (task as any).isFrog || (task as any).is_frog || false,
                        created_at: new Date().toISOString()
                    });
                }
            }
            setProposedTasks(null);
            setNewTaskTitle("");
            setIsAddingTask(false);
            setRefreshKey(prev => prev + 1);

            // Googleに追加した新規タスクをFirestoreキャッシュにも即座に反映
            await syncData();
        } catch (error) {
            console.error("Bulk Save Error:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={`flex flex-col h-[100dvh] w-full transition-colors duration-500 bg-gradient-to-br ${activePlace.color}`}>

            {/* 1. 上部タブナビゲーション */}
            <header className="pt-12 pb-4 px-6 z-10 relative">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Task Buddy</h1>
                    <div className="relative">
                        <button
                            onClick={() => setShowUserMenu(!showUserMenu)}
                            className="w-10 h-10 rounded-full bg-white/50 backdrop-blur-sm border border-white/50 shadow-sm flex items-center justify-center hover:bg-white/80 transition-colors active:scale-95 overflow-hidden"
                        >
                            {user?.photoURL ? (
                                <div className="w-full h-full relative">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                                </div>
                            ) : (
                                <User className="w-5 h-5 text-gray-600" />
                            )}
                        </button>

                        <AnimatePresence>
                            {showUserMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        className="absolute right-0 top-12 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden"
                                    >
                                        <div className="p-3 border-b border-gray-100">
                                            <p className="text-sm font-bold text-gray-900 truncate">{profile?.nickname || user?.displayName || 'User'}</p>
                                            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                                        </div>
                                        <div className="p-2 space-y-1">
                                            {onEditProfile && (
                                                <button
                                                    onClick={() => { setShowUserMenu(false); onEditProfile(); }}
                                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-xl flex items-center gap-2 transition-colors"
                                                >
                                                    <User className="w-4 h-4 text-gray-400" />
                                                    プロフィールの設定
                                                </button>
                                            )}
                                            <button
                                                onClick={async () => {
                                                    setShowUserMenu(false);
                                                    await signOut();
                                                    window.location.reload();
                                                }}
                                                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl flex items-center gap-2 transition-colors"
                                            >
                                                <LogOut className="w-4 h-4 text-red-500" />
                                                ログアウト
                                            </button>
                                        </div>
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
                {/* 3 Place Tabs */}
                <div className="flex bg-white/40 p-1.5 rounded-2xl backdrop-blur-md relative">
                    {PLACES.map((place) => {
                        const isActive = place.id === activePlaceId;
                        const Icon = place.icon;

                        return (
                            <button
                                key={place.id}
                                onClick={() => handleTabClick(place.id)}
                                className={`flex-1 flex flex-col items-center justify-center py-2.5 rounded-xl relative transition-colors ${isActive ? "text-white" : "text-gray-500 hover:text-gray-700"
                                    }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="activePlaceBg"
                                        className={`absolute inset-0 rounded-xl shadow-md ${activePlace.activeBg}`}
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    />
                                )}
                                <div className="relative z-10 flex flex-col items-center">
                                    <Icon className="w-5 h-5 mb-1" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">{place.label}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </header>

            {/* 同期エラーの表示 (特に認証エラー関連) */}
            <AnimatePresence>
                {syncError && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, scale: 0.9 }}
                        animate={{ opacity: 1, height: 'auto', scale: 1 }}
                        exit={{ opacity: 0, height: 0, scale: 0.9 }}
                        className="z-10 px-6 pb-2"
                    >
                        <div className="p-4 text-center text-red-500 bg-red-50/90 backdrop-blur-sm rounded-2xl border border-red-100 flex flex-col items-center shadow-sm relative overflow-hidden">
                            <div className="flex items-center gap-2 mb-3 z-10">
                                <AlertCircle className="w-5 h-5 shrink-0" />
                                <p className="font-bold text-xs">Googleアカウントの認証期限が切れています</p>
                            </div>
                            <button
                                onClick={() => connectGoogleTasks()}
                                className="z-10 px-5 py-2.5 text-xs bg-red-500 hover:bg-red-600 active:scale-95 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
                            >
                                <RotateCw className="w-4 h-4" />
                                Googleに再接続する
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 2. メインコンテンツエリア (スワイプ可能領域) */}
            <div className="flex-1 relative overflow-hidden">
                <AnimatePresence initial={false} mode="wait">
                    <motion.div
                        key={activePlaceId}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-0 px-6 overflow-y-auto pb-32" // FABのスペースを空ける
                    >
                        <div className="py-4">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className={`text-xl font-bold mb-1 ${activePlace.textColor}`}>
                                        {activePlace.label} Tasks
                                    </h2>
                                    <p className="text-sm text-gray-500">{activePlace.description}</p>
                                </div>
                                {activePlaceId === '1st' && (
                                    <button
                                        onClick={() => setShowWeightTracker(true)}
                                        className="mt-1 w-12 h-12 rounded-2xl bg-white/60 backdrop-blur-md text-pink-500 border border-white shadow-sm flex flex-col items-center justify-center hover:bg-white/80 transition-all active:scale-95 shrink-0 group"
                                        title="体重管理を開く"
                                    >
                                        <Activity className="w-6 h-6 mb-0.5 group-hover:scale-110 transition-transform" />
                                        <span className="text-[8px] font-bold uppercase tracking-tighter">Weight</span>
                                    </button>
                                )}
                            </div>

                            {/* タスクリストコンポーネントの配置 */}
                            <TaskList key={`${activePlace.id}-${refreshKey}`} place={activePlace.id} />

                            {/* チャットエリア用の余白 */}
                            <div className="h-40" />
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* AIチャット (常駐) */}
            <ChatBuddy onTaskProposed={setProposedTasks} />

            {/* 3. タスク追加用 入力エリア or FAB */}
            <div className="fixed bottom-28 left-0 right-0 z-20 pointer-events-none">
                <AnimatePresence mode="wait">
                    {isAddingTask ? (
                        <motion.div
                            key="input-bar"
                            initial={{ y: "100%", opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: "100%", opacity: 0 }}
                            className="bg-white px-6 py-4 pb-8 shadow-[0_-10px_40px_-5px_rgba(0,0,0,0.1)] rounded-t-[2.5rem] pointer-events-auto border-t border-gray-100 max-h-[85vh] overflow-y-auto"
                        >
                            <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

                            <form onSubmit={handleAddTask} className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => { setIsAddingTask(false); setShowDetails(false); }}
                                        className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors shrink-0"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder={`${activePlace.label}のタスクを入力...`}
                                        value={newTaskTitle}
                                        onChange={(e) => setNewTaskTitle(e.target.value)}
                                        disabled={isSubmitting}
                                        className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all text-gray-800"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAIParse}
                                        disabled={!newTaskTitle.trim() || isSubmitting}
                                        className="p-3.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                                    >
                                        <Sparkles className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* 詳細設定のトグルボタン */}
                                <button
                                    type="button"
                                    onClick={() => setShowDetails(!showDetails)}
                                    className="w-full flex items-center justify-between px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-widest hover:bg-gray-50 rounded-xl transition-all"
                                >
                                    <span>詳細設定 (重要度・期限・繰り返し)</span>
                                    {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>

                                {showDetails && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-6 px-1">
                                        <div className="grid grid-cols-2 gap-6">
                                            <section>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3 flex items-center gap-1.5"><Zap className="w-3 h-3" />重要度</label>
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {[1, 2, 3, 4].map(v => (
                                                        <button key={v} type="button" onClick={() => setAddImportance(v)} className={`py-2.5 text-xs rounded-xl border transition-all ${addImportance === v ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20" : "bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100"}`}>{v}</button>
                                                    ))}
                                                </div>
                                            </section>
                                            <section>
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" />緊急度</label>
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {[1, 2, 3, 4].map(v => (
                                                        <button key={v} type="button" onClick={() => setAddUrgency(v)} className={`py-2.5 text-xs rounded-xl border transition-all ${addUrgency === v ? "bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/20" : "bg-gray-50 text-gray-500 border-gray-100 hover:bg-gray-100"}`}>{v}</button>
                                                    ))}
                                                </div>
                                            </section>
                                        </div>

                                        <section>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3 flex items-center gap-1.5"><CalendarIcon className="w-3 h-3" />期限</label>
                                            <input
                                                type="date" value={addDueDate} onChange={(e) => setAddDueDate(e.target.value)}
                                                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 px-5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                                            />
                                        </section>

                                        <section className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><RotateCw className="w-3 h-3" />繰り返し</label>
                                                <button type="button" onClick={() => setAddIsRoutine(!addIsRoutine)} className={`w-10 h-5 rounded-full transition-colors relative ${addIsRoutine ? "bg-green-500" : "bg-gray-200"}`}>
                                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${addIsRoutine ? "left-5.5" : "left-0.5"}`} />
                                                </button>
                                            </div>
                                            {addIsRoutine && (
                                                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                                                    <select
                                                        value={addRoutineConfig.type}
                                                        onChange={(e) => setAddRoutineConfig({ ...addRoutineConfig, type: e.target.value as any })}
                                                        className="w-full bg-white border border-gray-100 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-green-500/20 outline-none"
                                                    >
                                                        <option value="daily">毎日</option>
                                                        <option value="weekly">毎週 (曜日指定)</option>
                                                        <option value="monthly_day">毎月 (日指定)</option>
                                                        <option value="yearly">毎年 (月日指定)</option>
                                                    </select>
                                                    {addRoutineConfig.type === 'weekly' && (
                                                        <div className="flex justify-between">
                                                            {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                                                                <button key={i} type="button" onClick={() => { const days = addRoutineConfig.days || []; setAddRoutineConfig({ ...addRoutineConfig, days: days.includes(i) ? days.filter(x => x !== i) : [...days, i] }); }} className={`w-8 h-8 rounded-full text-[10px] font-bold transition-all ${addRoutineConfig.days?.includes(i) ? "bg-green-600 text-white" : "bg-white text-gray-400 border border-gray-100"}`}>{d}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </section>

                                        {/* カエル設定 */}
                                        <section>
                                            <div className="flex items-center justify-between p-4 bg-green-50/50 rounded-2xl border border-green-100/50">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xl">🐸</span>
                                                    <div>
                                                        <p className="text-[10px] font-bold text-green-700 uppercase tracking-widest">カエルを食べてしまえ</p>
                                                        <p className="text-[9px] text-green-600/70 font-medium">最優先かつ気が進まないタスクに設定</p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setAddIsFrog(!addIsFrog)}
                                                    className={`w-10 h-5 rounded-full transition-colors relative ${addIsFrog ? "bg-green-500" : "bg-gray-200"}`}
                                                >
                                                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${addIsFrog ? "left-5.5" : "left-0.5"}`} />
                                                </button>
                                            </div>
                                        </section>
                                    </motion.div>
                                )}

                                <button
                                    type="submit"
                                    disabled={!newTaskTitle.trim() || isSubmitting}
                                    className={`w-full py-4 rounded-3xl font-bold shadow-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${!newTaskTitle.trim() || isSubmitting ? "bg-gray-100 text-gray-300" : "bg-gray-900 text-white hover:bg-black"}`}
                                >
                                    {isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Send className="w-4 h-4" /> タスクを登録</>}
                                </button>
                            </form>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="fab"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="absolute bottom-8 right-6 flex items-center justify-end gap-3"
                        >
                            {/* 音声入力ボタン */}
                            <button className="w-14 h-14 bg-white text-gray-700 rounded-full shadow-lg border border-gray-100 flex items-center justify-center pointer-events-auto hover:bg-gray-50 active:scale-95 transition-all">
                                <Mic className="w-6 h-6" />
                            </button>
                            {/* テキスト追加ボタン */}
                            <button
                                onClick={() => setIsAddingTask(true)}
                                className={`w-14 h-14 ${activePlace.activeBg} text-white rounded-full shadow-lg shadow-${activePlace.activeBg}/30 flex items-center justify-center pointer-events-auto hover:brightness-110 active:scale-95 transition-all`}
                            >
                                <Plus className="w-6 h-6" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* AI提案確認モーダル/パネル */}
            <AnimatePresence>
                {proposedTasks && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm p-4 pb-20"
                    >
                        <motion.div
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
                        >
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                        <Sparkles className="w-5 h-5 text-indigo-600" />
                                        AI秘書からの提案
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">以下のタスクに分解して登録しますか？</p>
                                </div>
                                <button
                                    onClick={() => setProposedTasks(null)}
                                    className="p-2 hover:bg-white rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                                {proposedTasks.map((task, idx) => (
                                    <div key={idx} className="bg-gray-50 rounded-xl p-4 border border-gray-200/50">
                                        <div className="flex justify-between items-start gap-3">
                                            <h4 className="font-bold text-gray-900 text-sm">{task.title}</h4>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${task.place === "1st" ? "bg-green-50 text-green-700 border-green-200" :
                                                task.place === "2nd" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                                    task.place === "3rd" ? "bg-purple-50 text-purple-700 border-purple-200" :
                                                        "bg-rose-50 text-rose-700 border-rose-200"
                                                }`}>
                                                {task.place === "1st" ? "Home" : task.place === "2nd" ? "Work" : task.place === "3rd" ? "Hobby" : "Shopping"}
                                            </span>
                                        </div>
                                        {task.notes && <p className="text-xs text-gray-500 mt-1">{task.notes}</p>}
                                        <div className="flex gap-2 mt-2">
                                            <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-400">
                                                重要度: {task.importance} / 緊急度: {task.urgency}
                                            </span>
                                            {task.dueDate && (
                                                <span className="text-[10px] bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-400">
                                                    期限: {new Date(task.dueDate).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="p-6 bg-gray-50 border-t border-gray-100">
                                <button
                                    onClick={handleSaveProposedTasks}
                                    disabled={isSubmitting}
                                    className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>全部まとめて登録する</>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <AnimatePresence>
                {showWeightTracker && (
                    <WeightTracker onClose={() => setShowWeightTracker(false)} />
                )}
            </AnimatePresence>
        </div>
    );
}
