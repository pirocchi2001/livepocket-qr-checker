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
import { EMPTY_FIELDS, type ExtractedFields } from './ocr';

// Firestoreコレクション名。ドキュメントIDはQR文字列のSHA-256ハッシュ値。
const COLLECTION_NAME = 'scans';

// 通過人数(全端末合計)を保持する単一ドキュメント。
// 一覧取得(list)を使わずに済むよう、件数だけを別ドキュメントで集計する。
const COUNTER_DOC_PATH = ['meta', 'counter'] as const;

export type ScanResult =
  | { status: 'invalid'; rawText: string }
  | {
      status: 'ok';
      rawText: string;
      hash: string;
      // PC画面右側のスキャンログ表示用。受付スタッフが確認できる情報なので氏名も含む。
      serialNumber: string;
      ticketNumber: string;
      surname: string;
      givenName: string;
    }
  | {
      status: 'duplicate';
      rawText: string;
      hash: string;
      firstScannedAt: Date | null;
      // 個人情報保護のため、重複時に画面へ返すのは整理番号・チケット番号のみ(氏名は含めない)
      serialNumber: string;
      ticketNumber: string;
    };

type StoredScanData = {
  scannedAt?: Timestamp;
  rawText?: string;
  serialNumber?: string;
  ticketNumber?: string;
  surname?: string;
  givenName?: string;
};

/**
 * 読み取った生文字列に "livepocket" が含まれるかを大文字小文字無視で判定する。
 * 含まれない場合、この関数はfalseを返すのみでFirestoreには一切アクセスしない
 * (無駄な読み取り/書き込み課金・通信を避けるため)。
 */
export function isLivePocketCode(rawText: string): boolean {
  return rawText.toLowerCase().includes('livepocket');
}

/**
 * QRコードの生文字列からSHA-256ハッシュを計算する。
 */
export function hashCode(rawText: string): string {
  return SHA256(rawText).toString();
}

/**
 * QRコード読み取り後のメイン判定フロー。
 * 1. "livepocket" を含まない → Firestoreにアクセスせず invalid を返す
 * 2. 含む → SHA-256ハッシュを計算し、まず軽い読み取りで存在有無を確認する
 *    (存在しない=新規の可能性が高い場合のみ、呼び出し元のOCR処理を実行してもらう)
 * 3. Firestoreトランザクションで最終的な「新規作成(ok)」「重複(duplicate)」を確定する
 *
 * トランザクションを使うことで、複数端末が同時に同じQRを読み取っても
 * どちらか一方だけが「新規作成(ok)」になり、もう一方は必ず「duplicate」になることを保証する。
 *
 * @param rawText 読み取ったQRコードの文字列
 * @param captureFields 新規登録の可能性が高い場合にのみ呼ばれる、OCR実行用コールバック。
 *   (重複が確定しているケースでは呼ばれないため、無駄なOCR処理を避けられる)
 */
export async function processScan(
  rawText: string,
  captureFields?: () => Promise<ExtractedFields>
): Promise<ScanResult> {
  if (!isLivePocketCode(rawText)) {
    return { status: 'invalid', rawText };
  }

  const hash = hashCode(rawText);
  const docRef = doc(db, COLLECTION_NAME, hash);

  // 先に軽い読み取りで大まかに存在確認する。ここで「存在する」と分かれば
  // OCRを実行するだけ無駄になるため省略できる。
  // (最終的な重複判定は下のトランザクション内で確定させるので、
  //  ここでの判定結果を直接信用するわけではない=競合状態があっても安全)
  const preCheckSnap = await getDoc(docRef);
  const fields = preCheckSnap.exists()
    ? EMPTY_FIELDS
    : (await captureFields?.()) ?? EMPTY_FIELDS;

  const result = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);

    if (snap.exists()) {
      const data = snap.data() as StoredScanData;
      return {
        status: 'duplicate' as const,
        firstScannedAt: data.scannedAt ? data.scannedAt.toDate() : null,
        serialNumber: data.serialNumber ?? '',
        ticketNumber: data.ticketNumber ?? '',
      };
    }

    transaction.set(docRef, {
      scannedAt: serverTimestamp(),
      // QRコードの中身そのもの。管理画面の履歴一覧・Excel出力に表示するため保存する。
      rawText,
      // OCRで読み取った項目(ベストエフォート。読み取れなければ空文字)
      serialNumber: fields.serialNumber,
      ticketNumber: fields.ticketNumber,
      surname: fields.surname,
      givenName: fields.givenName,
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
      serialNumber: result.serialNumber,
      ticketNumber: result.ticketNumber,
    };
  }

  return {
    status: 'ok',
    rawText,
    hash,
    serialNumber: fields.serialNumber,
    ticketNumber: fields.ticketNumber,
    surname: fields.surname,
    givenName: fields.givenName,
  };
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
