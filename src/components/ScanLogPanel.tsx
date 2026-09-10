'use client';

import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ScanResult } from '@/lib/checkDuplicate';

// この端末で今まさに起きた重複/読み取りエラーの表示用(Firestoreには保存されないため、
// 他端末とは共有されない・ページ再読み込みで消える一時的なもの)
export type LocalLogEntry = {
  id: string;
  rawText: string;
  time: Date;
  status: 'duplicate' | 'invalid';
};

type DisplayEntry = {
  id: string;
  rawText: string;
  time: Date;
  status: ScanResult['status'];
};

const MAX_SHARED_ENTRIES = 300;

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const STATUS_LABEL: Record<ScanResult['status'], string> = {
  ok: 'OK',
  duplicate: 'NG(重複)',
  invalid: '読み取りエラー',
};

const STATUS_CLASS: Record<ScanResult['status'], string> = {
  ok: 'bg-ok/20 text-green-300',
  duplicate: 'bg-ng/20 text-red-300',
  invalid: 'bg-warn/20 text-amber-300',
};

/**
 * 通過済み(OK)の履歴だけはFirestoreに保存されているため、
 * ここをリアルタイム購読することで「全端末共有・保存され続ける」ログにする。
 * (重複/読み取りエラーはFirestoreに保存しない設計のため、こちらは各端末のローカル表示のみ)
 */
function useSharedOkEntries(): DisplayEntry[] {
  const [entries, setEntries] = useState<DisplayEntry[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'scans'),
      orderBy('scannedAt', 'desc'),
      limit(MAX_SHARED_ENTRIES)
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list: DisplayEntry[] = snap.docs.map((d) => {
          const data = d.data() as { scannedAt?: Timestamp; rawText?: string };
          return {
            id: d.id,
            rawText: data.rawText ?? '',
            time: data.scannedAt ? data.scannedAt.toDate() : new Date(0),
            status: 'ok',
          };
        });
        setEntries(list);
      },
      (err) => {
        console.error('scan log subscription failed:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  return entries;
}

export default function ScanLogPanel({
  localEntries,
  clearedAt,
  onClear,
}: {
  /** この端末での重複/読み取りエラーの一時的な表示分 */
  localEntries: LocalLogEntry[];
  /** この日時より前のスキャンは表示しない(「表示をクリア」した基準時刻) */
  clearedAt: Date | null;
  onClear: () => void;
}) {
  const sharedEntries = useSharedOkEntries();

  const entries: DisplayEntry[] = [...sharedEntries, ...localEntries]
    .filter((e) => !clearedAt || e.time > clearedAt)
    .sort((a, b) => b.time.getTime() - a.time.getTime())
    .slice(0, MAX_SHARED_ENTRIES);

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold">スキャンログ</h2>
          <p className="text-xs text-gray-500">
            OK分は全端末で共有・保存されます(重複/エラーはこの端末のみの一時表示)
          </p>
        </div>
        <button
          onClick={onClear}
          className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-gray-300"
        >
          表示をクリア
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {entries.length === 0 ? (
          <p className="p-4 text-center text-sm text-gray-500">
            まだスキャンがありません
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#0b0f14]">
              <tr className="text-xs text-gray-400">
                <th className="px-3 py-2 font-normal">時刻</th>
                <th className="px-3 py-2 font-normal">状態</th>
                <th className="px-3 py-2 font-normal">QRの内容</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-white/5">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {formatTime(e.time)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-bold ${STATUS_CLASS[e.status]}`}
                    >
                      {STATUS_LABEL[e.status]}
                    </span>
                  </td>
                  <td className="break-all px-3 py-2 text-xs opacity-80">
                    {e.rawText}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
