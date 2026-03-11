"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Plus,
    TrendingDown,
    TrendingUp,
    Scale,
    History,
    LineChart as ChartIcon,
    Trash2,
    Edit2,
    Check as CheckIcon
} from "lucide-react";
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
    ReferenceLine
} from "recharts";
import {
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    deleteDoc,
    doc,
    Timestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

type WeightRecord = {
    id: string;
    date: string; // ISO String
    weight: number;
    notes?: string;
    createdAt: Timestamp;
};

type Period = '1w' | '1m' | '6m' | '1y' | '3y';

export default function WeightTracker({ onClose }: { onClose: () => void }) {
    const { user } = useAuth();
    const [records, setRecords] = useState<WeightRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<Period>('1m');

    // 目標体重用
    const [targetWeight, setTargetWeight] = useState<number | null>(null);
    const [isEditingTarget, setIsEditingTarget] = useState(false);
    const [editTargetWeight, setEditTargetWeight] = useState("");

    // 入力フォーム用
    const [weight, setWeight] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);

    // データ購読
    useEffect(() => {
        if (!user || !db) return;

        const q = query(
            collection(db, "users", user.uid, "weight_records"),
            orderBy("date", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const newRecords = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as WeightRecord));
            setRecords(newRecords);
            setLoading(false);
        });

        // 目標体重の購読
        const unsubscribeSettings = onSnapshot(doc(db, "users", user.uid, "settings", "weight_target"), (docSnap) => {
            if (docSnap.exists() && docSnap.data().target) {
                setTargetWeight(docSnap.data().target);
                setEditTargetWeight(String(docSnap.data().target));
            } else {
                setTargetWeight(null);
                setEditTargetWeight("");
            }
        });

        return () => {
            unsubscribe();
            unsubscribeSettings();
        };
    }, [user]);

    // グラフ用データの加工
    const chartData = useMemo(() => {
        if (records.length === 0) return [];

        const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));

        // 期間に応じたフィルタリング
        const now = new Date();
        const startDate = new Date();
        if (period === '1w') startDate.setDate(now.getDate() - 7);
        else if (period === '1m') startDate.setMonth(now.getMonth() - 1);
        else if (period === '6m') startDate.setMonth(now.getMonth() - 6);
        else if (period === '1y') startDate.setFullYear(now.getFullYear() - 1);
        else if (period === '3y') startDate.setFullYear(now.getFullYear() - 3);

        const filtered = sorted.filter(r => new Date(r.date) >= startDate);

        return filtered.map(r => ({
            date: new Date(r.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
            fullDate: r.date,
            weight: r.weight
        }));
    }, [records, period]);

    // 最新の統計
    const latestWeight = records.length > 0 ? records[0].weight : null;
    const diff = records.length > 1 ? (records[0].weight - records[1].weight) : null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !db || !weight) return;

        setIsSubmitting(true);
        try {
            await addDoc(collection(db, "users", user.uid, "weight_records"), {
                date,
                weight: parseFloat(weight),
                notes,
                createdAt: Timestamp.now()
            });
            setWeight("");
            setNotes("");
            setShowForm(false);
        } catch (error) {
            console.error("Error adding record:", error);
            alert("記録に失敗しました");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!user || !db || !window.confirm("この記録を削除しますか？")) return;
        try {
            await deleteDoc(doc(db, "users", user.uid, "weight_records", id));
        } catch (error) {
            console.error("Error deleting record:", error);
        }
    };

    const handleSaveTarget = async () => {
        if (!user || !db) return;
        try {
            const val = parseFloat(editTargetWeight);
            if (isNaN(val)) {
                await setDoc(doc(db, "users", user.uid, "settings", "weight_target"), { target: null }, { merge: true });
            } else {
                await setDoc(doc(db, "users", user.uid, "settings", "weight_target"), { target: val }, { merge: true });
            }
            setIsEditingTarget(false);
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-md"
                onClick={onClose}
            />

            <motion.div
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 20, opacity: 0 }}
                className="relative w-full max-w-2xl bg-white/90 backdrop-blur-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* Header */}
                <div className="p-6 pb-2 flex justify-between items-center bg-gradient-to-r from-pink-50/50 to-blue-50/50">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Scale className="text-pink-500 w-6 h-6" />
                            体重管理
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">健康的な生活のための記録</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-white p-3 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">現在の体重</span>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-gray-900">{latestWeight || "--"}</span>
                                <span className="text-[10px] text-gray-500 font-bold">kg</span>
                            </div>
                        </div>
                        <div className="bg-white p-3 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">目標体重</span>
                            {isEditingTarget ? (
                                <div className="flex items-center gap-1 mt-0.5">
                                    <input
                                        type="number" step="0.1" autoFocus
                                        value={editTargetWeight} onChange={(e) => setEditTargetWeight(e.target.value)}
                                        className="w-14 text-center border border-pink-200 rounded text-sm font-bold focus:outline-none focus:ring-1 focus:ring-pink-500"
                                    />
                                    <button onClick={handleSaveTarget} className="p-1 bg-pink-100 text-pink-600 rounded hover:bg-pink-200 transition-colors"><CheckIcon className="w-3 h-3" /></button>
                                </div>
                            ) : (
                                <div className="flex items-baseline gap-1 group cursor-pointer" onClick={() => setIsEditingTarget(true)}>
                                    <span className="text-2xl font-black text-pink-500">{targetWeight || "--"}</span>
                                    <span className="text-[10px] text-pink-400 font-bold">kg</span>
                                    <Edit2 className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                                </div>
                            )}
                        </div>
                        <div className="bg-white p-3 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">前回比</span>
                            <div className="flex items-center gap-1">
                                {diff ? (
                                    <>
                                        {diff < 0 ? <TrendingDown className="w-3 h-3 text-green-500" /> : <TrendingUp className="w-3 h-3 text-red-500" />}
                                        <span className={`text-lg font-bold ${diff < 0 ? 'text-green-500' : 'text-red-500'}`}>
                                            {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                                        </span>
                                        <span className="text-[10px] text-gray-500 font-bold">kg</span>
                                    </>
                                ) : (
                                    <span className="text-lg font-bold text-gray-300">--</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Chart Section */}
                    <section className="bg-white p-5 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                <ChartIcon className="w-3.5 h-3.5" />
                                推移グラフ
                            </h3>
                            <div className="flex bg-gray-50 p-1 rounded-xl">
                                {(['1w', '1m', '6m', '1y', '3y'] as Period[]).map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setPeriod(p)}
                                        className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        {p === '1w' ? '1週' : p === '1m' ? '1月' : p === '6m' ? '6月' : p === '1y' ? '1年' : '3年'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="h-48 w-full mt-2">
                            {loading ? (
                                <div className="h-full w-full flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500"></div>
                                </div>
                            ) : chartData.length > 1 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                        <XAxis
                                            dataKey="date"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                                            minTickGap={20}
                                        />
                                        <YAxis
                                            hide
                                            domain={['dataMin - 1', 'dataMax + 1']}
                                        />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            labelStyle={{ fontWeight: 'bold' }}
                                        />
                                        {targetWeight && (
                                            <ReferenceLine y={targetWeight} stroke="#f43f5e" strokeDasharray="5 5" strokeWidth={2} />
                                        )}
                                        <Area
                                            type="monotone"
                                            dataKey="weight"
                                            stroke="#ec4899"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#colorWeight)"
                                            animationDuration={1500}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full w-full flex flex-col items-center justify-center text-gray-300 gap-2">
                                    <ChartIcon className="w-8 h-8 opacity-20" />
                                    <p className="text-xs">データが不足しています（2件以上必要）</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* History List */}
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                <History className="w-3.5 h-3.5" />
                                記録履歴
                            </h3>
                            <button
                                onClick={() => setShowForm(!showForm)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-[10px] font-bold transition-all shadow-sm ${showForm ? 'bg-gray-100 text-gray-600' : 'bg-pink-500 text-white hover:bg-pink-600 shadow-pink-200'}`}
                            >
                                {showForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                {showForm ? 'キャンセル' : '新規記録'}
                            </button>
                        </div>

                        <AnimatePresence>
                            {showForm && (
                                <motion.form
                                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                    onSubmit={handleSubmit}
                                    className="bg-gray-50/80 rounded-[2rem] p-6 space-y-4 border border-gray-100 overflow-hidden"
                                >
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">日付</label>
                                            <input
                                                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                                                className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-pink-500/20 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">体重 (kg)</label>
                                            <input
                                                type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)}
                                                placeholder="例: 50.5" required
                                                className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-pink-500/20 outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">メモ (任意)</label>
                                        <input
                                            type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
                                            placeholder="体調や食べたものなど"
                                            className="w-full bg-white border border-gray-200 rounded-xl py-2.5 px-4 text-sm focus:ring-2 focus:ring-pink-500/20 outline-none"
                                        />
                                    </div>
                                    <button
                                        type="submit" disabled={isSubmitting}
                                        className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-2xl shadow-xl hover:bg-black transition-all flex items-center justify-center gap-2 active:scale-95 text-sm"
                                    >
                                        {isSubmitting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : '記録を保存する'}
                                    </button>
                                </motion.form>
                            )}
                        </AnimatePresence>

                        <div className="space-y-3">
                            {records.length > 0 ? (
                                records.slice(0, 10).map((record) => (
                                    <div key={record.id} className="group bg-white p-4 rounded-2xl border border-gray-50 shadow-sm flex items-center gap-4 hover:border-pink-100 transition-all">
                                        <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center text-pink-500 shrink-0">
                                            <span className="text-xs font-black">{new Date(record.date).getDate()}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-gray-900">{record.weight}kg</span>
                                                <span className="text-[10px] text-gray-400 font-medium">{new Date(record.date).toLocaleDateString('ja-JP')}</span>
                                            </div>
                                            {record.notes && <p className="text-xs text-gray-500 truncate mt-0.5">{record.notes}</p>}
                                        </div>
                                        <button
                                            onClick={() => handleDelete(record.id)}
                                            className="p-2 text-gray-200 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-10 text-gray-300">
                                    <Scale className="w-12 h-12 mx-auto mb-3 opacity-10" />
                                    <p className="text-xs">まだ記録がありません。右上の「新規記録」から登録しましょう！</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Footer Gradient */}
                <div className="h-6 bg-gradient-to-t from-white to-transparent shrink-0 pointer-events-none" />
            </motion.div>
        </div>
    );
}
