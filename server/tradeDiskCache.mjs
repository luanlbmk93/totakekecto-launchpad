/**
 * Trades em disco (VPS): pasta `server/data/trades-cache/` por token.
 * v2: inclui `lastScannedBlock` para merge incremental (novos blocos sem refazer scan inteiro).
 */
import { readFile, writeFile, mkdir, appendFile, unlink } from 'fs/promises';
import path from 'path';

const DISABLED =
  process.env.TRADE_DISK_CACHE_DISABLED === '1' || /^true$/i.test(process.env.TRADE_DISK_CACHE_DISABLED ?? '');
const CACHE_EMPTY =
  process.env.TRADE_CACHE_EMPTY === '1' || /^true$/i.test(process.env.TRADE_CACHE_EMPTY ?? '');
const TTL_MS = Number(process.env.TRADE_DISK_CACHE_TTL_MS ?? 0);
const DIR =
  process.env.TRADE_CACHE_DIR?.trim() || path.join(process.cwd(), 'server', 'data', 'trades-cache');

/** Log append-only (auditoria) — uma linha JSON por evento. */
export const STORAGE_LOG_DIR =
  process.env.TRADE_STORAGE_LOG_DIR?.trim() || path.join(process.cwd(), 'server', 'data', 'trades-storage');

let diskLock = Promise.resolve();

export function withDiskLock(fn) {
  const next = diskLock.then(() => fn());
  diskLock = next.catch(() => {});
  return next;
}

/** Dedupe por txHash (um evento por tx nesta factory). */
export function mergeTradesByTxHash(existing, incoming) {
  const a = Array.isArray(existing) ? existing : [];
  const b = Array.isArray(incoming) ? incoming : [];
  const byTx = new Map();
  for (const t of a) {
    if (t?.txHash) byTx.set(String(t.txHash).toLowerCase(), t);
  }
  for (const t of b) {
    if (t?.txHash) byTx.set(String(t.txHash).toLowerCase(), t);
  }
  return [...byTx.values()].sort((x, y) => (x.timestamp ?? 0) - (y.timestamp ?? 0));
}

/**
 * @returns {Promise<{ trades: object[], lastScannedBlock?: number, v?: number } | null>}
 */
export async function readTradesDisk(tokenAddr) {
  if (DISABLED) return null;
  const key = tokenAddr.toLowerCase();
  const file = path.join(DIR, `${key}.json`);
  try {
    const raw = await readFile(file, 'utf8');
    const j = JSON.parse(raw);
    if (!Array.isArray(j.trades)) return null;
    if (TTL_MS > 0 && typeof j.savedAt === 'number' && Date.now() - j.savedAt > TTL_MS) return null;
    if (j.trades.length === 0 && !CACHE_EMPTY) {
      if (typeof j.lastScannedBlock !== 'number') {
        try {
          await unlink(file);
        } catch {
          /* ignore */
        }
        return null;
      }
    }
    return {
      trades: j.trades,
      lastScannedBlock: typeof j.lastScannedBlock === 'number' ? j.lastScannedBlock : undefined,
      v: j.v,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} tokenAddr
 * @param {object[]} trades
 * @param {number} lastScannedBlock — último bloco já incluído no scan
 */
export async function writeTradesDisk(tokenAddr, trades, lastScannedBlock) {
  if (DISABLED) return;
  if (
    !CACHE_EMPTY &&
    Array.isArray(trades) &&
    trades.length === 0 &&
    typeof lastScannedBlock !== 'number'
  ) {
    return;
  }
  try {
    await mkdir(DIR, { recursive: true });
    const file = path.join(DIR, `${tokenAddr.toLowerCase()}.json`);
    await writeFile(
      file,
      JSON.stringify({
        trades,
        lastScannedBlock,
        savedAt: Date.now(),
        v: 2,
      }),
      'utf8',
    );
  } catch (e) {
    console.warn('[tradeDiskCache] write:', e?.message || e);
  }
}

/**
 * Append-only: registo permanente na VPS (não substitui o JSON por token).
 */
export async function appendTradeStorageLog(line) {
  try {
    await mkdir(STORAGE_LOG_DIR, { recursive: true });
    const file = path.join(STORAGE_LOG_DIR, 'factory-trades.jsonl');
    await appendFile(file, `${JSON.stringify(line)}\n`, 'utf8');
  } catch (e) {
    console.warn('[tradeDiskCache] appendTradeStorageLog:', e?.message || e);
  }
}
