import { ethers } from 'ethers';
import { getBscReadRpcUrl, getBscReadRpcUrls } from '../config/bscReadRpc';
import { CONTRACT_ADDRESSES, TOKEN_FACTORY_ABI } from '../contracts/contractAddresses';

export interface GlobalTrade {
  side: 'buy' | 'sell' | 'create';
  user: string;
  tokenAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenAmount?: number;
  ethAmount?: number;
  txHash: string;
  timestamp: number;
  navigateTo?: string;
}

const FACTORY_ADDRESS = CONTRACT_ADDRESSES.TOKEN_FACTORY;

/**
 * RPC fallback window. Public BSC RPCs cap eth_getLogs to ~5000 blocks per call;
 * we fetch in chunks so we can cover a bigger window (~8h) and still survive rate limits.
 * 1 BSC block = ~3s, so 10_000 blocks ≈ 8.3 hours of history.
 */
const RPC_LOOKBACK_BLOCKS = 10_000;
const RPC_CHUNK_BLOCKS = 4_900; // public RPCs reject > 5000

const IFACE = new ethers.Interface([
  'event TokenPurchased(address indexed tokenAddress,address indexed buyer,uint256 ethAmount,uint256 tokenAmount,uint256 newPrice)',
  'event TokenSold(address indexed tokenAddress,address indexed seller,uint256 tokenAmount,uint256 ethAmount,uint256 newPrice)',
  'event TokenCreated(address indexed tokenAddress,address indexed creator,uint256 timestamp,bool creatorTokensBurned)',
]);

function getHomeFeedUrl(): string | undefined {
  const u = import.meta.env.VITE_HOME_FEED_URL?.trim();
  if (u && u.startsWith('http')) return u;
  return undefined;
}

function isDisabled(): boolean {
  const v = import.meta.env.VITE_DISABLE_HOME_FEED;
  return v === '1' || v === 'true';
}

function parseRemoteTrade(row: unknown): GlobalTrade | null {
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  const side = o.side;
  if (side !== 'buy' && side !== 'sell' && side !== 'create') return null;
  const user = String(o.user ?? '');
  const tokenAddress = String(o.tokenAddress ?? '');
  const txHash = String(o.txHash ?? '');
  if (!tokenAddress.startsWith('0x') || user.length < 10) return null;
  const timestamp = Number(o.timestamp ?? 0);
  return {
    side,
    user,
    tokenAddress,
    tokenName: o.tokenName != null ? String(o.tokenName) : undefined,
    tokenSymbol: o.tokenSymbol != null ? String(o.tokenSymbol) : undefined,
    tokenAmount: o.tokenAmount != null ? Number(o.tokenAmount) : undefined,
    ethAmount: o.ethAmount != null ? Number(o.ethAmount) : undefined,
    txHash: txHash || `remote-${tokenAddress}-${timestamp}`,
    timestamp: Number.isFinite(timestamp) ? timestamp : Math.floor(Date.now() / 1000),
    navigateTo: `/address/${tokenAddress}`,
  };
}

/**
 * Optional: `VITE_HOME_FEED_URL` → GET JSON array (your backend, S3, GitHub raw).
 * Example: `[{ "side":"buy","user":"0x...","tokenAddress":"0x...","tokenSymbol":"FOO","ethAmount":0.1,"tokenAmount":1,"txHash":"0x","timestamp":1710000000 }]`
 */
async function fetchFromRemoteUrl(url: string): Promise<GlobalTrade[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) return [];
    const out: GlobalTrade[] = [];
    for (const row of data) {
      const p = parseRemoteTrade(row);
      if (p) out.push(p);
    }
    out.sort((a, b) => b.timestamp - a.timestamp);
    return out.slice(0, 15);
  } finally {
    clearTimeout(t);
  }
}

/** Try `getLogs` across multiple RPCs with chunked windows until one succeeds. */
async function getLogsResilient(
  fromBlock: number,
  toBlock: number,
): Promise<{ logs: ethers.Log[]; provider: ethers.JsonRpcProvider }> {
  const urls = getBscReadRpcUrls();
  // Always include at least one known-stable public fallback so a rate-limited
  // primary RPC does not silently produce an empty ticker.
  const extended = Array.from(new Set([...urls, 'https://bsc.publicnode.com/']));

  let lastErr: unknown = null;
  for (const url of extended) {
    const provider = new ethers.JsonRpcProvider(url);
    try {
      const out: ethers.Log[] = [];
      let cursor = fromBlock;
      while (cursor <= toBlock) {
        const end = Math.min(cursor + RPC_CHUNK_BLOCKS - 1, toBlock);
        const chunk = await provider.getLogs({
          address: FACTORY_ADDRESS,
          fromBlock: cursor,
          toBlock: end,
        });
        out.push(...chunk);
        cursor = end + 1;
      }
      return { logs: out, provider };
    } catch (e) {
      lastErr = e;
      // Try the next RPC in the list. Rate-limit / gateway errors are expected on public endpoints.
    }
  }
  throw lastErr ?? new Error('All RPCs failed to return factory logs');
}

async function fetchViaRpc(): Promise<GlobalTrade[]> {
  const bootstrap = new ethers.JsonRpcProvider(getBscReadRpcUrl());
  const latestBlock = await bootstrap.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - RPC_LOOKBACK_BLOCKS);

  const { logs, provider } = await getLogsResilient(fromBlock, latestBlock);

  const blockTsCache = new Map<number, number>();
  const getBlockTs = async (blockNumber: number) => {
    const c = blockTsCache.get(blockNumber);
    if (c !== undefined) return c;
    const b = await provider.getBlock(blockNumber);
    const ts = Number(b?.timestamp ?? 0);
    blockTsCache.set(blockNumber, ts);
    return ts;
  };

  const logsRecent = [...logs]
    .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber))
    .slice(0, 120);

  const rows: { trade: GlobalTrade; bn: number }[] = [];
  for (const log of logsRecent) {
    try {
      const decoded = IFACE.parseLog({ data: log.data, topics: [...log.topics] });
      const bn = Number(log.blockNumber);

      const baseTrade = {
        tokenAddress: decoded.args.tokenAddress as string,
        tokenName: '',
        tokenSymbol: '',
        txHash: log.transactionHash,
        timestamp: 0,
        navigateTo: `/address/${decoded.args.tokenAddress}`,
      };

      let trade: GlobalTrade | null = null;
      if (decoded.name === 'TokenPurchased') {
        trade = {
          side: 'buy' as const,
          user: String(decoded.args.buyer),
          ethAmount: parseFloat(ethers.formatEther(decoded.args.ethAmount)),
          tokenAmount: parseFloat(ethers.formatEther(decoded.args.tokenAmount)),
          ...baseTrade,
        };
      } else if (decoded.name === 'TokenSold') {
        trade = {
          side: 'sell' as const,
          user: String(decoded.args.seller),
          ethAmount: parseFloat(ethers.formatEther(decoded.args.ethAmount)),
          tokenAmount: parseFloat(ethers.formatEther(decoded.args.tokenAmount)),
          ...baseTrade,
        };
      } else if (decoded.name === 'TokenCreated') {
        trade = {
          side: 'create' as const,
          user: String(decoded.args.creator),
          ...baseTrade,
        };
      }
      if (trade) rows.push({ trade, bn });
    } catch {
      /* ignore */
    }
  }

  rows.sort((a, b) => b.bn - a.bn);
  const top = rows.slice(0, 10);
  await Promise.all(
    top.map(async ({ trade, bn }) => {
      trade.timestamp = await getBlockTs(bn);
    }),
  );
  top.sort((a, b) => b.trade.timestamp - a.trade.timestamp);
  return top.map(r => r.trade);
}

async function attachTokenSymbols(trades: GlobalTrade[]): Promise<void> {
  const need = trades.filter(t => !t.tokenSymbol?.trim());
  if (need.length === 0) return;
  const provider = new ethers.JsonRpcProvider(getBscReadRpcUrl());
  const factory = new ethers.Contract(FACTORY_ADDRESS, TOKEN_FACTORY_ABI, provider);
  await Promise.all(
    need.map(async t => {
      try {
        const info = await factory.tokenInfo(t.tokenAddress);
        t.tokenName = info.name;
        t.tokenSymbol = info.symbol;
      } catch {
        /* keep */
      }
    }),
  );
}

/**
 * 1) `VITE_HOME_FEED_URL` — JSON from your server/CDN (fastest, no chain scan).
 * 2) `VITE_DISABLE_HOME_FEED` — skip feed entirely.
 * 3) Otherwise RPC `getLogs` over a short window (no Etherscan in this path).
 */
export async function fetchHomeFeedTrades(): Promise<GlobalTrade[]> {
  if (isDisabled()) return [];

  const remote = getHomeFeedUrl();
  if (remote) {
    try {
      const trades = await fetchFromRemoteUrl(remote);
      await attachTokenSymbols(trades);
      return trades;
    } catch (e) {
      console.warn('[homeFeed] VITE_HOME_FEED_URL failed, falling back to RPC', e);
    }
  }

  try {
    const trades = await fetchViaRpc();
    await attachTokenSymbols(trades);
    return trades;
  } catch (e) {
    console.warn(
      '[homeFeed] RPC getLogs failed on all endpoints. Ticker will stay empty until a trade happens recently (or VITE_BSC_RPC_URL is set to a reliable archive-capable RPC).',
      e,
    );
    return [];
  }
}
