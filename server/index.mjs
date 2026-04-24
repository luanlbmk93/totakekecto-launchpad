/**
 * API de leitura BSC — lista de tokens, trades por token, rocket.
 * Ver BACKEND.md na raiz do projeto.
 *
 * PC local: npm run server  →  VITE_API_URL=http://127.0.0.1:8787
 * VPS: BIND_HOST=0.0.0.0 + reverse proxy (Nginx/Caddy) + HTTPS
 */
import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { fetchAllTokens } from './tokensService.mjs';
import { fetchTradesForToken } from './tradesService.mjs';
import { recordTradeFromTxHash } from './recordTradeFromTx.mjs';
import { getRocketConfig, getRocketScore } from './rocketService.mjs';
import { startTradeIndexer } from './tradeIndexer.mjs';

const PORT = Number(process.env.PORT || 8787);

/** Avisa se .env tiver VITE_API_URL em localhost com porta ≠ PORT (erro comum na VPS). */
function warnIfViteApiUrlPortMismatch() {
  const raw = process.env.VITE_API_URL?.trim();
  if (!raw) return;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return;
  }
  if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return;
  if (!u.port) return;
  const urlPort = Number(u.port);
  if (urlPort === PORT) return;
  console.warn(
    `[vault-api] VITE_API_URL usa porta ${urlPort} mas PORT=${PORT}. Corrige o .env para a mesma porta (ex.: VITE_API_URL=http://127.0.0.1:${PORT}) ou muda PORT.`,
  );
}

const CACHE_TOKENS_MS = Number(process.env.CACHE_TOKENS_MS || 60_000);
/** Cache curto: após compra, o merge incremental em disco atualiza rápido — evita servir lista velha 45s. */
const CACHE_TRADES_MS = Number(process.env.CACHE_TRADES_MS || 4_000);
const CACHE_ROCKET_MS = Number(process.env.CACHE_ROCKET_MS || 60_000);

let tokensCache = { at: 0, data: null };
const tradesCache = new Map();
let rocketCache = { at: 0, data: null };

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '512kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'vault-api', ts: Date.now() });
});

app.get('/api/tokens', async (_req, res) => {
  try {
    const now = Date.now();
    if (tokensCache.data && now - tokensCache.at < CACHE_TOKENS_MS) {
      return res.json({ tokens: tokensCache.data, cached: true });
    }
    const tokens = await fetchAllTokens();
    tokensCache = { at: now, data: tokens };
    res.json({ tokens, cached: false });
  } catch (e) {
    console.error('[api/tokens]', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/api/trades/:token', async (req, res) => {
  try {
    const token = (req.params.token || '').trim();
    if (!token.startsWith('0x') || token.length < 10) {
      return res.status(400).json({ error: 'invalid token address' });
    }
    const key = token.toLowerCase();
    const now = Date.now();
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    if (!refresh) {
      const hit = tradesCache.get(key);
      if (hit && now - hit.at < CACHE_TRADES_MS) {
        return res.json({ trades: hit.data, cached: true });
      }
    }
    const { trades, fromDisk, stale } = await fetchTradesForToken(token, { refresh });
    tradesCache.set(key, { at: now, data: trades });
    res.json({ trades, cached: fromDisk, ...(stale ? { stale: true } : {}) });
  } catch (e) {
    console.error('[api/trades]', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** Cliente envia txHash após buy/sell na UI — servidor valida recibo na factory e grava em disco. */
app.post('/api/trades/record', async (req, res) => {
  try {
    const tokenAddress = (req.body?.tokenAddress ?? '').trim();
    const txHash = (req.body?.txHash ?? '').trim();
    if (!tokenAddress.startsWith('0x') || tokenAddress.length < 10) {
      return res.status(400).json({ error: 'invalid tokenAddress' });
    }
    if (!txHash.startsWith('0x') || txHash.length < 66) {
      return res.status(400).json({ error: 'invalid txHash' });
    }
    const { trades, added } = await recordTradeFromTxHash(tokenAddress, txHash);
    tradesCache.delete(tokenAddress.toLowerCase());
    res.json({ ok: true, added, tradesCount: trades.length });
  } catch (e) {
    console.warn('[api/trades/record]', e?.message || e);
    res.status(400).json({ error: String(e?.message || e) });
  }
});

app.get('/api/rocket/config', async (_req, res) => {
  try {
    const now = Date.now();
    if (rocketCache.data && now - rocketCache.at < CACHE_ROCKET_MS) {
      return res.json({ ...rocketCache.data, cached: true });
    }
    const config = await getRocketConfig();
    if (!config) return res.status(404).json({ error: 'rocket contract not found' });
    rocketCache = { at: now, data: config };
    res.json({ ...config, cached: false });
  } catch (e) {
    console.error('[api/rocket/config]', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/api/rocket/score/:token', async (req, res) => {
  try {
    const token = (req.params.token || '').trim();
    if (!token.startsWith('0x') || token.length < 10) {
      return res.status(400).json({ error: 'invalid token address' });
    }
    const score = await getRocketScore(token);
    res.json({ score });
  } catch (e) {
    console.error('[api/rocket/score]', e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// PC: 127.0.0.1 (só esta máquina). VPS: BIND_HOST=0.0.0.0 para aceitar Nginx/proxy à frente.
const HOST = process.env.BIND_HOST || '127.0.0.1';
const server = http.createServer(app);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[vault-api] Port ${PORT} is already in use (EADDRINUSE).`);
    console.error(`  • Another vault-api may still be running — close that terminal or kill the process.`);
    console.error(`  • Windows: netstat -ano | findstr :${PORT}`);
    console.error(`  • Then: taskkill /PID <número_do_PID> /F`);
    console.error(`  • Or use another port: set PORT=8788 && npm run server  (and set VITE_API_URL to match)`);
  } else {
    console.error('[vault-api] server error:', err.code, err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  warnIfViteApiUrlPortMismatch();
  console.log(`[vault-api] http://${HOST}:${PORT} (pid ${process.pid})`);
  if (HOST === '127.0.0.1' || HOST === 'localhost') {
    console.log(`[vault-api] frontend .env → VITE_API_URL=http://127.0.0.1:${PORT}`);
  }
  startTradeIndexer();
});
