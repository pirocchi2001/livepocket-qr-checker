'use client';

import { useEffect, useState } from 'react';
import { subscribeToPassCount } from '@/lib/checkDuplicate';

export default function PassCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToPassCount(setCount);
    return () => unsubscribe();
  }, []);

  return (
    <div className="mb-4 w-full rounded-xl bg-white/5 px-4 py-3 text-center">
      <span className="text-xs text-gray-400">通過人数</span>
      <div className="text-3xl font-bold tabular-nums">
        {count === null ? '—' : count.toLocaleString('ja-JP')}
        <span className="ml-1 text-base font-normal text-gray-400">人</span>
      </div>
    </div>
  );
}
