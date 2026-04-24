/**
 * When `VITE_API_URL` is set, trades and related reads use the Node API (`server/index.mjs`)
 * so the browser does not run `eth_getLogs` storms (see `factoryTrades.ts`).
 */
export function getBackendApiUrl(): string | undefined {
  const u = import.meta.env.VITE_API_URL?.trim();
  if (!u || !/^https?:\/\//i.test(u)) return undefined;
  const base = u.replace(/\/$/, '');
  /** Porta 8545 = JSON-RPC (Geth/Erigon), não o Express. Erro comum: pôr VITE_API_URL = nó em vez da API (:8787). */
  if (/:8545(\/|$)/.test(base)) {
    console.warn(
      '[VITE_API_URL] Ignorado: aponta para porta 8545 (RPC). Define o servidor Node da API, ex. http://127.0.0.1:8787 ou http://IP:8787 — não o mesmo URL do nó BSC.',
    );
    return undefined;
  }
  return base;
}
