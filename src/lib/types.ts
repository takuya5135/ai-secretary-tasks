import { PlaceType } from "./constants";

export type RoutineConfig = {
    type: 'daily' | 'weekly' | 'monthly_day' | 'monthly_week_day' | 'yearly' | 'yearly_date' | 'none';
    days?: number[]; // 0-6 (Sun-Sat)
    dayOfMonth?: number; // 1-31
    weekNumber?: number; // 1-5
    month?: number; // 1-12
};

// Google Tasks API の標準タスク型定義
export interface GoogleTask {
    kind: string;
    id: string;
    etag: string;
    title: string;
    updated: string;
    selfLink: string;
    position: string;
    notes?: string;
    status: "needsAction" | "completed";
    due?: string;
    completed?: string;
}

// アプリケーション固有のメタデータ（Firestore等に保存するもの）
export interface TaskMetadata {
    google_task_id: string;   // Google Tasks側のIDとの紐付けキー
    place: PlaceType;       // 1st, 2nd, 3rd (デフォルトは2nd)
    importance: number;      // 1 (低) ~ 4 (高)
    urgency: number;        // 1 (低) ~ 4 (高)
    is_routine?: boolean;
    routine_config?: RoutineConfig;
    aiSuggestionLog?: Record<string, unknown>;
}

// UIで扱い、GoogleTaskとメタデータが結合された統合型
export interface AppTask {
    id: string;               // 内部的には GoogleTask.id を正とする
    title: string;
    notes?: string;
    status: string;
    dueDate?: string;         // ISO String ('due' をマッピング)
    place: PlaceType;
    importance: number;
    urgency: number;
    isRoutine?: boolean;
    routineConfig?: RoutineConfig;
}

// AI秘書が参考にするためのユーザープロフィール情報
export interface UserProfile {
    nickname: string;
    gender: string;
    birth_year: string;
    occupation: string;
    marital_status: string;
    children_count: number | string;
}
