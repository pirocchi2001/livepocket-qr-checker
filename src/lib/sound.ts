'use client';

// 外部の音声ファイルを用意せず、Web Audio APIでその場合成する。
// (静的エクスポート環境でアセット管理を増やさないための方針)

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    audioCtx = new Ctor();
  }
  return audioCtx;
}

/**
 * ブラウザの自動再生制限により、ユーザー操作(クリック等)が一度もない状態では
 * 音声が再生されないことがある。ページ内のどこか1回のクリックをきっかけに
 * AudioContextを起動しておくことで、実際のスキャン時に確実に音が鳴るようにする。
 */
export function unlockAudioOnFirstInteraction(): () => void {
  if (typeof document === 'undefined') return () => {};
  const handler = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
    }
  };
  document.addEventListener('click', handler, { once: true });
  return () => document.removeEventListener('click', handler);
}

function beep(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
  type: OscillatorType
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

/**
 * OK(通過)時の通知音。控えめで感じの良い、短い2音の「ピロン」。
 */
export function playOkSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const now = ctx.currentTime;
  beep(ctx, 880, now, 0.09, 0.12, 'sine');
  beep(ctx, 1320, now + 0.09, 0.13, 0.12, 'sine');
}

/**
 * NG(重複・エラー)時の通知音。周囲にも聞こえるよう、大きめ・目立つブザー音を3回。
 */
export function playNgSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const now = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    beep(ctx, 220, now + i * 0.18, 0.14, 0.5, 'sawtooth');
  }
}
