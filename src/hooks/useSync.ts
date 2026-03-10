import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export function useSync() {
    const { user, googleAccessToken, googleRefreshToken } = useAuth();
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    const syncData = useCallback(async () => {
        if (!user || (!googleAccessToken && !googleRefreshToken)) {
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

            // 2. Firestore にキャッシュ（上書き保存）
            // Google Tasks
            const tasksRef = doc(db, "users", user.uid, "google_cache", "tasks");
            await setDoc(tasksRef, {
                items: tasksData.tasks || [],
                updatedAt: new Date().toISOString()
            }, { merge: true });

            // Google Calendar
            const calendarRef = doc(db, "users", user.uid, "google_cache", "calendar");
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
