'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribeToPassCount } from '@/lib/checkDuplicate';

type RateSample = { time: number; count: number };

// 進行スピードの算出に使う直近時間の幅(これより古いサンプルは間引く)
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5分

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export default function PassCounter({
  variant = 'compact',
  plannedCount,
}: {
  /**
   * 'large': PC画面用。覗き込まれた際の牽制になるよう、特大サイズ+緑の枠で目立たせる。
   *          予定人数が渡された場合、進行スピード・残り人数・予定終了時刻も表示する。
   * 'compact': スマホ画面用。従来通りの小さい表示。
   */
  variant?: 'compact' | 'large';
  /** PC画面限定。予定人数(未設定ならnull)。 */
  plannedCount?: number | null;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [perMinute, setPerMinute] = useState<number | null>(null);
  const samplesRef = useRef<RateSample[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToPassCount(setCount);
    return () => unsubscribe();
  }, []);

  // 通過人数が更新されるたびに、直近5分間の増加数からスピード(人/分)を計算する。
  useEffect(() => {
    if (count === null) return;
    const now = Date.now();
    const samples = samplesRef.current;
    samples.push({ time: now, count });
    while (samples.length > 1 && now - samples[0].time > RATE_WINDOW_MS) {
      samples.shift();
    }
    const oldest = samples[0];
    const elapsedMin = (now - oldest.time) / 60000;
    if (elapsedMin >= 0.05 && count > oldest.count) {
      setPerMinute((count - oldest.count) / elapsedMin);
    }
  }, [count]);

  const displayValue = count === null ? '—' : count.toLocaleString('ja-JP');

  if (variant !== 'large') {
    return (
      <div className="mb-4 w-full rounded-xl bg-white/5 px-4 py-3 text-center">
        <span className="text-xs text-gray-400">通過人数</span>
        <div className="text-3xl font-bold tabular-nums">
          {displayValue}
          <span className="ml-1 text-base font-normal text-gray-400">人</span>
        </div>
      </div>
    );
  }

  // ここから先はPC画面(variant="large")限定の、進行スピード・残り・予定終了時刻の計算
  const remaining =
    plannedCount != null && count != null
      ? Math.max(plannedCount - count, 0)
      : null;

  let finishLabel = '—';
  if (remaining === 0) {
    finishLabel = '完了';
  } else if (remaining != null && perMinute && perMinute > 0) {
    const minutesLeft = remaining / perMinute;
    finishLabel = formatClockTime(new Date(Date.now() + minutesLeft * 60000));
  }

  const speedLabel = perMinute && perMinute > 0 ? `${perMinute.toFixed(1)}人/分` : '計算中';

  return (
    <div className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-ok bg-gradient-to-b from-ok/20 to-ok/5 px-4 py-5 shadow-[0_0_24px_rgba(22,163,74,0.15)]">
      <span className="mb-1 whitespace-nowrap text-sm font-bold tracking-widest text-green-300">
        通過人数
      </span>
      <div className="whitespace-nowrap text-6xl font-extrabold tabular-nums leading-none text-white [text-shadow:0_0_18px_rgba(22,163,74,0.5)]">
        {displayValue}
      </div>
      <span className="mb-3 mt-2 whitespace-nowrap text-xs text-gray-400">人</span>

      {plannedCount != null && (
        <div className="grid w-full grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
          <div>
            <div className="whitespace-nowrap text-[10px] text-gray-400">進行スピード</div>
            <div className="whitespace-nowrap text-base font-bold tabular-nums">{speedLabel}</div>
          </div>
          <div>
            <div className="whitespace-nowrap text-[10px] text-gray-400">残り人数</div>
            <div className="whitespace-nowrap text-base font-bold tabular-nums">
              {remaining != null ? `${remaining.toLocaleString('ja-JP')}人` : '—'}
            </div>
          </div>
          <div>
            <div className="whitespace-nowrap text-[10px] text-gray-400">予定終了</div>
            <div className="whitespace-nowrap text-base font-bold tabular-nums">{finishLabel}</div>
          </div>
        </div>
      )}
    </div>
  );
}
