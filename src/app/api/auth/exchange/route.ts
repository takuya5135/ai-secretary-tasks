import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function POST(request: Request) {
    try {
        const { code } = await request.json();

        if (!code) {
            return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            // postmessage is specific for popup auth flow in google auth
            "postmessage"
        );

        // Authorization code を Token に交換
        const { tokens } = await oauth2Client.getToken(code);
        console.log("Tokens received from exchange:", tokens); // 開発用ログ

        // リフレッシュトークンが含まれているか確認
        if (!tokens.refresh_token) {
            console.warn("No refresh token returned. User might have previously granted access. Consider forcing prompt: 'consent'.");
        }

        return NextResponse.json({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date,
        }, { status: 200 });

    } catch (error: any) {
        console.error("POST /api/auth/exchange error:", error);
        return NextResponse.json(
            { error: "Failed to exchange authorization code", details: error.message },
            { status: 500 }
        );
    }
}
