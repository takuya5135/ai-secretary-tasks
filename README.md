# AI秘書タスク管理アプリ (AI Secretary Tasks)

AIバディがGoogleカレンダーやGoogleタスク、そしてFirestoreと連携して、あなたのタスク管理をサポートするWebアプリケーションです。

## 主要機能

-   **Google Tasks & Calendar 連携**: Googleのアカウントと連携し、予定とタスクを一括管理。
-   **Firestore 同期アーキテクチャ**: 全てのタスクとカレンダー情報は Firestore にキャッシュされ、モバイル端末でのリロード時も即座に再表示。
-   **AIバディ・チャット**: Gemini API を活用したAIバディが、今日の予定を要約したり、会話を通じてタスクの提案を行います。
-   **認証の永続化**: Google Identity Services による Refresh Token 取得フローにより、スマホ利用時も頻繁な再ログインを必要としません。
-   **タスク管理の利便性**: 完了済みタスクの表示/非表示（Undo機能）、タスクの削除機能を搭載。

## セットアップ

### 1. 環境変数の設定

`.env.local` ファイルに以下の環境変数を設定してください：

```env
# Google OAuth 
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Firebase (Client SDK用)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Gemini API
GOOGLE_GENERATIVE_AI_API_KEY=...
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 開発サーバーの起動

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## プロジェクト構成

-   `src/app`: Next.js App Router (APIルート、ページ)
-   `src/components`: UIコンポーネント (ChatBuddy, TaskList 等)
-   `src/hooks`: カスタムフック (Firebase連携用 `useSync` 等)
-   `src/lib`: 外部ライブラリ共通設定 (Firebase初期化等)

