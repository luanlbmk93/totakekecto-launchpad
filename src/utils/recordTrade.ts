import { getBackendApiUrl } from '../config/apiBackend';
import { invalidateFactoryTradesCache } from './factoryTrades';

/**
 * Depois de buy/sell confirmado na wallet: envia o txHash ao servidor.
 * O servidor valida o recibo na factory e grava em `server/data/trades-cache/`.
 */
export async function pushTradeToBackend(tokenAddress: string, txHash: string): Promise<boolean> {
  const api = getBackendApiUrl();
  if (!api) return false;
  try {
    const res = await fetch(`${api}/api/trades/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenAddress, txHash }),
      cache: 'no-store',
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok) {
      console.warn('[recordTrade]', res.status, j?.error || '');
      return false;
    }
    invalidateFactoryTradesCache(tokenAddress);
    return j.ok === true || res.ok;
  } catch (e) {
    console.warn('[recordTrade] fetch failed', e);
    return false;
  }
}
