'use client';

import { useCallback, useEffect, useState } from 'react';
import QrScanner from './QrScanner';
import PassCounter from './PassCounter';
import ScanLogPanel, { type LogEntry } from './ScanLogPanel';
import type { ScanResult } from '@/lib/checkDuplicate';

const MAX_LOG_ENTRIES = 200;

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
  const [log, setLog] = useState<LogEntry[]>([]);

  useEffect(() => {
    setIsMobile(detectIsMobile());
  }, []);

  const handleResult = useCallback((result: ScanResult) => {
    setLog((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          rawText: result.rawText,
          time: new Date(),
          status: result.status,
        },
        ...prev,
      ].slice(0, MAX_LOG_ENTRIES)
    );
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
        <QrScanner onResult={handleResult} />
        <div className="mt-6">{adminLink}</div>
      </main>
    );
  }

  // PC: 左にカメラ、右にこのセッションでのスキャンログを表示
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-wide">
          LivePocket QR重複チェック
        </h1>
        {adminLink}
      </div>

      <PassCounter />

      <div className="mt-4 grid flex-1 grid-cols-[420px_1fr] gap-6">
        <QrScanner onResult={handleResult} />
        <ScanLogPanel entries={log} />
      </div>
    </main>
  );
}
