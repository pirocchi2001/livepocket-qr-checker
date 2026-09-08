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
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-ok/90"
      >
        <span className="text-5xl">OK</span>
        <span className="text-sm opacity-90">受付済みとして記録しました</span>
      </div>
    );
  }

  if (result.status === 'duplicate') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-ng/90 px-4 text-center">
        <span className="text-5xl font-bold">NG</span>
        <span className="text-base font-semibold">重複読み取りです</span>
        <span className="text-sm opacity-90">
          初回読取: {formatDateTime(result.firstScannedAt)}
        </span>
        <button
          onClick={onConfirm}
          className="mt-4 rounded-lg bg-white px-6 py-2 text-sm font-bold text-ng shadow"
        >
          確認（次へ）
        </button>
      </div>
    );
  }

  // invalid: livepocketの文字列を含まない、無関係なQRコード
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-warn/90 px-4 text-center">
      <span className="text-5xl font-bold">✕</span>
      <span className="text-base font-semibold">違うコードです</span>
      <span className="text-sm opacity-90">
        LivePocketのQRコードではありません
      </span>
      <button
        onClick={onConfirm}
        className="mt-4 rounded-lg bg-white px-6 py-2 text-sm font-bold text-warn shadow"
      >
        確認（次へ）
      </button>
    </div>
  );
}
