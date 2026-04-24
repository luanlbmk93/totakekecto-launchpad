// src/hooks/useGlobalTrades.ts
import { useEffect, useState } from 'react';
import { fetchHomeFeedTrades, type GlobalTrade } from '../utils/homeFeed';

export type { GlobalTrade };

let sharedPromise: Promise<GlobalTrade[]> | null = null;
let sharedResult: GlobalTrade[] | null = null;

async function loadGlobalTradesOnce(): Promise<GlobalTrade[]> {
  if (sharedResult) return sharedResult;
  const rows = await fetchHomeFeedTrades();
  sharedResult = rows;
  return rows;
}

/**
 * Shared feed for Hero / ticker — one network pass per session (StrictMode-safe).
 * `loading` is always false so the layout never blocks first paint; trades fill in when ready.
 */
export const useGlobalTrades = () => {
  const [trades, setTrades] = useState<GlobalTrade[]>(sharedResult ?? []);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!sharedPromise) {
        sharedPromise = loadGlobalTradesOnce().finally(() => {
          sharedPromise = null;
        });
      }
      sharedPromise
        .then((rows) => {
          if (!cancelled) setTrades(rows);
        })
        .catch(() => {
          /* keep previous / empty */
        });
    };
    const id = requestAnimationFrame(run);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, []);

  return { trades, loading: false };
};
