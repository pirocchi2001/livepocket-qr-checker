'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { processScan, logEvent, type ScanResult } from '@/lib/checkDuplicate';
import ResultOverlay from './ResultOverlay';

const READER_ELEMENT_ID = 'qr-reader-region';
const OK_AUTO_RESUME_MS = 1200;

type UiState =
  | { kind: 'scanning' }
  | { kind: 'processing' }
  | { kind: 'result'; result: ScanResult };

// html5-qrcode の型は any 扱い(パッケージ側の型定義に依存しすぎないための簡易型)
type Html5QrcodeLike = {
  start: (
    cameraIdOrConfig: unknown,
    config: unknown,
    onSuccess: (decodedText: string) => void,
    onFailure: (error: unknown) => void
  ) => Promise<void>;
  pause: (shouldPauseVideo?: boolean) => void;
  resume: () => void;
  stop: () => Promise<void>;
  clear: () => void;
};

export default function QrScanner({
  onResult,
  compact = false,
}: {
  /** 判定確定のたびに呼ばれる(PC画面右側のスキャンログ表示などに利用) */
  onResult?: (result: ScanResult) => void;
  /** PC画面用の縮小表示。カメラ映像を小さく、案内文を省略する。 */
  compact?: boolean;
}) {
  const [uiState, setUiState] = useState<UiState>({ kind: 'scanning' });
  const [cameraError, setCameraError] = useState<string | null>(null);

  const html5QrCodeRef = useRef<Html5QrcodeLike | null>(null);
  const isBusyRef = useRef(false); // 判定中〜結果表示中は追加スキャンを無視するためのフラグ
  const autoResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resumeScanning = useCallback(() => {
    if (autoResumeTimerRef.current) {
      clearTimeout(autoResumeTimerRef.current);
      autoResumeTimerRef.current = null;
    }
    isBusyRef.current = false;
    setUiState({ kind: 'scanning' });
    try {
      html5QrCodeRef.current?.resume();
    } catch {
      // スキャナーが未初期化/停止済みの場合は無視
    }
  }, []);

  const handleDecoded = useCallback(async (decodedText: string) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;

    try {
      html5QrCodeRef.current?.pause(true);
    } catch {
      /* noop */
    }

    setUiState({ kind: 'processing' });

    let result: ScanResult;
    try {
      result = await processScan(decodedText);
    } catch (err) {
      console.error('processScan failed:', err);
      // 通信エラー等でも安全側に倒し、手動確認ロックにする
      result = { status: 'invalid', rawText: decodedText };
      // PC画面での監視用に記録(失敗しても無視してよい)
      void logEvent('invalid', decodedText);
    }

    setUiState({ kind: 'result', result });
    onResult?.(result);

    if (result.status === 'ok') {
      // OKのみ一定時間後に自動でスキャン再開(オペレーター確認は不要)
      autoResumeTimerRef.current = setTimeout(() => {
        resumeScanning();
      }, OK_AUTO_RESUME_MS);
    }
    // invalid / duplicate はユーザーが「確認（次へ）」を押すまでロックされたまま
  }, [resumeScanning, onResult]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // html5-qrcode は document/navigator に依存するため、
      // 静的エクスポートのビルド時(サーバー評価)を避けてクライアント内でのみ読み込む
      const { Html5Qrcode } = await import('html5-qrcode');
      if (cancelled) return;

      const instance = new Html5Qrcode(READER_ELEMENT_ID, {
        verbose: false,
      }) as unknown as Html5QrcodeLike;
      html5QrCodeRef.current = instance;

      try {
        await instance.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 260, height: 260 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            void handleDecoded(decodedText);
          },
          () => {
            // フレームごとのデコード失敗は正常動作の一部なので無視
          }
        );
      } catch (err) {
        console.error('camera start failed:', err);
        setCameraError(
          'カメラを起動できませんでした。ブラウザのカメラ権限設定をご確認ください。'
        );
      }
    })();

    return () => {
      cancelled = true;
      if (autoResumeTimerRef.current) {
        clearTimeout(autoResumeTimerRef.current);
      }
      const instance = html5QrCodeRef.current;
      if (instance) {
        instance
          .stop()
          .then(() => instance.clear())
          .catch(() => {
            /* アンマウント時の停止失敗は無視してよい */
          });
      }
    };
  }, [handleDecoded]);

  return (
    <div className="w-full">
      <div className="relative w-full">
        <div
          id={READER_ELEMENT_ID}
          className="w-full overflow-hidden rounded-xl bg-black"
          style={{ minHeight: compact ? 140 : 280 }}
        />

        {uiState.kind === 'processing' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60">
            <p className={compact ? 'text-xs text-gray-200' : 'text-sm text-gray-200'}>
              判定中...
            </p>
          </div>
        )}

        {uiState.kind === 'result' && (
          <ResultOverlay result={uiState.result} onConfirm={resumeScanning} compact={compact} />
        )}
      </div>

      {cameraError && (
        <p className="mt-3 rounded-lg bg-ng/20 p-3 text-sm text-red-300">
          {cameraError}
        </p>
      )}

      {!compact && (
        <p className="mt-4 text-center text-xs text-gray-400">
          QRコードを枠内にかざしてください
        </p>
      )}
    </div>
  );
}
