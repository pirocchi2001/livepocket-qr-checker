import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment,
  onSnapshot,
} from 'firebase/firestore';
import SHA256 from 'crypto-js/sha256';
import { db } from './firebase';

// Firestoreコレクション名。ドキュメントIDはQR文字列のSHA-256ハッシュ値。
const COLLECTION_NAME = 'scans';

// 通過人数(全端末合計)を保持する単一ドキュメント。
// 一覧取得(list)を使わずに済むよう、件数だけを別ドキュメントで集計する。
const COUNTER_DOC_PATH = ['meta', 'counter'] as const;

export type ScanResult =
  // "livepocketを含むか"のチェックは廃止したため、通常はここに来ない。
  // Firestore通信エラー等、処理自体に失敗した場合のフォールバック用。
  | { status: 'invalid'; rawText: string }
  | { status: 'ok'; rawText: string; hash: string }
  | {
      status: 'duplicate';
      rawText: string;
      hash: string;
      firstScannedAt: Date | null;
    };

type StoredScanData = {
  scannedAt?: Timestamp;
  rawText?: string;
};

/**
 * QRコードの生文字列からSHA-256ハッシュを計算する。
 */
export function hashCode(rawText: string): string {
  return SHA256(rawText).toString();
}

/**
 * QRコード読み取り後のメイン判定フロー。
 * QRコードの内容は問わず(以前あった「livepocketを含むか」のチェックは廃止)、
 * SHA-256ハッシュを計算し、Firestoreトランザクションで
 * 「新規作成(ok)」「重複(duplicate)」を確定する。
 *
 * トランザクションを使うことで、複数端末が同時に同じQRを読み取っても
 * どちらか一方だけが「新規作成(ok)」になり、もう一方は必ず「duplicate」になることを保証する。
 */
export async function processScan(rawText: string): Promise<ScanResult> {
  const hash = hashCode(rawText);
  const docRef = doc(db, COLLECTION_NAME, hash);

  const result = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);

    if (snap.exists()) {
      const data = snap.data() as StoredScanData;
      return {
        status: 'duplicate' as const,
        firstScannedAt: data.scannedAt ? data.scannedAt.toDate() : null,
      };
    }

    transaction.set(docRef, {
      scannedAt: serverTimestamp(),
      // QRコードの中身そのもの。管理画面の履歴一覧・Excel出力に表示するため保存する。
      rawText,
    });
    // 通過人数を+1。ドキュメントは事前にFirebaseコンソール等で
    // { totalCount: 0 } として作成しておく必要がある(セキュリティルール上、公開create不可のため)。
    transaction.update(doc(db, ...COUNTER_DOC_PATH), {
      totalCount: increment(1),
    });
    return { status: 'ok' as const };
  });

  if (result.status === 'duplicate') {
    return {
      status: 'duplicate',
      rawText,
      hash,
      firstScannedAt: result.firstScannedAt,
    };
  }

  return { status: 'ok', rawText, hash };
}

/**
 * 通過人数(全端末合計)をリアルタイム購読する。
 * meta/counter ドキュメントの totalCount フィールドを監視し、
 * 変化があるたびに callback を呼び出す。
 * 戻り値の関数を呼ぶと購読を解除できる。
 */
export function subscribeToPassCount(
  callback: (count: number | null) => void
): () => void {
  const ref = doc(db, ...COUNTER_DOC_PATH);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data() as { totalCount?: number } | undefined;
      callback(typeof data?.totalCount === 'number' ? data.totalCount : 0);
    },
    (err) => {
      console.error('subscribeToPassCount failed:', err);
      callback(null);
    }
  );
}
