'use client';

// TypeScriptの標準libにWakeLock関連の型が無い場合があるため、必要最小限を自前で定義する。
type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

let sentinel: WakeLockSentinelLike | null = null;

async function requestWakeLock(): Promise<void> {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as NavigatorWithWakeLock;
  if (!nav.wakeLock) return; // 対応していないブラウザでは何もしない(致命的ではない)
  try {
    sentinel = await nav.wakeLock.request('screen');
  } catch (err) {
    // 権限が無い/バックグラウンドタブ等の理由で失敗することがあるが、致命的ではないので無視
    console.warn('WakeLock request failed:', err);
  }
}

/**
 * ページが表示されている間、画面のスリープ・スクリーンセイバーの作動を抑止する。
 * (ブラウザのタブがバックグラウンドに回ると自動的に解除される仕様のため、
 *  再びタブがアクティブになった際に再取得する)
 *
 * 対応ブラウザ(Chrome/Edge等)のみ有効。非対応ブラウザでは何も起きない。
 * OS側の設定によっては、この機能だけでは画面ロック・スクリーンセイバーを
 * 完全に防げない場合もあるため、その場合はOS側のスリープ設定の見直しも検討すること。
 */
export function keepScreenAwake(): () => void {
  if (typeof document === 'undefined') return () => {};

  void requestWakeLock();

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void requestWakeLock();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (sentinel && !sentinel.released) {
      sentinel.release().catch(() => {
        /* 解除失敗は無視してよい */
      });
    }
    sentinel = null;
  };
}
