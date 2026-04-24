import { ethers } from 'ethers';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Chunks menores + pausa entre pedidos = menos rate limit (Ankr, etc.). */
const DEFAULT_CHUNK = 450;
const DEFAULT_PARALLEL = 1;
const ALCHEMY_GETLOGS_MAX_BLOCKS = 10;
const BETWEEN_CHUNK_MS = Number(process.env.ETH_GETLOGS_SLEEP_MS) || 600;

function isAlchemyRpcUrl(url) {
  return /alchemy\.com/i.test(url || '');
}

function getChunkSize() {
  const n = Number(process.env.ETH_GETLOGS_CHUNK_BLOCKS);
  const user = Number.isFinite(n) && n >= 1 ? Math.floor(n) : NaN;
  const rpc = process.env.BSC_RPC_URL || '';
  if (isAlchemyRpcUrl(rpc)) {
    if (Number.isFinite(user)) return Math.min(user, ALCHEMY_GETLOGS_MAX_BLOCKS);
    return ALCHEMY_GETLOGS_MAX_BLOCKS;
  }
  if (Number.isFinite(user)) return user;
  return DEFAULT_CHUNK;
}

function getParallel() {
  const n = Number(process.env.ETH_GETLOGS_PARALLEL);
  return Number.isFinite(n) && n >= 1 ? Math.min(8, Math.floor(n)) : DEFAULT_PARALLEL;
}

/** Full text for matching (ethers v6 wraps RPC errors as "could not coalesce error …"). */
function fullErrorText(e) {
  if (!e) return '';
  const parts = [
    typeof e?.shortMessage === 'string' ? e.shortMessage : '',
    typeof e?.message === 'string' ? e.message : '',
    typeof e?.info?.error?.message === 'string' ? e.info.error.message : '',
    e?.code != null ? String(e.code) : '',
  ];
  try {
    parts.push(JSON.stringify(e).slice(0, 2000));
  } catch {
    /* ignore */
  }
  return parts.filter(Boolean).join(' ');
}

function isRangeTooLargeError(e) {
  const msg = fullErrorText(e);
  return /too large|-32062|32062|range is too|-32600|Free tier|10 block range|Upgrade to PAYG|eth_getLogs requests with up to/i.test(
    msg,
  );
}

function isRateLimitError(e) {
  const msg = fullErrorText(e);
  return /429|compute units|throughput|rate limit|exceeded its compute|-32005|limit exceeded|could not coalesce/i.test(msg);
}

/** When true, split [a,b] in half — covers -32005 / limit exceeded and ethers "coalesce" wrapper. */
function shouldSplitGetLogsError(e) {
  if (isRangeTooLargeError(e)) return true;
  const msg = fullErrorText(e);
  return /-32005|limit exceeded|could not coalesce/i.test(msg);
}

async function queryFilterRangeOrSplit(contract, filter, a, b, depth = 0) {
  if (a > b) return [];
  if (depth > 28) {
    throw new Error(`eth_getLogs: could not satisfy node block-range limits at ${a}–${b}`);
  }
  const maxRetries = Number(process.env.ETH_GETLOGS_429_RETRIES) || 8;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await contract.queryFilter(filter, a, b);
    } catch (e) {
      if (isRateLimitError(e) && attempt < maxRetries - 1) {
        await sleep(700 + attempt * 550);
        continue;
      }
      // -32005 / limit exceeded often need a smaller block range, not only more retries.
      if ((isRangeTooLargeError(e) || shouldSplitGetLogsError(e)) && a < b) {
        const mid = Math.floor((a + b) / 2);
        const left = await queryFilterRangeOrSplit(contract, filter, a, mid, depth + 1);
        const right = await queryFilterRangeOrSplit(contract, filter, mid + 1, b, depth + 1);
        return [...left, ...right];
      }
      throw e;
    }
  }
  throw new Error(`eth_getLogs: retries exhausted at blocks ${a}–${b}`);
}

export async function queryFilterChunked(contract, filter, fromBlock, toBlock) {
  const chunkSize = getChunkSize();
  const parallel = getParallel();
  const ranges = [];
  for (let s = fromBlock; s <= toBlock; s += chunkSize) {
    ranges.push({ a: s, b: Math.min(s + chunkSize - 1, toBlock) });
  }
  const all = [];
  for (let i = 0; i < ranges.length; i += parallel) {
    if (i > 0) await sleep(BETWEEN_CHUNK_MS);
    const slice = ranges.slice(i, i + parallel);
    const settled = await Promise.allSettled(
      slice.map(({ a, b }) => queryFilterRangeOrSplit(contract, filter, a, b)),
    );
    for (const r of settled) {
      if (r.status === 'fulfilled') all.push(...r.value);
      else throw r.reason;
    }
  }
  return all;
}
