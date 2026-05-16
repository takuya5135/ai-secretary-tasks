import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDocs, collection, writeBatch } from "firebase/firestore";
import { generateOrderString } from "@/lib/utils/indexing";

let isRebalancing = false; // モジュールレベルでの二重発火防止ロック

export function useSync() {
    const { user, googleAccessToken, googleRefreshToken } = useAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    const syncData = useCallback(async () => {
        if (!user || (!googleAccessToken && !googleRefreshToken)) {
            return;
        }

        // オフライン時は同期をスキップ
        if (typeof window !== "undefined" && !navigator.onLine) {
            console.log("Offline: Skipping Google API sync");
            return;
        }

        setIsSyncing(true);
        setSyncError(null);

        try {
            const headers: Record<string, string> = {};
            if (googleAccessToken) headers["Authorization"] = `Bearer ${googleAccessToken}`;
            if (googleRefreshToken) headers["x-google-refresh-token"] = googleRefreshToken;

            // 1. Google APIから最新データをフェッチ (キャッシュ無効化)
            const timestamp = Date.now();
            const [tasksRes, calRes] = await Promise.all([
                fetch(`/api/tasks?_t=${timestamp}`, { headers, cache: "no-store" }),
                fetch(`/api/calendar?_t=${timestamp}`, { headers, cache: "no-store" })
            ]);

            if (!tasksRes.ok) throw new Error("Failed to fetch tasks from Google API");
            if (!calRes.ok) throw new Error("Failed to fetch calendar from Google API");

            const tasksData = await tasksRes.json();
            const calData = await calRes.json();

            if (!db) {
                throw new Error("Firestore is not initialized.");
            }
            const firestoreDb = db;

            // 2. Metadataの取得と不足分の初期化
            const metaQuery = await getDocs(collection(firestoreDb, "users", user.uid, "tasks_metadata"));
            const metadataMap = new Map();
            let minOrderString: string | null = null;

            metaQuery.forEach(docSnap => {
                const data = docSnap.data();
                metadataMap.set(docSnap.id, data);
                if (data.order_string) {
                    if (!minOrderString || data.order_string < minOrderString) {
                        minOrderString = data.order_string;
                    }
                }
            });

            const tasksToInitialize: Record<string, unknown>[] = [];
            let currentMinOrder: string | null = minOrderString;
            let needsRebalance = false;

            // Googleから取得したタスクの順序は無視する。order_stringが無いタスクには、現在のリストの先頭(最小)よりも若い文字列を付与する
            for (const task of tasksData.tasks || []) {
                let meta = metadataMap.get(task.id);
                if (!meta || !meta.order_string) {
                    currentMinOrder = generateOrderString(null, currentMinOrder);
                    meta = {
                        google_task_id: task.id,
                        order_string: currentMinOrder,
                        updated_at: new Date().toISOString(),
                        place: meta?.place || "2nd",
                        importance: meta?.importance || 2,
                        urgency: meta?.urgency || 2,
                    };
                    metadataMap.set(task.id, meta);
                    tasksToInitialize.push(meta);
                }

                if (meta.order_string && meta.order_string.length > 15) {
                    needsRebalance = true;
                }
            }

            // 初期化が必要なタスクをチャンク化してBatch書き込み
            if (tasksToInitialize.length > 0) {
                const CHUNK_SIZE = 400;
                for (let i = 0; i < tasksToInitialize.length; i += CHUNK_SIZE) {
                    const chunk = tasksToInitialize.slice(i, i + CHUNK_SIZE);
                    const batch = writeBatch(firestoreDb);
                    chunk.forEach(meta => {
                        const metaRef = doc(firestoreDb, "users", user.uid, "tasks_metadata", meta.google_task_id as string);
                        batch.set(metaRef, meta, { merge: true });
                    });
                    await batch.commit();
                }
                console.log(`Sync: initialized order_string for ${tasksToInitialize.length} tasks`);
            }

            // 3. Fractional Indexing のリバランス処理 (文字列の肥大化防止)
            if (needsRebalance && !isRebalancing) {
                isRebalancing = true;
                try {
                    console.log("Sync: Triggering order_string rebalance due to string length exceeding threshold.");
                    // アクティブなタスクだけを抽出
                    const activeTasksMeta = (tasksData.tasks || [])
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .map((t: any) => metadataMap.get(t.id))
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .filter((m: any) => m && m.order_string);
                    
                    // プレイスごとにグループ化
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const groupedMeta = activeTasksMeta.reduce((acc: any, meta: any) => {
                        const place = meta.place || "2nd";
                        if (!acc[place]) acc[place] = [];
                        acc[place].push(meta);
                        return acc;
                    }, {});

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const tasksToRebalance: any[] = [];

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    Object.values(groupedMeta).forEach((group: any) => {
                        // プレイスごとに独立してソート
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        group.sort((a: any, b: any) => a.order_string.localeCompare(b.order_string));
                        
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        group.forEach((meta: any, index: number) => {
                            const newOrder = String((index + 1) * 100).padStart(6, '0');
                            if (meta.order_string !== newOrder) {
                                meta.order_string = newOrder; // メモリ上も更新
                                tasksToRebalance.push(meta);
                            }
                        });
                    });

                    // リバランス対象をチャンク化してBatch書き込み
                    if (tasksToRebalance.length > 0) {
                        const CHUNK_SIZE = 400;
                        for (let i = 0; i < tasksToRebalance.length; i += CHUNK_SIZE) {
                            const chunk = tasksToRebalance.slice(i, i + CHUNK_SIZE);
                            const batch = writeBatch(firestoreDb);
                            chunk.forEach(meta => {
                                const metaRef = doc(firestoreDb, "users", user.uid, "tasks_metadata", meta.google_task_id as string);
                                batch.set(metaRef, {
                                    order_string: meta.order_string,
                                    updated_at: new Date().toISOString()
                                }, { merge: true });
                            });
                            await batch.commit();
                        }
                        console.log(`Sync: Rebalanced order_string for ${tasksToRebalance.length} tasks`);
                    }
                } finally {
                    isRebalancing = false;
                }
            }

            // 4. Firestore にキャッシュ（上書き保存）
            // Google Tasks (並べ替えロックは不要になったためそのまま上書き)
            const tasksRef = doc(firestoreDb, "users", user.uid, "google_cache", "tasks");
            await setDoc(tasksRef, {
                items: tasksData.tasks || [],
                updatedAt: new Date().toISOString()
            }, { merge: true });
            console.log("Sync complete: Google Tasks -> Firestore");

            // Google Calendar
            const calendarRef = doc(firestoreDb, "users", user.uid, "google_cache", "calendar");
            await setDoc(calendarRef, {
                events: calData.events || [],
                updatedAt: new Date().toISOString()
            }, { merge: true });

            console.log("Sync complete: Google Data -> Firestore");
        } catch (error: unknown) {
            console.error("Sync error:", error);
            setSyncError(error instanceof Error ? error.message : "Failed to sync data");
        } finally {
            setIsSyncing(false);
        }
    }, [user, googleAccessToken, googleRefreshToken]);

    return { syncData, isSyncing, syncError };
}
