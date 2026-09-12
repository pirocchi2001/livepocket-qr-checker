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

// QRコードの中身を大きく表示する共通パーツ(compact時は控えめなサイズにする)
function RawTextDisplay({ rawText, compact }: { rawText: string; compact?: boolean }) {
  return (
    <div className="mt-2 w-full rounded-lg bg-black/20 px-3 py-2">
      <p
        className={
          compact
            ? 'break-all font-mono text-[10px] leading-snug'
            : 'break-all font-mono text-lg font-bold leading-snug sm:text-xl'
        }
      >
        {rawText}
      </p>
    </div>
  );
}

export default function ResultOverlay({
  result,
  onConfirm,
  compact = false,
}: {
  result: ScanResult;
  onConfirm: () => void;
  /** PC画面の縮小カメラ枠用。文字サイズを小さくして枠内に収める。 */
  compact?: boolean;
}) {
  const bigLabel = compact ? 'text-2xl' : 'text-5xl';
  const padding = compact ? 'gap-1 px-2 py-2' : 'gap-2 px-4 py-6';
  const smallText = compact ? 'text-[10px]' : 'text-sm';
  const baseText = compact ? 'text-xs' : 'text-base';
  const button = compact
    ? 'mt-2 rounded-md bg-white px-3 py-1 text-[10px] font-bold shadow'
    : 'mt-4 rounded-lg bg-white px-6 py-2 text-sm font-bold shadow';

  if (result.status === 'ok') {
    return (
      <div
        onClick={onConfirm}
        className={`absolute inset-0 flex flex-col items-center justify-center overflow-auto rounded-xl bg-ok/90 ${padding}`}
      >
        <span className={bigLabel}>OK</span>
        {!compact && <span className={`${smallText} opacity-90`}>受付済みとして記録しました</span>}
        {!compact && <RawTextDisplay rawText={result.rawText} />}
      </div>
    );
  }

  if (result.status === 'duplicate') {
    return (
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center overflow-auto rounded-xl bg-ng/90 text-center ${padding}`}
      >
        <span className={`${bigLabel} font-bold`}>NG</span>
        <span className={`${baseText} font-semibold`}>重複読み取りです</span>
        {!compact && (
          <span className={`${smallText} opacity-90`}>
            初回読取: {formatDateTime(result.firstScannedAt)}
          </span>
        )}
        {!compact && <RawTextDisplay rawText={result.rawText} compact={compact} />}
        <button onClick={onConfirm} className={`${button} text-ng`}>
          確認（次へ）
        </button>
      </div>
    );
  }

  // invalid: 通信エラー等、処理自体に失敗した場合のみ表示される
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center overflow-auto rounded-xl bg-warn/90 text-center ${padding}`}
    >
      <span className={`${bigLabel} font-bold`}>✕</span>
      <span className={`${baseText} font-semibold`}>読み取りに失敗しました</span>
      {!compact && (
        <span className={`${smallText} opacity-90`}>
          通信状況をご確認の上、もう一度お試しください
        </span>
      )}
      {!compact && <RawTextDisplay rawText={result.rawText} compact={compact} />}
      <button onClick={onConfirm} className={`${button} text-warn`}>
        確認（次へ）
      </button>
    </div>
  );
}
