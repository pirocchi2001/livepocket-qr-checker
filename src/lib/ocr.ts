'use client';

// Tesseract.jsはnpm経由でバンドルすると静的エクスポート環境で
// worker/wasmファイルのパス解決が煩雑になるため、CDNからの動的スクリプト読み込み
// (ブラウザ実行時のみ)で利用する。ビルド時の依存関係には含めない。

declare global {
  interface Window {
    Tesseract?: {
      createWorker: (langs: string[]) => Promise<TesseractWorker>;
    };
  }
}

type TesseractWorker = {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
};

const TESSERACT_CDN_URL =
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

let scriptLoadPromise: Promise<void> | null = null;
let workerPromise: Promise<TesseractWorker> | null = null;

function loadTesseractScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    if (window.Tesseract) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = TESSERACT_CDN_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Tesseract.jsの読み込みに失敗しました'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

/**
 * OCRワーカーを初回のみ生成し、以降は使い回す
 * (スキャンのたびに毎回モデルを読み込むと非常に遅くなるため)。
 */
function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadTesseractScript();
      if (!window.Tesseract) {
        throw new Error('Tesseract.jsの読み込みに失敗しました');
      }
      // 英数字(整理番号・チケット番号)と日本語(氏名)の両方を認識する
      return window.Tesseract.createWorker(['eng', 'jpn']);
    })();
  }
  return workerPromise;
}

export type ExtractedFields = {
  surname: string; // 氏
  givenName: string; // 名
  serialNumber: string; // 整理番号
  ticketNumber: string; // チケット番号
};

export const EMPTY_FIELDS: ExtractedFields = {
  surname: '',
  givenName: '',
  serialNumber: '',
  ticketNumber: '',
};

/**
 * OCRで得たテキスト全体から、ラベル文字列を目印に各項目を抜き出す。
 * 読み取れなかった項目は空文字のままになる(ベストエフォート)。
 */
function parseFields(text: string): ExtractedFields {
  const nameMatch = text.match(/氏[:：]?\s*([^\s名]{1,20})[\s\S]{0,10}名[:：]?\s*([^\s]{1,20})/);
  const serialMatch = text.match(/整理番号[\s\S]{0,15}?([A-Za-z0-9]{2,20})/);
  const ticketMatch = text.match(/チケット番号[\s\S]{0,15}?([A-Za-z0-9]{5,30})/);

  return {
    surname: nameMatch?.[1]?.trim() ?? '',
    givenName: nameMatch?.[2]?.trim() ?? '',
    serialNumber: serialMatch?.[1]?.trim() ?? '',
    ticketNumber: ticketMatch?.[1]?.trim() ?? '',
  };
}

/**
 * カメラの現在の映像フレームをOCRし、氏名・整理番号・チケット番号を抽出する。
 * 失敗した場合や項目が見つからない場合は空文字を返す(処理自体は止めない)。
 */
export async function extractTicketFieldsFromVideo(
  video: HTMLVideoElement
): Promise<ExtractedFields> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return EMPTY_FIELDS;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const worker = await getWorker();
    const { data } = await worker.recognize(canvas);
    return parseFields(data.text || '');
  } catch (err) {
    console.error('OCR failed:', err);
    return EMPTY_FIELDS;
  }
}
