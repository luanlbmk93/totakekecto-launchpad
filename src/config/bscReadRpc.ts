/**
 * Read-only BSC JSON-RPC for charts / log fallbacks.
 * Override with `VITE_BSC_RPC_URL` in `.env` (QuickNode, NodeReal, Ankr with key, etc.).
 * Default is Binance public seed — Ankr’s public `rpc.ankr.com/bsc` now requires an API key.
 */
export function getBscReadRpcUrl(): string {
  const v = import.meta.env.VITE_BSC_RPC_URL;
  if (typeof v === 'string' && v.trim().length > 8) return v.trim();
  return 'https://bsc-dataseed.binance.org/';
}

/**
 * Multiple read RPCs to reduce flakiness (public RPCs sometimes return CALL_EXCEPTION + missing revert data).
 * If `VITE_BSC_RPC_URL` is set, it is always tried first.
 */
export function getBscReadRpcUrls(): string[] {
  const v = import.meta.env.VITE_BSC_RPC_URL;
  const primary = typeof v === 'string' && v.trim().length > 8 ? v.trim() : null;
  // If the user configured a dedicated RPC, do NOT fall back to public RPCs.
  // Public endpoints are flaky and can cause "missing revert data" / -32603 issues.
  if (primary) return [primary];

  const fallbacks = [
    'https://bsc-dataseed.binance.org/',
    'https://bsc.publicnode.com/',
  ];

  // de-dupe
  return Array.from(new Set(fallbacks));
}
