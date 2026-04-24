import { ethers } from 'ethers';

/**
 * Public RPCs often reject a single eth_getLogs over huge ranges.
 * We chunk + parallelize, and if a node returns "block range is too large", split that slice recursively.
 */
const DEFAULT_CHUNK = 2000;
const DEFAULT_PARALLEL = 2;
/** Alchemy Free tier caps eth_getLogs at 10 blocks per request. */
const ALCHEMY_GETLOGS_MAX_BLOCKS = 10;

function getViteEnv(): { chunk?: string; rpc?: string } {
  if (typeof import.meta === 'undefined') return {};
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return {
    chunk: env?.VITE_ETH_GETLOGS_CHUNK_BLOCKS,
    rpc: env?.VITE_BSC_RPC_URL,
  };
}

function isAlchemyRpcUrl(url: string): boolean {
  return /alchemy\.com/i.test(url);
}

function getChunkSize(): number {
  const { chunk: raw, rpc } = getViteEnv();
  const n = raw != null ? Number(raw) : NaN;
  const user = Number.isFinite(n) && n >= 1 ? Math.floor(n) : NaN;

  if (isAlchemyRpcUrl(rpc ?? '')) {
    if (Number.isFinite(user)) return Math.min(user, ALCHEMY_GETLOGS_MAX_BLOCKS);
    return ALCHEMY_GETLOGS_MAX_BLOCKS;
  }

  if (Number.isFinite(user)) return user;
  return DEFAULT_CHUNK;
}

function getParallel(): number {
  const raw =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: { VITE_ETH_GETLOGS_PARALLEL?: string } }).env
      ?.VITE_ETH_GETLOGS_PARALLEL;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.min(16, Math.floor(n)) : DEFAULT_PARALLEL;
}

function isRangeTooLargeError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /too large|-32062|32062|range is too|-32600|Free tier|10 block range|Upgrade to PAYG|eth_getLogs requests with up to/i.test(
      msg,
    )
  );
}

/** One getLogs call; on "range too large", bisect until it fits (Ankr often caps ~300–500 blocks). */
async function queryFilterRangeOrSplit(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  a: number,
  b: number,
  depth = 0,
): Promise<ethers.EventLog[]> {
  if (a > b) return [];
  if (depth > 24) {
    throw new Error(`eth_getLogs: could not satisfy node block-range limits at ${a}–${b}`);
  }
  try {
    return (await contract.queryFilter(filter, a, b)) as ethers.EventLog[];
  } catch (e) {
    if (!isRangeTooLargeError(e) || a >= b) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `eth_getLogs failed for blocks ${a}–${b}. Prefer VITE_ETHERSCAN_API_KEY (HTTP logs) or lower VITE_ETH_GETLOGS_CHUNK_BLOCKS. ${msg}`,
      );
    }
    const mid = Math.floor((a + b) / 2);
    const left = await queryFilterRangeOrSplit(contract, filter, a, mid, depth + 1);
    const right = await queryFilterRangeOrSplit(contract, filter, mid + 1, b, depth + 1);
    return [...left, ...right];
  }
}

export async function queryFilterChunked(
  contract: ethers.Contract,
  filter: ethers.DeferredTopicFilter,
  fromBlock: number,
  toBlock: number,
): Promise<ethers.EventLog[]> {
  const chunkSize = getChunkSize();
  const parallel = getParallel();

  const ranges: { a: number; b: number }[] = [];
  for (let s = fromBlock; s <= toBlock; s += chunkSize) {
    ranges.push({ a: s, b: Math.min(s + chunkSize - 1, toBlock) });
  }

  const all: ethers.EventLog[] = [];
  for (let i = 0; i < ranges.length; i += parallel) {
    const slice = ranges.slice(i, i + parallel);
    const settled = await Promise.allSettled(
      slice.map(({ a, b }) => queryFilterRangeOrSplit(contract, filter, a, b)),
    );
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      if (r.status === 'fulfilled') {
        all.push(...(r.value as ethers.EventLog[]));
      } else {
        const reason = settled[j].reason;
        const msg = reason instanceof Error ? reason.message : String(reason);
        throw new Error(msg);
      }
    }
  }
  return all;
}
