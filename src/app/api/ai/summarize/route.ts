import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { tasks, calendarEvents, userProfile } = body;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
            return NextResponse.json({ error: "Gemini API Key is not configured" }, { status: 500 });
        }

        // 現在の日時を取得
        const now = new Date();
        const currentDateStr = now.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

        const ai = new GoogleGenerativeAI(apiKey);
        const model = ai.getGenerativeModel({
            model: "gemini-2.0-flash",
            systemInstruction: `
あなたは優秀な秘書「バディ」です。ユーザーのタスクとカレンダー予定を分析し、要約レポートを作成してください。
現在の日付: ${currentDateStr}
ユーザープロフィール: ${JSON.stringify(userProfile || {})}

要件:
1. 「今日の予定」「明日の予定」「今後10日間の展望」の3つの観点で要約してください。
2. 重要なタスクや期限が近いもの、予定の重なりなどを指摘してください。
3. ユーザーをやる気にさせるポジティブなメッセージを添えてください。
4. 簡潔かつ読みやすく（箇条書きなどを活用）してください。
5. 日本語で回答してください。
`,
        });

        const prompt = `
以下のデータを元に要約を作成してください。
【タスク一覧】
${JSON.stringify(tasks || [])}

【カレンダー予定】
${JSON.stringify(calendarEvents || [])}
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return NextResponse.json({ summary: text }, { status: 200 });

    } catch (error: unknown) {
        console.error("POST /api/ai/summarize error:", error);
        return NextResponse.json(
            { error: "Summary failed", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
