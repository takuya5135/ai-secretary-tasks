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
    isRoutine?: boolean;
    routineConfig?: {
        type: 'daily' | 'weekly' | 'monthly_day' | 'monthly_week_day' | 'yearly';
        days?: number[]; // 0-6 (Sun-Sat)
        dayOfMonth?: number; // 1-31
        weekNumber?: number; // 1-5
        month?: number; // 1-12
    };
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
2. **ルーティン・繰り返し設定の抽出**: 「毎日」「毎週火曜」「毎月20日」「毎月第3日曜日」「毎年12月25日」などの繰り返しのニュアンスを敏感に察知し、後述する routineConfig を設定してください。
3. **メール・長文対応**: 入力がメール本文や雑多なメモである場合、そこから「実行すべきアクション（TODO）」をすべて特定し、抽出してください。
4. **文脈からの属性推測**: タイトルだけでなく、重要度、緊急度、場所（Home/Workなど）を前後の文脈から賢く推測してください。

ユーザーのプロフィール情報: ${JSON.stringify(userProfile || {})}

### 出力フォーマット
以下のプロパティを持つJSONオブジェクトの配列として出力してください:
- title: タスクのタイトル（具体的かつ簡潔に。特に買い物(place="4th")のタスクの場合、「スーパーで」のような場所や「買う」「購入」といった動詞は含めず、純粋な品物名のみ（例: "卵", "牛乳", "ティッシュ"）にしてください）
- notes: タスクの詳細や背景、メールの引用など（あれば）
- dueDate: 初回の期限（ISO 8601形式。繰り返しの場合はその最初の実施日を推測）
- importance: 重要度 (1:低い, 2:中, 3:高い, 4:極めて高い)
- urgency: 緊急度 (1:低い, 2:中, 3:高い, 4:極めて高い)
- place: 実行場所・コンテキスト ("1st": 自宅, "2nd": 職場, "3rd": 趣味, "4th": 買い物)
- isFrog: カエル設定 (boolean)
- shoppingLocation: 買い物の場所 (placeが"4th"の場合)
- isRoutine: ルーティンか (boolean)
- routineConfig: 繰り返し設定 (Object)
    - type: "daily", "weekly", "monthly_day", "monthly_week_day", "yearly"
    - days: [0-6] ※weeklyまたはmonthly_week_dayの場合
    - dayOfMonth: 1-31 ※monthly_dayまたはyearlyの場合
    - weekNumber: 1-5 ※monthly_week_dayの場合
    - month: 1-12 ※yearlyの場合

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
