'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

type ScanRecord = {
  id: string; // ドキュメントID (QR文字列のSHA-256ハッシュ)
  scannedAt: Date | null;
  rawText: string;
};

function formatDateTime(date: Date | null): string {
  if (!date) return '';
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [records, setRecords] = useState<ScanRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError(null);
      setLoggingIn(true);
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (err) {
        console.error(err);
        setLoginError('ログインに失敗しました。メールアドレスとパスワードをご確認ください。');
      } finally {
        setLoggingIn(false);
      }
    },
    [email, password]
  );

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    setRecords([]);
  }, []);

  const loadRecords = useCallback(async () => {
    setLoadingRecords(true);
    setLoadError(null);
    try {
      const q = query(collection(db, 'scans'), orderBy('scannedAt', 'asc'));
      const snap = await getDocs(q);
      const list: ScanRecord[] = snap.docs.map((d) => {
        const data = d.data() as { scannedAt?: Timestamp; rawText?: string };
        return {
          id: d.id,
          scannedAt: data.scannedAt ? data.scannedAt.toDate() : null,
          rawText: data.rawText ?? '',
        };
      });
      setRecords(list);
    } catch (err) {
      console.error(err);
      setLoadError(
        '読み取り履歴の取得に失敗しました。Firestoreのルールが正しく公開されているかご確認ください。'
      );
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  /**
   * 読み取り履歴(scansコレクション全件)と通過人数カウンターを完全にリセットする。
   * テスト運用から本番運用に切り替える際などに使用する、管理者専用の破壊的操作。
   * 500件ずつバッチ削除する(Firestoreの1バッチあたりの書き込み上限のため)。
   */
  const handleFullReset = useCallback(async () => {
    setResetting(true);
    setResetError(null);
    try {
      const snap = await getDocs(collection(db, 'scans'));
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 500) {
        const batch = writeBatch(db);
        docs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await setDoc(doc(db, 'meta', 'counter'), { totalCount: 0 });
      setRecords([]);
      setConfirmingReset(false);
    } catch (err) {
      console.error(err);
      setResetError(
        'リセットに失敗しました。通信状況をご確認の上、もう一度お試しください。'
      );
    } finally {
      setResetting(false);
    }
  }, []);

  const handleExportExcel = useCallback(async () => {
    const XLSX = await import('xlsx');

    const rows = records.map((r, index) => ({
      No: index + 1,
      読み取り日時: formatDateTime(r.scannedAt),
      QRの内容: r.rawText,
      識別ID: r.id,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 6 }, { wch: 22 }, { wch: 40 }, { wch: 68 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '読み取り履歴');

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    XLSX.writeFile(workbook, `livepocket-scan-history_${y}${m}${d}.xlsx`);
  }, [records]);

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-gray-400">
        読み込み中...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
        <a
          href="../"
          className="mb-6 text-center text-xs text-gray-500 underline"
        >
          ← スキャン画面に戻る
        </a>
        <h1 className="mb-6 text-center text-lg font-bold">管理画面ログイン</h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm outline-none"
          />
          <input
            type="password"
            required
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm outline-none"
          />
          {loginError && (
            <p className="text-sm text-red-400">{loginError}</p>
          )}
          <button
            type="submit"
            disabled={loggingIn}
            className="mt-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
          >
            {loggingIn ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-6">
      <a
        href="../"
        className="mb-4 inline-block text-xs text-gray-500 underline"
      >
        ← スキャン画面に戻る
      </a>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold">読み取り履歴</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 underline"
        >
          ログアウト
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <button
          onClick={loadRecords}
          disabled={loadingRecords}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {loadingRecords ? '取得中...' : '最新の履歴を取得'}
        </button>
        <button
          onClick={handleExportExcel}
          disabled={records.length === 0}
          className="rounded-lg bg-ok px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          Excelでダウンロード ({records.length}件)
        </button>
        <button
          onClick={() => setRecords([])}
          disabled={records.length === 0}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-gray-300 disabled:opacity-50"
        >
          表示をクリア
        </button>
      </div>

      <p className="mb-4 text-xs text-gray-500">
        「表示をクリア」は画面上の一覧を空にするだけで、Firestore上のデータ(重複チェックの記録)は削除されません。
      </p>

      {loadError && <p className="mb-4 text-sm text-red-400">{loadError}</p>}

      <div className="mb-6 rounded-lg border border-ng/40 p-4">
        <h2 className="mb-1 text-sm font-bold text-red-300">
          全リセット(テスト運用 → 本番運用の切り替え時など)
        </h2>
        <p className="mb-3 text-xs text-gray-400">
          読み取り履歴(重複チェックの記録)と通過人数カウンターを完全に削除します。この操作は取り消せません。
        </p>

        {!confirmingReset ? (
          <button
            onClick={() => setConfirmingReset(true)}
            className="rounded-lg bg-ng/80 px-4 py-2 text-sm font-bold text-white"
          >
            全リセットする
          </button>
        ) : (
          <div className="rounded-lg bg-ng/10 p-3">
            <p className="mb-3 text-sm font-bold text-red-300">
              本当にすべての読み取り履歴と通過人数をリセットしますか？
              <br />
              この操作は元に戻せません。
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleFullReset}
                disabled={resetting}
                className="rounded-lg bg-ng px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {resetting ? 'リセット中...' : 'はい、リセットする'}
              </button>
              <button
                onClick={() => setConfirmingReset(false)}
                disabled={resetting}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {resetError && (
          <p className="mt-3 text-sm text-red-400">{resetError}</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">No</th>
              <th className="whitespace-nowrap px-3 py-2">読み取り日時</th>
              <th className="whitespace-nowrap px-3 py-2">QRの内容</th>
              <th className="whitespace-nowrap px-3 py-2">識別ID(ハッシュ)</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, index) => (
              <tr key={r.id} className="border-t border-white/10">
                <td className="whitespace-nowrap px-3 py-2">{index + 1}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {formatDateTime(r.scannedAt)}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{r.rawText}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs opacity-60">
                  {r.id}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center opacity-50">
                  「最新の履歴を取得」を押してください
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
