import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isConfigValid = typeof window !== "undefined" && !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

// Next.js (SSR環境) で複数回初期化されるのを防ぐ
// ビルド時（APIキー未設定）にエラーを投げないようガード
const app = isConfigValid
  ? (!getApps().length ? initializeApp(firebaseConfig) : getApp())
  : null;

const auth = (isConfigValid && app) ? getAuth(app) : null;
const db = (isConfigValid && app) ? getFirestore(app) : null;

// クライアントサイドでのみオフライン持続性を有効化
if (typeof window !== "undefined" && db) {
  const { enableMultiTabIndexedDbPersistence } = require("firebase/firestore");
  enableMultiTabIndexedDbPersistence(db).catch((err: any) => {
    if (err.code === 'failed-precondition') {
      console.warn("Firestore persistence failed: multiple tabs open");
    } else if (err.code === 'unimplemented') {
      console.warn("Firestore persistence failed: browser not supported");
    }
  });
}

export { app, auth, db };
