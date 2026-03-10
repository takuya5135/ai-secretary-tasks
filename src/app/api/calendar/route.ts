/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import { google } from "googleapis";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const authHeader = request.headers.get("Authorization");
        const refreshTokenHeader = request.headers.get("x-google-refresh-token");

        const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
        console.log('GET /api/calendar: accessToken', accessToken, 'refreshTokenHeader', refreshTokenHeader);
        if (!accessToken && !refreshTokenHeader) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const auth = new google.auth.OAuth2(
            process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        auth.setCredentials({
            access_token: accessToken || undefined,
            refresh_token: refreshTokenHeader || undefined
        });

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
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const status = errorMessage.includes("invalid_grant") ? 401 : 500;
        return NextResponse.json(
            { error: "Failed to fetch calendar events", details: errorMessage },
            { status }
        );
    }
}
