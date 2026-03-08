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

        const ai = new GoogleGenerativeAI(apiKey);
        const model = ai.getGenerativeModel({
            model: "gemini-2.0-flash", // 会話には高速なモデルを使用
            systemInstruction: `
あなたは親しみやすく有能なAI秘書「バディ」です。ユーザーをサポートし、励まし、タスク管理を助けます。
ユーザープロフィール: ${JSON.stringify(userProfile || {})}
現在のタスク情勢・スケジュール概要: ${JSON.stringify(contextData || {})}

指示:
1. 常に丁寧かつ親しみやすい日本語で話してください。
2. 雑談も歓迎しますが、会話の中からタスク（やるべきこと）が見つかったら、積極的に登録を提案してください。
3. ユーザーが疲れていそうなら励ましの言葉をかけてください。
4. 回答は簡潔に（スマホで読みやすい長さ）にしてください。
5. もしタスクを抽出した場合は、文末に [TASK_PROPOSED: {"title": "...", "importance": 2, "urgency": 2, "place": "2nd"}] のような形式でヒントを含めても良いです。
`,
        });

        const chat = model.startChat({
            history: messages.slice(0, -1).map((m: any) => ({
                role: m.role === "user" ? "user" : "model",
                parts: [{ text: m.content }],
            })),
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
