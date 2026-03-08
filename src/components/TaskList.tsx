"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { PlaceType } from "@/lib/constants";
import { AppTask, GoogleTask, TaskMetadata } from "@/lib/types";
import { Check, Clock, AlertTriangle } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import { Zap, AlertCircle, Edit2, RotateCw, X, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { RoutineConfig } from "@/lib/types";

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
    const { user, googleAccessToken } = useAuth();
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

    useEffect(() => {
        if (!googleAccessToken) {
            setLoading(false);
            return;
        }

        const fetchTasks = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch("/api/tasks", {
                    headers: { Authorization: `Bearer ${googleAccessToken}` },
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(`エラー (${res.status}): ${errData.error || "API呼び出し失敗"}`);
                }

                const data = await res.json();

                const metadataMap = new Map<string, TaskMetadata>();
                if (user) {
                    const metadataSnapshot = await getDocs(collection(db, "users", user.uid, "tasks_metadata"));
                    metadataSnapshot.forEach(doc => {
                        metadataMap.set(doc.id, doc.data() as TaskMetadata);
                    });
                }

                const formattedTasks: AppTask[] = (data.tasks || []).map((t: GoogleTask) => {
                    const meta = metadataMap.get(t.id);
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
                    };
                });

                setTasks(formattedTasks.filter(t => t.place === place));
            } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "タスクの取得に失敗しました");
            } finally {
                setLoading(false);
            }
        };

        fetchTasks();
    }, [googleAccessToken, user, place]);

    const handleUpdateMetadata = async () => {
        if (!user || !editingTask) return;
        setIsUpdating(true);
        try {
            // Google Tasks の期限を更新 (変更がある場合)
            if (editDueDate !== (editingTask.dueDate ? editingTask.dueDate.split('T')[0] : "")) {
                await fetch("/api/tasks", {
                    method: "PATCH", // または PUT。プロジェクトのAPI実装に合わせる
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${googleAccessToken}`
                    },
                    body: JSON.stringify({
                        id: editingTask.id,
                        due: editDueDate ? new Date(editDueDate).toISOString() : null
                    })
                });
            }

            await setDoc(doc(db, "users", user.uid, "tasks_metadata", editingTask.id), {
                google_task_id: editingTask.id,
                place: editingTask.place,
                importance: editImportance,
                urgency: editUrgency,
                is_routine: editIsRoutine,
                routine_config: editRoutineConfig,
                updated_at: new Date().toISOString()
            }, { merge: true });

            setTasks(prev => prev.map(t =>
                t.id === editingTask.id
                    ? { ...t, importance: editImportance, urgency: editUrgency, isRoutine: editIsRoutine, routineConfig: editRoutineConfig, dueDate: editDueDate ? new Date(editDueDate).toISOString() : undefined }
                    : t
            ));
            setEditingTask(null);
        } catch (err) {
            console.error("Update error:", err);
            alert("更新に失敗しました");
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
    };

    const placeTasks = tasks.filter(t => t.status === "needsAction");

    if (loading) return <div className="flex justify-center items-center py-10"><Loader2 className="animate-spin h-8 w-8 text-gray-400" /></div>;
    if (error) return <div className="p-6 text-center text-red-500 bg-red-50 rounded-2xl border border-red-100"><AlertTriangle className="mx-auto mb-2" />{error}</div>;

    return (
        <div className="space-y-3 pb-24">
            {placeTasks.map(task => (
                <div key={task.id} className="bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-sm border border-white/50 flex items-start gap-4 hover:shadow-md transition-shadow">
                    <button className="mt-0.5 w-5 h-5 shrink-0 rounded border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors">
                        <Check className="w-3 h-3 text-transparent hover:text-gray-400" />
                    </button>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditModal(task)}>
                        <h3 className="text-gray-900 font-medium text-sm truncate">{task.title}</h3>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            {task.dueDate && (
                                <div className="flex items-center gap-1 text-[10px] text-gray-600 bg-gray-100 px-2 py-1 rounded-md">
                                    <Clock className="w-3 h-3" />
                                    <span>{new Date(task.dueDate).toLocaleDateString()}</span>
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
                                <section>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">{editingTask.title}</h3>
                                    <p className="text-xs text-gray-400">詳細設定を行います</p>
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
