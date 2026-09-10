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
  setParameters: (params: Record<string, string>) => Promise<void>;
};

const TESSERACT_CDN_URL =
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

// PSM 6 = "Assume a single uniform block of text"。
// チケット画面のようにテキストが一塊で並ぶ場合、自動レイアウト解析より速く安定する。
const PSM_SINGLE_BLOCK = '6';

let scriptLoadPromise: Promise<void> | null = null;
// 整理番号・チケット番号(英数字のみ)専用の高速ワーカー
let engWorkerPromise: Promise<TesseractWorker> | null = null;
// 氏名(日本語)用のワーカー
let jpnWorkerPromise: Promise<TesseractWorker> | null = null;

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
 * 英数字(整理番号・チケット番号)専用ワーカー。
 * 認識対象をA-Z・0-9のみに制限することで、紛らわしい誤認識(0とO、1とIなど)を減らし、
 * 日本語モデルを読み込まない分だけ高速に動作する。
 * 生成に失敗した場合は次回また作り直せるよう、キャッシュをクリアしてから例外を投げる。
 */
function getEngWorker(): Promise<TesseractWorker> {
  if (!engWorkerPromise) {
    engWorkerPromise = (async () => {
      try {
        await loadTesseractScript();
        if (!window.Tesseract) throw new Error('Tesseract.jsの読み込みに失敗しました');
        const worker = await window.Tesseract.createWorker(['eng']);
        await worker.setParameters({
          tessedit_pageseg_mode: PSM_SINGLE_BLOCK,
          tessedit_char_whitelist:
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        });
        return worker;
      } catch (err) {
        engWorkerPromise = null; // 次回リトライできるようにする
        throw err;
      }
    })();
  }
  return engWorkerPromise;
}

/**
 * 氏名(日本語)用ワーカー。英字も混在するラベル文字列を読むため eng も含める。
 */
function getJpnWorker(): Promise<TesseractWorker> {
  if (!jpnWorkerPromise) {
    jpnWorkerPromise = (async () => {
      try {
        await loadTesseractScript();
        if (!window.Tesseract) throw new Error('Tesseract.jsの読み込みに失敗しました');
        const worker = await window.Tesseract.createWorker(['jpn', 'eng']);
        await worker.setParameters({ tessedit_pageseg_mode: PSM_SINGLE_BLOCK });
        return worker;
      } catch (err) {
        jpnWorkerPromise = null; // 次回リトライできるようにする
        throw err;
      }
    })();
  }
  return jpnWorkerPromise;
}

/**
 * カメラ起動時などに呼んでおくと、実際のスキャン時に初回読み込み待ちが発生しなくなる。
 * 失敗しても致命的ではないため、呼び出し側はエラーを無視してよい。
 */
export function warmUpOcrWorkers(): void {
  getEngWorker().catch((err) => console.warn('OCR(英数字)ワーカーの事前読み込みに失敗:', err));
  getJpnWorker().catch((err) => console.warn('OCR(日本語)ワーカーの事前読み込みに失敗:', err));
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
 * 英数字OCR結果(整理番号・チケット番号)を抽出する。
 */
function parseAlphanumericFields(
  text: string
): Pick<ExtractedFields, 'serialNumber' | 'ticketNumber'> {
  const serialMatch = text.match(/整理番号[\s\S]{0,15}?([A-Za-z0-9]{2,20})/);
  const ticketMatch = text.match(/チケット番号[\s\S]{0,15}?([A-Za-z0-9]{5,30})/);
  return {
    serialNumber: serialMatch?.[1]?.trim() ?? '',
    ticketNumber: ticketMatch?.[1]?.trim() ?? '',
  };
}

/**
 * 日本語OCR結果(氏名)を抽出する。
 */
function parseNameFields(text: string): Pick<ExtractedFields, 'surname' | 'givenName'> {
  const nameMatch = text.match(/氏[:：]?\s*([^\s名]{1,20})[\s\S]{0,10}名[:：]?\s*([^\s]{1,20})/);
  return {
    surname: nameMatch?.[1]?.trim() ?? '',
    givenName: nameMatch?.[2]?.trim() ?? '',
  };
}

/**
 * video要素の現在のフレームをグレースケール化+コントラスト強調した新しいcanvasとして取り出す。
 * 呼ぶたびに新しいcanvasを作るのは、2つのワーカーが同時に同じcanvasを参照して
 * 干渉することを避けるため(念のための防御策)。
 */
function captureFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    // grayscale + コントラスト強調(対応ブラウザのみ。未対応でもエラーにはならず素通しになる)
    ctx.filter = 'grayscale(1) contrast(1.4)';
  } catch {
    /* filter未対応環境は無視して続行 */
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * カメラの現在の映像フレームをOCRし、氏名・整理番号・チケット番号を抽出する。
 * 英数字用/日本語用の2つのワーカーを並列実行することで、
 * 直列に1回のOCRを実行するより体感速度を落とさずに精度も確保する。
 *
 * OCRはあくまで付加情報の取得なので、どのような失敗があっても
 * 例外を外に投げず、必ず(部分的にでも)結果を返す。
 * これにより、OCRの不調がQRコードの重複チェック自体を止めることはない。
 */
export async function extractTicketFieldsFromVideo(
  video: HTMLVideoElement
): Promise<ExtractedFields> {
  const [engSettled, jpnSettled] = await Promise.allSettled([
    (async () => {
      const canvas = captureFrame(video);
      if (!canvas) return '';
      const worker = await getEngWorker();
      const { data } = await worker.recognize(canvas);
      return data.text || '';
    })(),
    (async () => {
      const canvas = captureFrame(video);
      if (!canvas) return '';
      const worker = await getJpnWorker();
      const { data } = await worker.recognize(canvas);
      return data.text || '';
    })(),
  ]);

  if (engSettled.status === 'rejected') {
    console.error('OCR(英数字)に失敗しました:', engSettled.reason);
  }
  if (jpnSettled.status === 'rejected') {
    console.error('OCR(日本語)に失敗しました:', jpnSettled.reason);
  }

  const engText = engSettled.status === 'fulfilled' ? engSettled.value : '';
  const jpnText = jpnSettled.status === 'fulfilled' ? jpnSettled.value : '';

  return {
    ...parseAlphanumericFields(engText),
    ...parseNameFields(jpnText),
  };
}
