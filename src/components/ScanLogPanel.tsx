'use client';

import type { ScanResult } from '@/lib/checkDuplicate';

export type LogEntry = {
  id: string;
  rawText: string;
  time: Date;
  status: ScanResult['status'];
  serialNumber: string;
  ticketNumber: string;
  surname: string;
  givenName: string;
};

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

export default function ScanLogPanel({ entries }: { entries: LogEntry[] }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-white/10">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-bold">スキャンログ(このセッションのみ)</h2>
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
                <th className="px-3 py-2 font-normal">氏名</th>
                <th className="px-3 py-2 font-normal">整理番号</th>
                <th className="px-3 py-2 font-normal">チケット番号</th>
                <th className="px-3 py-2 font-normal">QRの内容</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                // 重複(NG)の場合は個人情報保護のため氏名を表示しない
                const fullName =
                  e.status === 'duplicate'
                    ? ''
                    : [e.surname, e.givenName].filter(Boolean).join(' ');
                return (
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
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {fullName}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {e.serialNumber}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {e.ticketNumber}
                    </td>
                    <td className="break-all px-3 py-2 text-xs opacity-80">
                      {e.rawText}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
