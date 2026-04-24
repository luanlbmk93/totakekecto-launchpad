/**
 * Indexador em background: avança bloco a bloco na factory e grava trades em disco.
 * Estado: `server/data/indexer-state.json` → { lastBlock }.
 * Desliga com TRADE_INDEXER_ENABLED=0
 */
import fs from 'fs/promises';
import path from 'path';
import { ethers } from 'ethers';
import { applyFactoryLogsToDisk } from './tradesService.mjs';
import { readProviderUrl } from './etherscanTrades.mjs';

const STATE_PATH =
  process.env.TRADE_INDEXER_STATE_PATH?.trim() ||
  path.join(process.cwd(), 'server', 'data', 'indexer-state.json');

const POLL_MS = Number(process.env.TRADE_INDEXER_POLL_MS) || 20_000;
const MAX_BLOCKS = Number(process.env.TRADE_INDEXER_MAX_BLOCKS) || 12_000;

function deployBlockGuess() {
  const raw = process.env.FACTORY_DEPLOY_BLOCK || process.env.VITE_FACTORY_DEPLOY_BLOCK;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

async function readState() {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    const j = JSON.parse(raw);
    if (typeof j.lastBlock === 'number' && j.lastBlock >= 0) return j.lastBlock;
  } catch {
    /* no file */
  }
  return null;
}

async function writeState(lastBlock) {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify({ lastBlock, updatedAt: Date.now() }, null, 0), 'utf8');
}

export async function runIndexerOnce() {
  // Disable JSON-RPC batching to avoid `eth_getLogs` batch rate limits (-32005) during indexing.
  const provider = new ethers.JsonRpcProvider(readProviderUrl(), undefined, { batchMaxCount: 1, batchStallTime: 0 });
  const latest = await provider.getBlockNumber();
  let from = (await readState()) ?? null;
  if (from === null) {
    const dep = deployBlockGuess();
    from = dep != null ? dep - 1 : Math.max(0, latest - 5_000);
  }
  const start = from + 1;
  if (start > latest) {
    return { skipped: true, lastBlock: from, latest };
  }
  const to = Math.min(start + MAX_BLOCKS - 1, latest);
  const { tokensTouched } = await applyFactoryLogsToDisk(start, to);
  await writeState(to);
  return { skipped: false, fromBlock: start, toBlock: to, tokensTouched, latest };
}

let timer = null;

export function startTradeIndexer() {
  const off =
    process.env.TRADE_INDEXER_ENABLED === '0' || /^false$/i.test(process.env.TRADE_INDEXER_ENABLED ?? '');
  if (off) {
    console.log('[tradeIndexer] desligado (TRADE_INDEXER_ENABLED=0)');
    return;
  }

  const tick = async () => {
    try {
      const r = await runIndexerOnce();
      if (r.skipped) return;
      console.log(
        `[tradeIndexer] blocos ${r.fromBlock}–${r.toBlock} tokens=${r.tokensTouched} head=${r.latest}`,
      );
    } catch (e) {
      console.warn('[tradeIndexer]', e?.message || e);
    }
  };

  void tick();
  timer = setInterval(tick, POLL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`[tradeIndexer] ativo a cada ${POLL_MS}ms (max ${MAX_BLOCKS} blocos/tick) → ${STATE_PATH}`);
}

export function stopTradeIndexer() {
  if (timer) clearInterval(timer);
  timer = null;
}
