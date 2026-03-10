/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { AppTask, GoogleTask, TaskMetadata, RoutineConfig } from "@/lib/types";
import { Check, Clock, AlertTriangle } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { Calendar as CalendarIcon, MoreVertical, Loader2, RotateCw, X, Trash2, Sparkles } from "lucide-react";
import { PLACES, PlaceType } from "@/lib/constants";
import { calculateNextRoutineDate, getDaysSince } from "@/lib/dateUtils";
import { useSync } from "@/hooks/useSync";
import { Search } from "lucide-react";

// 重要度のラベルと色を返すヘルパー関数
const getImportanceStyles = (p: number) => {
    switch (p) {
        case 4: return { label: "重要度: 極高", color: "bg-red-100 text-red-700 border-red-200" };
        case 3: return { label: "重要度: 高", color: "bg-orange-100 text-orange-700 border-orange-200" };
        case 2: return { label: "重要度: 中", color: "bg-blue-100 text-blue-700 border-blue-200" };
        case 1: return { label: "重要度: 低", color: "bg-gray-100 text-gray-600 border-gray-200" };
        default: return { label: "重要度: 中", color: "bg-gray-100 text-gray-500 border-gray-200" };
    }
};

// 緊急度のラベルと色を返すヘルパー関数
const getUrgencyStyles = (u: number) => {
    switch (u) {
        case 4: return { label: "緊急度: 極高", color: "bg-purple-100 text-purple-700 border-purple-200" };
        case 3: return { label: "緊急度: 高", color: "bg-pink-100 text-pink-700 border-pink-200" };
        case 2: return { label: "緊急度: 中", color: "bg-teal-100 text-teal-700 border-teal-200" };
        case 1: return { label: "緊急度: 低", color: "bg-gray-100 text-gray-600 border-gray-200" };
        default: return { label: "緊急度: 中", color: "bg-gray-100 text-gray-500 border-gray-200" };
    }
};

export default function TaskList({ place }: { place: PlaceType }) {
    const { user, googleAccessToken, googleRefreshToken, connectGoogleTasks } = useAuth();
    const [tasks, setTasks] = useState<AppTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingTask, setEditingTask] = useState<AppTask | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);

    // 編集モーダル用のState
    const [editImportance, setEditImportance] = useState(2);
    const [editUrgency, setEditUrgency] = useState(2);
    const [editIsRoutine, setEditIsRoutine] = useState(false);
    const [editRoutineConfig, setEditRoutineConfig] = useState<RoutineConfig>({ type: 'none' });
    const [editDueDate, setEditDueDate] = useState("");
    const [editPlace, setEditPlace] = useState<PlaceType>("2nd");
    const [editTitle, setEditTitle] = useState("");
    const [editNotes, setEditNotes] = useState("");

    const { syncData } = useSync();

    const [googleTasks, setGoogleTasks] = useState<GoogleTask[]>([]);
    const [taskMetadataMap, setTaskMetadataMap] = useState<Map<string, TaskMetadata>>(new Map());
    const [searchQuery, setSearchQuery] = useState("");
    const [editTaskType, setEditTaskType] = useState<'todo' | 'wish'>('todo');

    // 1. Firestoreからデータをリアルタイム購読
    useEffect(() => {
        if (!user || !db) {
            setLoading(false);
            if (user && (!googleAccessToken && !googleRefreshToken)) {
                setError("Googleカレンダー・タスクへの連携が必要です。再接続してください。");
            }
            return;
        }
        setError(null);

        // Googleタスクのキャッシュを購読
        const unsubscribeTasks = onSnapshot(doc(db, "users", user.uid, "google_cache", "tasks"), (docSnap) => {
            if (docSnap.exists()) {
                setGoogleTasks(docSnap.data().items || []);
            } else {
                setGoogleTasks([]);
            }
        }, (err) => {
            console.error(err);
            setError("タスク一覧の同期に失敗しました");
        });

        // タスクメタデータを購読
        const unsubscribeMeta = onSnapshot(collection(db, "users", user.uid, "tasks_metadata"), (metaSnap) => {
            const map = new Map<string, TaskMetadata>();
            metaSnap.forEach(snap => map.set(snap.id, snap.data() as TaskMetadata));
            setTaskMetadataMap(map);
            setLoading(false);
        }, (err) => {
            console.error(err);
        });

        return () => {
            unsubscribeTasks();
            unsubscribeMeta();
        };
    }, [user, db, googleAccessToken, googleRefreshToken]);

    // 2. データが更新されたらAppTask形式に結合・フィルタリング
    useEffect(() => {
        const formattedTasks: AppTask[] = googleTasks.map((t) => {
            const meta = taskMetadataMap.get(t.id);
            return {
                id: t.id,
                title: t.title,
                notes: t.notes,
                status: t.status,
                dueDate: t.due,
                place: meta?.place || "2nd",
                importance: meta?.importance || 2,
                urgency: meta?.urgency || 2,
                isRoutine: meta?.is_routine || false,
                routineConfig: meta?.routine_config || { type: 'none' },
                taskType: meta?.task_type || 'todo',
                createdAt: meta?.created_at,
            };
        });

        const filtered = formattedTasks.filter(t => {
            const matchPlace = t.place === place;
            const matchSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (t.notes || "").toLowerCase().includes(searchQuery.toLowerCase());
            return matchPlace && matchSearch;
        });
        setTasks(filtered);
    }, [googleTasks, taskMetadataMap, place, searchQuery]);

    const handleUpdateMetadata = async () => {
        if (!user || !editingTask || (!googleAccessToken && !googleRefreshToken)) return;
        setIsUpdating(true);
        try {
            // Google Tasks の基本情報を更新 (タイトル、メモ、期限に変更がある場合)
            const isTitleChanged = editTitle !== editingTask.title;
            const isNotesChanged = editNotes !== (editingTask.notes || "");
            const isDueChanged = editDueDate !== (editingTask.dueDate ? editingTask.dueDate.split('T')[0] : "");

            if (isTitleChanged || isNotesChanged || isDueChanged) {
                const headers: Record<string, string> = {
                    "Content-Type": "application/json",
                };
                if (googleAccessToken) headers["Authorization"] = `Bearer ${googleAccessToken}`;
                if (googleRefreshToken) headers["x-google-refresh-token"] = googleRefreshToken;

                await fetch("/api/tasks", {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        id: editingTask.id,
                        title: editTitle,
                        notes: editNotes,
                        due: editDueDate ? new Date(editDueDate).toISOString() : null
                    })
                });
            }
            if (db) {
                // place も含めて更新する
                await setDoc(doc(db, "users", user.uid, "tasks_metadata", editingTask.id), {
                    google_task_id: editingTask.id,
                    place: editPlace,
                    importance: editImportance,
                    urgency: editUrgency,
                    is_routine: editIsRoutine,
                    routine_config: editRoutineConfig,
                    task_type: editTaskType,
                    updated_at: new Date().toISOString(),
                    // 新規作成時のみ created_at を設定するための配慮（既存ならそのまま）
                    created_at: editingTask.createdAt || new Date().toISOString()
                }, { merge: true });
            }

            // 変更先のプレイスが現在開いているプレイスと異なる場合は、リストから外れるため再取得(またはState更新)することで即座に消える
            // (FirestoreのonSnapshotにより自動でUIは更新されるため、ローカルステートの手動更新は不要です)

            // モーダルを閉じる
            setEditingTask(null);

            // Googleに反映した変更をFirestoreキャッシュにも同期
            await syncData();
        } catch (err: any) {
            console.error(err);
            alert("タスクの更新に失敗しました");
        } finally {
            setIsUpdating(false);
        }
    };

    const handleCompleteTask = async (task: AppTask, e: React.MouseEvent) => {
        e.stopPropagation(); // モーダルが開くのを防ぐ
        if (!user || (!googleAccessToken && !googleRefreshToken)) return;

        // UI側ですぐに消えるが、念のためオプティミスティック更新としてStateからも弾く
        setGoogleTasks(prev => prev.filter(t => t.id !== task.id));

        try {
            // ルーティンタスクの場合は、次回の期日を計算して新規タスクとして再作成（クローン）する
            if (task.isRoutine && task.routineConfig && task.routineConfig.type !== 'none') {
                const nextDate = calculateNextRoutineDate(task.dueDate, task.routineConfig);

                const headers: Record<string, string> = {
                    "Content-Type": "application/json",
                };
                if (googleAccessToken) headers["Authorization"] = `Bearer ${googleAccessToken}`;
                if (googleRefreshToken) headers["x-google-refresh-token"] = googleRefreshToken;

                // 次のタスクをPOSTで作成
                const createRes = await fetch("/api/tasks", {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        title: task.title,
                        notes: task.notes,
                        dueDate: nextDate ? nextDate.toISOString() : null
                    })
                });

                if (createRes.ok) {
                    const newTaskData = await createRes.json();

                    // 新しいタスクのメタデータをFirestoreに保存
                    if (db) {
                        await setDoc(doc(db, "users", user.uid, "tasks_metadata", newTaskData.id), {
                            google_task_id: newTaskData.id,
                            place: task.place, // 元のプレイスを引き継ぐ
                            importance: task.importance,     // 重要度を引き継ぐ
                            urgency: task.urgency,           // 緊急度を引き継ぐ
                            is_routine: task.isRoutine,
                            routine_config: task.routineConfig,
                            task_type: task.taskType,
                            created_at: new Date().toISOString()
                        });
                    }
                } else {
                    console.error("Failed to create next routine task");
                }
            }

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (googleAccessToken) headers["Authorization"] = `Bearer ${googleAccessToken}`;
            if (googleRefreshToken) headers["x-google-refresh-token"] = googleRefreshToken;

            // Google Tasks APIで完了状態へ
            const res = await fetch('/api/tasks', {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    id: task.id,
                    status: 'completed'
                })
            });

            if (!res.ok) {
                // エラーの場合は元に戻す(Firestoreの再読込をトリガーするだけでも良いが、今回は簡易的に)
                alert("タスクの完了処理に失敗しました。");
            } else {
                // 完了状態をFirestoreキャッシュにも同期
                await syncData();
            }
        } catch (error) {
            console.error(error);
            alert("タスクの完了処理に失敗しました。");
        }
    };

    const handleUndoTask = async (task: AppTask, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user || (!googleAccessToken && !googleRefreshToken)) return;

        setGoogleTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'needsAction' } : t));

        try {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (googleAccessToken) headers["Authorization"] = `Bearer ${googleAccessToken}`;
            if (googleRefreshToken) headers["x-google-refresh-token"] = googleRefreshToken;

            const res = await fetch('/api/tasks', {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    id: task.id,
                    status: 'needsAction',
                    // Google Tasks APIでは、statusをneedsActionに戻す時はcompletedをnullにする必要があります（通常はAPI側で処理されますが念のため）
                    completed: null
                })
            });

            if (!res.ok) {
                alert("タスクの復元に失敗しました。");
            } else {
                await syncData();
            }
        } catch (error) {
            console.error(error);
            alert("タスクの復元に失敗しました。");
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        if (!user || (!googleAccessToken && !googleRefreshToken)) return;
        if (!confirm("このタスクを完全に削除しますか？")) return;

        setIsUpdating(true);
        try {
            const headers: Record<string, string> = {};
            if (googleAccessToken) headers["Authorization"] = `Bearer ${googleAccessToken}`;
            if (googleRefreshToken) headers["x-google-refresh-token"] = googleRefreshToken;

            const res = await fetch(`/api/tasks?id=${taskId}`, {
                method: 'DELETE',
                headers
            });

            if (!res.ok) throw new Error("Failed to delete task");

            // Firestore のメタデータも削除
            if (db) {
                await deleteDoc(doc(db, "users", user.uid, "tasks_metadata", taskId));
            }

            // UIから削除 (オプティミスティックUI)
            setGoogleTasks(prev => prev.filter(t => t.id !== taskId));
            setEditingTask(null);

            // 削除結果をFirestoreキャッシュにも同期
            await syncData();
        } catch (err: any) {
            console.error(err);
            alert("タスクの削除に失敗しました");
        } finally {
            setIsUpdating(false);
        }
    };

    const openEditModal = (task: AppTask) => {
        setEditingTask(task);
        setEditImportance(task.importance);
        setEditUrgency(task.urgency);
        setEditIsRoutine(task.isRoutine || false);
        setEditRoutineConfig(task.routineConfig || { type: 'none' });
        setEditDueDate(task.dueDate ? task.dueDate.split('T')[0] : "");
        setEditPlace(task.place);
        setEditTitle(task.title);
        setEditNotes(task.notes || "");
        setEditTaskType(task.taskType || 'todo');
    };

    const [showCompleted, setShowCompleted] = useState(false);

    const placeTasks = tasks.filter(t => t.status === "needsAction");
    const completedTasks = tasks.filter(t => t.status === "completed");

    if (loading) return <div className="flex justify-center items-center py-10"><Loader2 className="animate-spin h-8 w-8 text-gray-400" /></div>;
    if (error) return (
        <div className="p-6 text-center text-red-500 bg-red-50 rounded-2xl border border-red-100 flex flex-col items-center">
            <AlertTriangle className="mx-auto mb-2 w-8 h-8" />
            <p className="font-bold text-sm mb-4">{error}</p>
            {(error.includes("401") || error.includes("認証") || error.includes("連携") || error.includes("接続")) && (
                <button
                    onClick={() => { setError(null); connectGoogleTasks(); }}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl shadow-md transition-all"
                >
                    Googleに接続する
                </button>
            )}
        </div>
    );

    return (
        <div className="space-y-3 pb-24">
            {/* 検索バー */}
            <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    type="text"
                    placeholder="タスクを検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/50 backdrop-blur-sm border border-white/50 rounded-2xl py-3 pl-12 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all shadow-sm"
                />
            </div>

            {placeTasks.map(task => (
                <div key={task.id} className={`${task.taskType === 'wish' ? 'bg-pink-50/60 border-pink-100' : 'bg-white/80 border-white/50'} backdrop-blur-sm p-4 rounded-xl shadow-sm border flex items-start gap-4 hover:shadow-md transition-shadow group`}>
                    <button
                        onClick={(e) => handleCompleteTask(task, e)}
                        className="mt-0.5 w-5 h-5 shrink-0 rounded border border-gray-300 flex items-center justify-center hover:bg-green-50 hover:border-green-400 transition-colors"
                    >
                        <Check className="w-3 h-3 text-transparent group-hover:text-green-500 hover:text-green-600 transition-colors" />
                    </button>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditModal(task)}>
                        <div className="flex items-center gap-2">
                            {task.taskType === 'wish' && <Sparkles className="w-3 h-3 text-pink-400 shrink-0" />}
                            <h3 className="text-gray-900 font-medium text-sm truncate">{task.title}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            {task.dueDate && (
                                <div className="flex items-center gap-1 text-[10px] text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                                    <Clock className="w-3 h-3" />
                                    <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                                </div>
                            )}
                            {task.createdAt && (
                                <div className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-md ${getDaysSince(task.createdAt) > 7 ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-gray-50 text-gray-500 border border-gray-100'}`}>
                                    <span>{getDaysSince(task.createdAt)}日経過</span>
                                </div>
                            )}
                            <div className={`text-[10px] px-2 py-1 rounded-md border font-medium ${getImportanceStyles(task.importance).color}`}>
                                {getImportanceStyles(task.importance).label}
                            </div>
                            <div className={`text-[10px] px-2 py-1 rounded-md border font-medium ${getUrgencyStyles(task.urgency).color}`}>
                                {getUrgencyStyles(task.urgency).label}
                            </div>
                            {task.isRoutine && (
                                <div className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-200">
                                    <RotateCw className="w-3 h-3" />
                                    <span>ルーティン</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}

            {completedTasks.length > 0 && (
                <div className="mt-8">
                    <button
                        onClick={() => setShowCompleted(!showCompleted)}
                        className="flex items-center gap-2 text-sm text-gray-400 font-medium hover:text-gray-600 transition-colors mx-auto"
                    >
                        {showCompleted ? "完了済みタスクを隠す" : `完了済みタスクを表示 (${completedTasks.length})`}
                    </button>

                    <AnimatePresence>
                        {showCompleted && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden mt-4 space-y-3"
                            >
                                {completedTasks.map(task => (
                                    <div key={task.id} className="bg-white/40 p-4 rounded-xl border border-gray-100 flex items-start gap-4">
                                        <button
                                            onClick={(e) => handleUndoTask(task, e)}
                                            className="mt-0.5 w-5 h-5 shrink-0 rounded bg-green-500 flex items-center justify-center hover:bg-green-600 transition-colors"
                                            title="未完了に戻す"
                                        >
                                            <Check className="w-3 h-3 text-white" />
                                        </button>
                                        <div className="flex-1 min-w-0 opacity-50 line-through">
                                            <h3 className="text-gray-600 font-medium text-sm truncate">{task.title}</h3>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteTask(task.id)}
                                            className="mt-0.5 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                            title="完全に削除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            <AnimatePresence>
                {editingTask && (
                    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm overflow-y-auto pt-20">
                        <motion.div
                            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                            className="bg-white w-full max-w-lg rounded-t-[2.5rem] p-8 shadow-2xl relative min-h-[70vh] flex flex-col"
                        >
                            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6 shrink-0" />
                            <button onClick={() => setEditingTask(null)} className="absolute right-6 top-8 p-2 text-gray-400 hover:bg-gray-100 rounded-full"><X /></button>

                            <div className="flex-1 overflow-y-auto space-y-8 pr-2">
                                <section className="flex items-start justify-between">
                                    <div className="flex-1 mr-4">
                                        <input
                                            type="text"
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            className="text-xl font-bold text-gray-900 mb-1 w-full bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none"
                                            placeholder="タスク名"
                                        />
                                        <p className="text-xs text-gray-400">詳細設定を行います</p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteTask(editingTask.id)}
                                        className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex flex-col items-center shrink-0"
                                        title="タスクを削除"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                        <span className="text-[8px] mt-1 font-bold">削除</span>
                                    </button>
                                </section>

                                {/* メモ設定 */}
                                <section>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3">メモ</label>
                                    <textarea
                                        value={editNotes}
                                        onChange={(e) => setEditNotes(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 px-4 text-sm min-h-[100px] focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all resize-none"
                                        placeholder="メモを入力してください..."
                                    />
                                </section>

                                {/* タスク分類設定 */}
                                <section>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3">タスク分類</label>
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => setEditTaskType('todo')}
                                            className={`flex-1 py-4 rounded-2xl border font-bold text-sm transition-all ${editTaskType === 'todo' ? 'bg-gray-900 text-white border-gray-900 shadow-lg' : 'bg-gray-50 text-gray-400 border-gray-100'}`}
                                        >
                                            TODO (やるべき)
                                        </button>
                                        <button
                                            onClick={() => setEditTaskType('wish')}
                                            className={`flex-1 py-4 rounded-2xl border font-bold text-sm transition-all ${editTaskType === 'wish' ? 'bg-pink-500 text-white border-pink-500 shadow-lg' : 'bg-gray-50 text-gray-400 border-gray-100'}`}
                                        >
                                            WISH (やりたい)
                                        </button>
                                    </div>
                                </section>

                                {/* 所属プレイス設定 */}
                                <section>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3">所属タブ (Place)</label>
                                    <select
                                        value={editPlace}
                                        onChange={(e) => setEditPlace(e.target.value as PlaceType)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 px-4 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all appearance-none"
                                    >
                                        {PLACES.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.label}
                                            </option>
                                        ))}
                                    </select>
                                </section>

                                {/* 期限設定 */}
                                <section>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3">期限設定</label>
                                    <div className="relative">
                                        <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                                        <input
                                            type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all"
                                        />
                                    </div>
                                </section>

                                {/* 重要度と緊急度 */}
                                <div className="grid grid-cols-2 gap-4">
                                    <section>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3">重要度</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[1, 2, 3, 4].map(v => (
                                                <button key={v} onClick={() => setEditImportance(v)} className={`py-3 text-xs rounded-xl border transition-all ${editImportance === v ? "bg-blue-600 text-white border-blue-600 shadow-md" : "bg-gray-50 text-gray-500 border-gray-100"}`}>{v}</button>
                                            ))}
                                        </div>
                                    </section>
                                    <section>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-3">緊急度</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[1, 2, 3, 4].map(v => (
                                                <button key={v} onClick={() => setEditUrgency(v)} className={`py-3 text-xs rounded-xl border transition-all ${editUrgency === v ? "bg-purple-600 text-white border-purple-600 shadow-md" : "bg-gray-50 text-gray-500 border-gray-100"}`}>{v}</button>
                                            ))}
                                        </div>
                                    </section>
                                </div>

                                {/* ルーティン詳細設定 */}
                                <section className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">繰り返し設定</label>
                                        <button onClick={() => setEditIsRoutine(!editIsRoutine)} className={`w-12 h-6 rounded-full transition-colors relative ${editIsRoutine ? "bg-green-500" : "bg-gray-200"}`}>
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editIsRoutine ? "left-7" : "left-1"}`} />
                                        </button>
                                    </div>

                                    {editIsRoutine && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                                            <select
                                                value={editRoutineConfig.type}
                                                onChange={(e) => setEditRoutineConfig({ ...editRoutineConfig, type: e.target.value as any })}
                                                className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20"
                                            >
                                                <option value="daily">毎日</option>
                                                <option value="weekly">毎週 (曜日指定)</option>
                                                <option value="monthly_day">毎月 (日指定)</option>
                                                <option value="monthly_week_day">毎月 (第○×曜日)</option>
                                                <option value="yearly">毎年 (月日指定)</option>
                                            </select>

                                            {editRoutineConfig.type === 'weekly' && (
                                                <div className="flex justify-between gap-1">
                                                    {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => {
                                                                const days = editRoutineConfig.days || [];
                                                                setEditRoutineConfig({ ...editRoutineConfig, days: days.includes(i) ? days.filter(x => x !== i) : [...days, i] });
                                                            }}
                                                            className={`w-8 h-8 rounded-full text-[10px] font-bold transition-all ${editRoutineConfig.days?.includes(i) ? "bg-green-600 text-white shadow-sm" : "bg-white text-gray-400 border border-gray-200"}`}
                                                        >
                                                            {d}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {editRoutineConfig.type === 'monthly_day' && (
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs text-gray-500 shrink-0">毎月</span>
                                                    <input
                                                        type="number" min="1" max="31" value={editRoutineConfig.dayOfMonth || ""}
                                                        onChange={(e) => setEditRoutineConfig({ ...editRoutineConfig, dayOfMonth: parseInt(e.target.value) })}
                                                        className="w-20 bg-white border border-gray-200 rounded-lg py-2 px-3 text-sm"
                                                    />
                                                    <span className="text-xs text-gray-500">日</span>
                                                </div>
                                            )}

                                            {(editRoutineConfig.type === 'yearly' || editRoutineConfig.type === 'yearly_date') && (
                                                <div className="flex gap-2">
                                                    <select
                                                        value={editRoutineConfig.month || ""}
                                                        onChange={(e) => setEditRoutineConfig({ ...editRoutineConfig, month: parseInt(e.target.value) })}
                                                        className="flex-1 bg-white border border-gray-200 rounded-lg py-2 px-3 text-sm"
                                                    >
                                                        {Array.from({ length: 12 }, (_, i) => (
                                                            <option key={i + 1} value={i + 1}>{i + 1}月</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="number" min="1" max="31" placeholder="日" value={editRoutineConfig.dayOfMonth || ""}
                                                        onChange={(e) => setEditRoutineConfig({ ...editRoutineConfig, dayOfMonth: parseInt(e.target.value) })}
                                                        className="w-20 bg-white border border-gray-200 rounded-lg py-2 px-3 text-sm"
                                                    />
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </section>
                            </div>

                            <div className="mt-8 shrink-0">
                                <button
                                    onClick={handleUpdateMetadata} disabled={isUpdating}
                                    className="w-full bg-gray-900 text-white font-bold py-4 rounded-3xl shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2 active:scale-95"
                                >
                                    {isUpdating ? <Loader2 className="w-5 h-5 animate-spin" /> : "設定をすべて保存"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
