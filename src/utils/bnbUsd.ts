type BnbUsdQuote = {
  usd: number;
};

let cached: { at: number; usd: number } | null = null;

export async function getBnbUsdPrice(opts?: { ttlMs?: number; signal?: AbortSignal }): Promise<number> {
  const ttlMs = opts?.ttlMs ?? 60_000;
  const now = Date.now();
  if (cached && now - cached.at < ttlMs && Number.isFinite(cached.usd) && cached.usd > 0) return cached.usd;

  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd', {
    cache: 'no-store',
    signal: opts?.signal,
  });
  if (!res.ok) throw new Error(`BNB/USD fetch failed (${res.status})`);
  const j = (await res.json()) as { binancecoin?: BnbUsdQuote };
  const usd = Number(j?.binancecoin?.usd ?? 0);
  if (!Number.isFinite(usd) || usd <= 0) throw new Error('BNB/USD invalid quote');

  cached = { at: now, usd };
  return usd;
}

export function minBnbForUsd(usdTarget: number, bnbUsd: number): number {
  if (!Number.isFinite(usdTarget) || usdTarget <= 0) return 0;
  if (!Number.isFinite(bnbUsd) || bnbUsd <= 0) return 0;
  return usdTarget / bnbUsd;
}

