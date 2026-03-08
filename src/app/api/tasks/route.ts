import { NextResponse } from "next/server";
import { getGoogleTasksClient } from "@/lib/google/tasks";

// Google Tasksからタスク一覧を取得するAPIエンドポイント
export async function GET(request: Request) {
    try {
        // 1. AuthorizationヘッダーからBearerトークン（Google Access Token）を取得
        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized: Missing Google Access Token" }, { status: 401 });
        }
        const token = authHeader.split(" ")[1];

        // 2. Google Tasks クライアントの初期化
        const tasksClient = getGoogleTasksClient(token);

        // 3. まずデフォルトのTaskListIDを取得（または全タスクリストから一番上のものを取得）
        const taskLists = await tasksClient.tasklists.list();
        const defaultList = taskLists.data.items?.[0];

        if (!defaultList?.id) {
            return NextResponse.json({ error: "Task list not found" }, { status: 404 });
        }

        // 4. デフォルトリスト内のタスクを取得
        // TODO: 実際の運用ではページネーションや「完了済み」のフィルタリングなどを考慮する
        const tasks = await tasksClient.tasks.list({
            tasklist: defaultList.id,
            showCompleted: true,
            showHidden: true,
            maxResults: 100, // とりあえず100件
        });

        return NextResponse.json(
            {
                taskListId: defaultList.id,
                tasks: tasks.data.items || []
            },
            { status: 200 }
        );

    } catch (error: unknown) {
        console.error("GET /api/tasks error:", error);
        return NextResponse.json(
            { error: "Failed to fetch tasks from Google", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}

// Google Tasksに新しいタスクを追加するエンドポイント
export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized: Missing Google Access Token" }, { status: 401 });
        }
        const token = authHeader.split(" ")[1];

        const body = await request.json();
        const { title, notes, dueDate } = body;

        if (!title) {
            return NextResponse.json({ error: "Missing title" }, { status: 400 });
        }

        const tasksClient = getGoogleTasksClient(token);

        // デフォルトのタスクリストを取得
        const taskLists = await tasksClient.tasklists.list();
        const defaultList = taskLists.data.items?.[0];

        if (!defaultList?.id) {
            return NextResponse.json({ error: "Task list not found" }, { status: 404 });
        }

        // 新しいタスクをGoogle Tasksに追加
        const response = await tasksClient.tasks.insert({
            tasklist: defaultList.id,
            requestBody: {
                title,
                notes,
                due: dueDate,
            }
        });

        return NextResponse.json(response.data, { status: 201 });
    } catch (error: unknown) {
        console.error("POST /api/tasks error:", error);
        return NextResponse.json(
            { error: "Failed to create task", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
