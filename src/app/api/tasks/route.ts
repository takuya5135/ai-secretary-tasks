import { NextResponse } from "next/server";
import { getGoogleTasksClient } from "@/lib/google/tasks";

export const dynamic = "force-dynamic";

// Google Tasksからタスク一覧を取得するAPIエンドポイント
export async function GET(request: Request) {
    try {
        // 1. AuthorizationヘッダーからBearerトークン（Google Access Token） または Refresh Tokenを取得
        const authHeader = request.headers.get("Authorization");
        const refreshTokenHeader = request.headers.get("x-google-refresh-token");
        const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
        console.log('GET /api/tasks: token', token, 'refreshTokenHeader', refreshTokenHeader);

        if (!token && !refreshTokenHeader) {
            return NextResponse.json({ error: "Unauthorized: Missing Google Tokens" }, { status: 401 });
        }

        // 2. Google Tasks クライアントの初期化
        const tasksClient = getGoogleTasksClient(token, refreshTokenHeader);

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
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const status = errorMessage.includes("invalid_grant") ? 401 : 500;
        return NextResponse.json(
            { error: "Failed to fetch tasks from Google", details: errorMessage },
            { status }
        );
    }
}

// Google Tasksに新しいタスクを追加するエンドポイント
export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get("Authorization");
        const refreshTokenHeader = request.headers.get("x-google-refresh-token");

        const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

        if (!token && !refreshTokenHeader) {
            return NextResponse.json({ error: "Unauthorized: Missing Google Tokens" }, { status: 401 });
        }

        const body = await request.json();
        const { title, notes, dueDate } = body;

        if (!title) {
            return NextResponse.json({ error: "Missing title" }, { status: 400 });
        }

        const tasksClient = getGoogleTasksClient(token, refreshTokenHeader);

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
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const status = errorMessage.includes("invalid_grant") ? 401 : 500;
        return NextResponse.json(
            { error: "Failed to create task", details: errorMessage },
            { status }
        );
    }
}

// Google Tasksを更新（完了・期限変更など）するエンドポイント
export async function PATCH(request: Request) {
    try {
        const authHeader = request.headers.get("Authorization");
        const refreshTokenHeader = request.headers.get("x-google-refresh-token");

        const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

        if (!token && !refreshTokenHeader) {
            return NextResponse.json({ error: "Unauthorized: Missing Google Tokens" }, { status: 401 });
        }

        const body = await request.json();
        const { id, title, notes, due, status } = body;

        if (!id) {
            return NextResponse.json({ error: "Missing task ID" }, { status: 400 });
        }

        const tasksClient = getGoogleTasksClient(token, refreshTokenHeader);
        const taskLists = await tasksClient.tasklists.list();
        const defaultList = taskLists.data.items?.[0];

        if (!defaultList?.id) {
            return NextResponse.json({ error: "Task list not found" }, { status: 404 });
        }

        const response = await tasksClient.tasks.patch({
            tasklist: defaultList.id,
            task: id,
            requestBody: {
                title,
                notes,
                due,
                status // 'needsAction' or 'completed'
            }
        });

        return NextResponse.json(response.data, { status: 200 });
    } catch (error: unknown) {
        console.error("PATCH /api/tasks error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const status = errorMessage.includes("invalid_grant") ? 401 : 500;
        return NextResponse.json({ error: "Failed to update task", details: errorMessage }, { status });
    }
}

// Google Tasksを削除するエンドポイント
export async function DELETE(request: Request) {
    try {
        const authHeader = request.headers.get("Authorization");
        const refreshTokenHeader = request.headers.get("x-google-refresh-token");

        const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

        if (!token && !refreshTokenHeader) {
            return NextResponse.json({ error: "Unauthorized: Missing Google Tokens" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: "Missing task ID" }, { status: 400 });
        }

        const tasksClient = getGoogleTasksClient(token, refreshTokenHeader);
        const taskLists = await tasksClient.tasklists.list();
        const defaultList = taskLists.data.items?.[0];

        if (!defaultList?.id) {
            return NextResponse.json({ error: "Task list not found" }, { status: 404 });
        }

        await tasksClient.tasks.delete({
            tasklist: defaultList.id,
            task: id,
        });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: unknown) {
        console.error("DELETE /api/tasks error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const status = errorMessage.includes("invalid_grant") ? 401 : 500;
        return NextResponse.json({ error: "Failed to delete task", details: errorMessage }, { status });
    }
}
// Google Tasksを移動（並べ替え）するエンドポイント
export async function PUT(request: Request) {
    try {
        const authHeader = request.headers.get("Authorization");
        const refreshTokenHeader = request.headers.get("x-google-refresh-token");

        const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

        if (!token && !refreshTokenHeader) {
            return NextResponse.json({ error: "Unauthorized: Missing Google Tokens" }, { status: 401 });
        }

        const body = await request.json();
        const { id, previous } = body; // previous: 移動先の直前のタスクID（一番上の場合は未指定）

        if (!id) {
            return NextResponse.json({ error: "Missing task ID" }, { status: 400 });
        }

        const tasksClient = getGoogleTasksClient(token, refreshTokenHeader);
        const taskLists = await tasksClient.tasklists.list();
        const defaultList = taskLists.data.items?.[0];

        if (!defaultList?.id) {
            return NextResponse.json({ error: "Task list not found" }, { status: 404 });
        }

        const response = await tasksClient.tasks.move({
            tasklist: defaultList.id,
            task: id,
            previous: previous || undefined,
        });

        return NextResponse.json(response.data, { status: 200 });
    } catch (error: unknown) {
        console.error("PUT /api/tasks error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const status = errorMessage.includes("invalid_grant") ? 401 : 500;
        return NextResponse.json({ error: "Failed to move task", details: errorMessage }, { status });
    }
}
