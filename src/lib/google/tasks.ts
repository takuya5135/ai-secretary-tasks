import { google } from "googleapis";

// Google Tasks APIを利用するための準備関数
export function getGoogleTasksClient(accessToken: string | null, refreshToken?: string | null) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    // アクセストークンがない場合はrefresh_tokenを使う。
    // google-api-nodejs-clientはrefresh_tokenがセットされていれば、必要に応じて自動で新しいaccess_tokenを取得します。
    oauth2Client.setCredentials({
        access_token: accessToken || undefined,
        refresh_token: refreshToken || undefined
    });

    // tasks API (v1) のクライアントを生成して返す
    return google.tasks({ version: "v1", auth: oauth2Client });
}
