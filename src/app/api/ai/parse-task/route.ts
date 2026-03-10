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
    isFrog?: boolean;
    shoppingLocation?: string;
};

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { prompt, userProfile, shoppingLocations } = body;

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
あなたは優秀なAI秘書です。ユーザーの入力テキストを解析し、具体的なタスクのリスト（JSON配列）として抽出・分解してください。

### 重要なミッション
1. **複数タスクへの分解**: ユーザーの入力に複数のアクション（例：「〜と〜をする」「Aをして、次にBをする」など）が含まれている場合、それらを1つのタスクにまとめず、必ず **独立した個別のタスク** としてリスト化してください。
2. **メール・長文対応**: 入力がメール本文や雑多なメモである場合、そこから「実行すべきアクション（TODO）」をすべて特定し、抽出してください。
3. **文脈からの属性推測**: タイトルだけでなく、重要度、緊急度、場所（Home/Workなど）を前後の文脈から賢く推測してください。

ユーザーのプロフィール情報: ${JSON.stringify(userProfile || {})}

### 出力フォーマット
以下のプロパティを持つJSONオブジェクトの配列として出力してください:
- title: タスクのタイトル（具体的かつ簡潔に）
- notes: タスクの詳細や背景、メールの引用など（あれば）
- dueDate: 期限（ISO 8601形式の文字列、yyyy-mm-ddThh:mm:00.000Z。明確な指定がなければ省略）
- importance: 重要度 (1:低い, 2:中, 3:高い, 4:極めて高い)
- urgency: 緊急度 (1:低い, 2:中, 3:高い, 4:極めて高い)
- place: 実行場所・コンテキスト ("1st": 自宅/パーソナル, "2nd": 職場/学校, "3rd": 趣味/サードプレイス, "4th": 買い物/ショッピング から最適と推測されるもの。デフォルトは "2nd")
- isFrog: カエル設定 (boolean。ユーザーが「やりたくない」「嫌だ」「気が重い」など、心理的に負担を感じていそうなタスクに対して true を設定。迷ったら false)
- shoppingLocation: 買い物の場所（placeが"4th"の場合のみ。以下のリストから最も適切なものを選択するか、リストにない場合は推測して設定 ${JSON.stringify(shoppingLocations || [])}）

必ず純粋なJSON配列（[...]）のみを出力してください。Markdownの装飾は不要です。
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
