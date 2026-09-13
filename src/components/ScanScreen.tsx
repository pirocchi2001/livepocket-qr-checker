'use client';

import { useCallback, useEffect, useState } from 'react';
import QrScanner from './QrScanner';
import PassCounter from './PassCounter';
import ScanLogPanel from './ScanLogPanel';
import {
  enableSound,
  isSoundReady,
  playOkSound,
  unlockAudioOnFirstInteraction,
} from '@/lib/sound';
import { keepScreenAwake } from '@/lib/wakeLock';

const PLANNED_COUNT_STORAGE_KEY = 'livepocket_plannedCount';

/**
 * User-Agentからスマートフォンかどうかを簡易判定する。
 * (画面幅ではなく端末種別で判定することで、PCのウィンドウを小さくしても
 * スマホ用の1カラム表示に切り替わらないようにする)
 */
function detectIsMobile(): boolean {
  if (typeof navigator === 'undefined') return true;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export default function ScanScreen() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [clearedAt, setClearedAt] = useState<Date | null>(null);
  const [plannedCount, setPlannedCount] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);

  useEffect(() => {
    setIsMobile(detectIsMobile());
  }, []);

  // 予定人数はこの端末(ブラウザ)にだけ保存する(他端末とは共有しない)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(PLANNED_COUNT_STORAGE_KEY);
    if (saved) {
      const parsed = Number(saved);
      if (Number.isFinite(parsed) && parsed > 0) setPlannedCount(parsed);
    }
  }, []);

  const handlePlannedCountChange = useCallback((value: string) => {
    if (value === '') {
      setPlannedCount(null);
      window.localStorage.removeItem(PLANNED_COUNT_STORAGE_KEY);
      return;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) return;
    setPlannedCount(num);
    window.localStorage.setItem(PLANNED_COUNT_STORAGE_KEY, String(num));
  }, []);

  // PC画面でのみ通知音を使うため、初回クリックでAudioContextを解錠しておく
  // (「通知音を有効にする」ボタンの押し忘れに備えた保険)
  useEffect(() => {
    if (isMobile !== false) return;
    return unlockAudioOnFirstInteraction();
  }, [isMobile]);

  const handleEnableSound = useCallback(() => {
    enableSound();
    // resume()は非同期なので、少し待ってから状態を反映する
    window.setTimeout(() => setSoundEnabled(isSoundReady()), 150);
    // 有効化できたことが分かるよう、確認としてOK音を1回鳴らす
    playOkSound();
  }, []);

  // PC(母艦)画面が開いている間は、画面スリープ・スクリーンセイバーの作動を防止する
  useEffect(() => {
    if (isMobile !== false) return;
    return keepScreenAwake();
  }, [isMobile]);

  // ログ表示のクリア(Firestore上のデータは消さず、この画面上の表示だけを空にする)
  const handleClearLog = useCallback(() => {
    setClearedAt(new Date());
  }, []);

  // 端末種別を判定するまでは何も出し分けない(ちらつき防止)
  if (isMobile === null) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        読み込み中...
      </main>
    );
  }

  const adminLink = (
    <a href="./admin/" className="text-xs text-gray-500 underline">
      管理画面(読み取り履歴)
    </a>
  );

  if (isMobile) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center px-4 py-6">
        <h1 className="mb-4 text-center text-lg font-bold tracking-wide">
          LivePocket QR重複チェック
        </h1>
        <PassCounter />
        <QrScanner />
        <div className="mt-6">{adminLink}</div>
      </main>
    );
  }

  // PC: 左上に大きな通過人数(牽制用)、左下に縮小カメラ、右にスキャンログを表示
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-wide">
          LivePocket QR重複チェック
        </h1>
        {adminLink}
      </div>

      <button
        onClick={handleEnableSound}
        className={
          soundEnabled
            ? 'mb-4 w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-gray-400'
            : 'mb-4 w-full animate-pulse rounded-lg border-2 border-ok bg-ok/20 px-4 py-2 text-sm font-bold text-green-300'
        }
      >
        {soundEnabled
          ? '🔊 通知音: 有効です'
          : '🔊 タップして通知音を有効にする(運用開始前に1回押してください)'}
      </button>

      <div className="grid flex-1 grid-cols-[320px_1fr] gap-5">
        <div className="flex flex-col gap-4">
          <PassCounter variant="large" plannedCount={plannedCount} />

          <div className="rounded-xl border border-white/10 p-3">
            <label className="mb-1 block whitespace-nowrap text-xs text-gray-500">
              予定人数(この端末にのみ保存されます)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="例: 2000"
              value={plannedCount ?? ''}
              onChange={(e) => handlePlannedCountChange(e.target.value)}
              className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm outline-none"
            />
          </div>

          <div className="rounded-xl border border-white/10 p-3">
            <p className="mb-2 whitespace-nowrap text-xs text-gray-500">
              カメラ(補助・縮小表示)
            </p>
            <QrScanner compact />
          </div>
        </div>

        <ScanLogPanel clearedAt={clearedAt} onClear={handleClearLog} />
      </div>
    </main>
  );
}
