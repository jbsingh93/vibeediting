/** Tiny hook for the top-bar health dot: fetch /api/health once, report the worst status. */
import { useEffect, useState } from 'react';
import { api } from './api';

export type Worst = 'green' | 'yellow' | 'red' | 'unknown';

export function useHealthDot(): Worst {
  const [worst, setWorst] = useState<Worst>('unknown');
  useEffect(() => {
    let alive = true;
    api
      .health()
      .then((r) => {
        if (!alive) return;
        setWorst(r.reds > 0 ? 'red' : r.yellows > 0 ? 'yellow' : 'green');
      })
      .catch(() => alive && setWorst('unknown'));
    return () => {
      alive = false;
    };
  }, []);
  return worst;
}
