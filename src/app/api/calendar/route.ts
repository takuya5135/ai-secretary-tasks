import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const accessToken = request.headers.get("Authorization")?.split(" ")[1];

        if (!accessToken) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });

        const calendar = google.calendar({ version: "v3", auth });

        // 明日から10日間分の予定を取得
        const now = new Date();
        const nextPeriod = new Date();
        nextPeriod.setDate(now.getDate() + 10);

        const response = await calendar.events.list({
            calendarId: "primary",
            timeMin: now.toISOString(),
            timeMax: nextPeriod.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
        });

        const events = response.data.items?.map(event => ({
            id: event.id,
            summary: event.summary,
            description: event.description,
            start: event.start?.dateTime || event.start?.date,
            end: event.end?.dateTime || event.end?.date,
            location: event.location,
        })) || [];

        return NextResponse.json({ events }, { status: 200 });

    } catch (error: unknown) {
        console.error("GET /api/calendar error:", error);
        return NextResponse.json(
            { error: "Failed to fetch calendar events", details: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
