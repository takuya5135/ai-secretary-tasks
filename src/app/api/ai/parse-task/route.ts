import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// APIルートのレスポンス型
export type AIParsedTask = {
    title: string;
    notes?: string;
    dueDate?: string; // ISO 8601
    importance: number; // 1-4
    urgency: number; // 1-4
    place: "1st" | "2nd" | "3rd" | "4th";
};

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { prompt, userProfile } = body;

        if (!prompt) {
            return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
            return NextResponse.json({ error: "Gemini API Key is not configured" }, { status: 500 });
        }

        const ai = new GoogleGenerativeAI(apiKey);
        const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });

        const systemInstruction = `
あなたは優秀なAI秘書です。ユーザーの入力テキストを解析し、具体的なタスクのリスト（JSON配列）として抽出してください。
ユーザーのプロフィール情報: ${JSON.stringify(userProfile || {})}

抽出する各タスクは以下のプロパティを持つJSONオブジェクトとしてください:
- title: タスクのタイトル（簡潔に）
- notes: タスクの詳細やメモ（あれば）
- dueDate: 期限（ISO 8601形式の文字列、yyyy-mm-ddThh:mm:00.000Z。明確な指定がなければ省略）
- importance: 重要度 (1:低い, 2:中, 3:高い, 4:極めて高い)
- urgency: 緊急度 (1:低い, 2:中, 3:高い, 4:極めて高い)
- place: 実行場所・コンテキスト ("1st": 自宅/パーソナル, "2nd": 職場/学校, "3rd": 趣味/サードプレイス, "4th": 買い物/ショッピング から最適と推測されるもの。デフォルトは "2nd")

必ず配列形式のJSONのみを出力してください。Markdownのコードブロック記号（\`\`\`json など）は含めず、純粋なJSON配列の文字列として返してください。
`;

        const response = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: systemInstruction,
        });

        let text = response.response.text() || "[]";

        // Markdownコードブロックが含まれている場合のクリーニング
        if (text.startsWith("\`\`\`json")) {
            text = text.replace(/^\`\`\`json\n/, "").replace(/\n\`\`\`$/, "");
        } else if (text.startsWith("\`\`\`")) {
            text = text.replace(/^\`\`\`\n/, "").replace(/\n\`\`\`$/, "");
        }

        const parsedTasks: AIParsedTask[] = JSON.parse(text);

        return NextResponse.json({ tasks: parsedTasks }, { status: 200 });

    } catch (error: unknown) {
        console.error("POST /api/ai/parse-task error:", error);
        return NextResponse.json(
            { error: "Failed to parse tasks using AI", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
