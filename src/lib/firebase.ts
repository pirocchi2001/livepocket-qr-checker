import { initializeApp, getApps, getApp, type FirebaseOptions } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Next.js の静的エクスポート + Fast Refresh 環境で
// initializeApp が二重実行されないようにガードする
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(firebaseApp);

// firebase/auth の getAuth() はAPIキーの形式を即座に検証するため、
// 静的エクスポートのビルド時(Node上でのプリレンダリング、env値が無い場合がある)に
// 呼び出すとビルドが失敗する。ブラウザ実行時にのみ初期化する。
export const auth = typeof window !== 'undefined' ? getAuth(firebaseApp) : (undefined as unknown as ReturnType<typeof getAuth>);
