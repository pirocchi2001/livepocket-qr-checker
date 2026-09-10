'use client';

import type { ScanResult } from '@/lib/checkDuplicate';

function formatDateTime(date: Date | null): string {
  if (!date) return '不明';
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// QRコードの中身を大きく表示する共通パーツ
function RawTextDisplay({ rawText }: { rawText: string }) {
  return (
    <div className="mt-2 w-full rounded-lg bg-black/20 px-3 py-2">
      <p className="break-all font-mono text-lg font-bold leading-snug sm:text-xl">
        {rawText}
      </p>
    </div>
  );
}

export default function ResultOverlay({
  result,
  onConfirm,
}: {
  result: ScanResult;
  onConfirm: () => void;
}) {
  if (result.status === 'ok') {
    return (
      <div
        onClick={onConfirm}
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-auto rounded-xl bg-ok/90 px-4 py-6"
      >
        <span className="text-5xl">OK</span>
        <span className="text-sm opacity-90">受付済みとして記録しました</span>
        <RawTextDisplay rawText={result.rawText} />
      </div>
    );
  }

  if (result.status === 'duplicate') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-auto rounded-xl bg-ng/90 px-4 py-6 text-center">
        <span className="text-5xl font-bold">NG</span>
        <span className="text-base font-semibold">重複読み取りです</span>
        <span className="text-sm opacity-90">
          初回読取: {formatDateTime(result.firstScannedAt)}
        </span>
        <RawTextDisplay rawText={result.rawText} />
        <button
          onClick={onConfirm}
          className="mt-4 rounded-lg bg-white px-6 py-2 text-sm font-bold text-ng shadow"
        >
          確認（次へ）
        </button>
      </div>
    );
  }

  // invalid: 通信エラー等、処理自体に失敗した場合のみ表示される
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-auto rounded-xl bg-warn/90 px-4 py-6 text-center">
      <span className="text-5xl font-bold">✕</span>
      <span className="text-base font-semibold">読み取りに失敗しました</span>
      <span className="text-sm opacity-90">
        通信状況をご確認の上、もう一度お試しください
      </span>
      <RawTextDisplay rawText={result.rawText} />
      <button
        onClick={onConfirm}
        className="mt-4 rounded-lg bg-white px-6 py-2 text-sm font-bold text-warn shadow"
      >
        確認（次へ）
      </button>
    </div>
  );
}
