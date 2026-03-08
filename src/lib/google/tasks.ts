import { google } from "googleapis";

// Google Tasks APIを利用するための準備関数
export function getGoogleTasksClient(accessToken: string) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    // tasks API (v1) のクライアントを生成して返す
    return google.tasks({ version: "v1", auth: oauth2Client });
}
