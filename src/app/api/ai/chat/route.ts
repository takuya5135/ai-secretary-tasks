import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { messages, userProfile, contextData } = body;

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: "Missing messages" }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
            return NextResponse.json({ error: "Gemini API Key is not configured" }, { status: 500 });
        }

        // 現在の日時を取得
        const now = new Date();
        const currentDateStr = now.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        const currentTimeStr = now.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });

        const ai = new GoogleGenerativeAI(apiKey);
        const model = ai.getGenerativeModel({
            model: "gemini-2.0-flash", // 会話には高速なモデルを使用
            systemInstruction: `
あなたは親しみやすく有能なAI秘書「バディ」です。ユーザーをサポートし、励まし、タスク管理を助けます。
現在の日時: ${currentDateStr} ${currentTimeStr}
ユーザープロフィール: ${JSON.stringify(userProfile || {})}
現在のタスク情勢・スケジュール概要: ${JSON.stringify(contextData || {})}

指示:
1. 常に丁寧かつ親しみやすい日本語で話してください。
2. 雑談も歓迎しますが、会話の中からタスク（やるべきこと）が見つかったら、積極的に登録を提案してください。
3. ユーザーが疲れていそうなら励ましの言葉をかけてください。
4. 回答は簡潔に（スマホで読みやすい長さ）にしてください。
5. タスクのアドバイスを求められた際は、以下の概念を適宜活用してください：
   - アイゼンハワーマトリクス: 重要度と緊急度に基づく優先順位付け。
   - 2分ルール: すぐに終わるタスクは今すぐやるよう促す。
   - カエルを食べる: 最も気が進まない、あるいは最も重要な大きなタスクを朝一番に片付ける提案。
   - タスク分割: 大きすぎるタスク（Big Frog）を、具体的な小さなステップに分ける提案。
6. タスクには「TODO（やるべき）」と「WISH（やりたい）」があります。WISHは無理強いせず、心のゆとりとして扱ってください。
7. 作成日から時間が経過しているタスクがあれば、必要性を優しく確認してください。
8. もしタスクを提案・抽出した場合は、文末に [TASKS_PROPOSED: [{"title": "...", "importance": 2, "urgency": 2, "place": "2nd", "task_type": "todo", "shoppingLocation": "未分類"}]] のようなJSON配列形式でヒントを含めてください。複数ある場合も配列に入れてください。買い物の場合は、ユーザーの買い物場所設定を考慮して適切なshoppingLocationを含め、titleには場所や「買う」などの動詞を含めず純粋な品物名のみにすること。
`,
        });

        const rawHistory = messages.slice(0, -1);

        // Gemini APIの仕様: history は必ず user から始まり、user/model が交互であること
        const formattedHistory: { role: string; parts: { text: string }[] }[] = [];
        let expectedRole = "user";

        for (const msg of rawHistory) {
            const mappedRole = msg.role === "user" ? "user" : "model";

            if (formattedHistory.length === 0 && mappedRole === "model") {
                // historyの先頭がmodelの場合はスキップするか、ダミーのuser発言を入れる
                // ここではUI仕様上「こんにちは！」というmodelの発言から始まるため、最初のmodel発言は握りつぶし、
                // システムプロンプト内で状況を理解させる構造にするか、最初から無かったことにする。
                // 今回はAPI要件を満たすため、先頭のmodel発言はスキップする。
                continue;
            }

            if (mappedRole === expectedRole) {
                formattedHistory.push({
                    role: mappedRole,
                    parts: [{ text: msg.content }],
                });
                expectedRole = expectedRole === "user" ? "model" : "user";
            } else {
                // 連続している場合は、直前の発言に結合する（Gemini制約回避）
                if (formattedHistory.length > 0) {
                    formattedHistory[formattedHistory.length - 1].parts[0].text += `\n\n${msg.content}`;
                }
            }
        }

        const chat = model.startChat({
            history: formattedHistory,
        });

        const lastMessage = messages[messages.length - 1].content;
        const result = await chat.sendMessage(lastMessage);
        const response = await result.response;
        const text = response.text();

        return NextResponse.json({ content: text }, { status: 200 });

    } catch (error: unknown) {
        console.error("POST /api/ai/chat error:", error);
        return NextResponse.json(
            { error: "Chat failed", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
