import { ethers } from 'ethers';
import { BSC_CHAIN_ID, ETHERSCAN_V2_API, getEtherscanV2ApiKey } from '../config/explorerApi';
import { getBscReadRpcUrl } from '../config/bscReadRpc';
import { getBackendApiUrl } from '../config/apiBackend';

/** When `VITE_API_URL` is set, trades come from the Node API only unless this is `1` / `true` (debug / emergency). */
function allowBrowserTradeIndexingFallback(): boolean {
  const v =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: { VITE_ALLOW_BROWSER_TRADE_INDEXING?: string } }).env
      ?.VITE_ALLOW_BROWSER_TRADE_INDEXING;
  return v === '1' || /^true$/i.test(String(v ?? ''));
}
import { CONTRACT_ADDRESSES, TOKEN_FACTORY_ABI } from '../contracts/contractAddresses';
import { queryFilterChunked } from './queryFilterChunked';

/** Matches `Trade` in useFactoryEvents */
export interface FactoryTradeRow {
  side: 'buy' | 'sell';
  amountETH: number;
  price: number;
  timestamp: number;
  txHash: string;
  user: string;
  tokenAmount: number;
}

const getRpc = () => getBscReadRpcUrl();

function etherscanV2Url(params: Record<string, string>): URL {
  const u = new URL(ETHERSCAN_V2_API);
  u.searchParams.set('chainid', BSC_CHAIN_ID);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  return u;
}

/** Blocks per BscScan getLogs request (large ranges OK when topics filter to one token). */
function apiChunkBlocks(): number {
  const raw =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: { VITE_BSCSCAN_LOG_CHUNK_BLOCKS?: string } }).env
      ?.VITE_BSCSCAN_LOG_CHUNK_BLOCKS;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 15_000;
}

const BETWEEN_BSCSCAN_CALLS_MS = 220;

export function getEventScanConfig() {
  const envBlockRaw =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: { VITE_FACTORY_DEPLOY_BLOCK?: string } }).env?.VITE_FACTORY_DEPLOY_BLOCK;
  const envBlock = envBlockRaw ? Number(envBlockRaw) : NaN;
  const lookbackRaw =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: { VITE_FACTORY_LOG_LOOKBACK_BLOCKS?: string } }).env
      ?.VITE_FACTORY_LOG_LOOKBACK_BLOCKS;
  const lookback = lookbackRaw != null ? Number(lookbackRaw) : NaN;
  const fallbackWindow =
    Number.isFinite(lookback) && lookback > 0 ? Math.floor(lookback) : 1_500_000;

  return {
    deployBlock: Number.isFinite(envBlock) && envBlock > 0 ? envBlock : null,
    fallbackWindow,
  } as const;
}

/** MetaMask / extensão: `eth_getLogs` em centenas de milhares de blocos trava ou demora minutos. */
function getWalletLogLookbackBlocks(): number {
  const raw =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: { VITE_WALLET_FACTORY_LOG_LOOKBACK_BLOCKS?: string } }).env
      ?.VITE_WALLET_FACTORY_LOG_LOOKBACK_BLOCKS;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 80_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function explorerLatestBlock(apiKey: string): Promise<number> {
  const u = etherscanV2Url({
    module: 'proxy',
    action: 'eth_blockNumber',
    apikey: apiKey,
  });
  const res = await fetch(u.toString());
  const json = (await res.json()) as { result?: string; status?: string; message?: string };
  const hex = json.result;
  if (!hex || typeof hex !== 'string') {
    throw new Error(`Etherscan V2 eth_blockNumber (BSC): ${json.message ?? JSON.stringify(json)}`);
  }
  return parseInt(hex, 16);
}

interface BscScanRawLog {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  timeStamp?: string;
  transactionHash?: string;
}

function normalizeExplorerLogRecord(raw: Record<string, unknown>): BscScanRawLog {
  const t = raw.topics ?? raw.Topics;
  let topics: string[] = [];
  if (Array.isArray(t)) {
    topics = t.map(x => String(x).toLowerCase());
  } else if (typeof t === 'string') {
    try {
      const p = JSON.parse(t) as unknown;
      if (Array.isArray(p)) topics = p.map(x => String(x).toLowerCase());
    } catch {
      topics = [];
    }
  }
  let data = (raw.data ?? raw.Data ?? raw.input ?? '0x') as string;
  data = data === '' || data == null ? '0x' : String(data);

  const txh = raw.transactionHash ?? raw.hash ?? raw.txHash;

  return {
    address: raw.address as string | undefined,
    topics,
    data,
    blockNumber: raw.blockNumber as string | undefined,
    timeStamp: (raw.timeStamp ?? (raw as { timestamp?: string }).timestamp) as string | undefined,
    transactionHash: txh as string | undefined,
  };
}

function normalizeGetLogsResult(raw: unknown): BscScanRawLog[] {
  if (Array.isArray(raw)) {
    return raw.map(r => normalizeExplorerLogRecord(r as Record<string, unknown>));
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      if (Array.isArray(p)) {
        return p.map(r => normalizeExplorerLogRecord(r as Record<string, unknown>));
      }
    } catch {
      return [];
    }
  }
  return [];
}

async function explorerGetLogs(
  factory: string,
  tokenAddr: string,
  topic0: string,
  fromBlock: number,
  toBlock: number,
  apiKey: string,
): Promise<BscScanRawLog[]> {
  /** Explorer APIs match topic hex case-sensitively; on-chain logs use lowercase. */
  const topic1 = ethers.zeroPadValue(ethers.getAddress(tokenAddr), 32).toLowerCase();
  const t0 = topic0.toLowerCase();
  const u = etherscanV2Url({
    module: 'logs',
    action: 'getLogs',
    fromBlock: String(fromBlock),
    toBlock: String(toBlock),
    address: ethers.getAddress(factory).toLowerCase(),
    topic0: t0,
    topic0_1_opr: 'and',
    topic1,
    apikey: apiKey,
  });

  const res = await fetch(u.toString());
  const json = (await res.json()) as {
    status: string | number;
    message: string;
    result: unknown;
  };

  if (String(json.status) === '0') {
    const errText =
      typeof json.result === 'string' ? json.result : json.message;
    if (/no records/i.test(String(errText)) || errText === 'No records found') {
      return [];
    }
    throw new Error(`Etherscan V2 getLogs (BSC): ${errText}`);
  }

  return normalizeGetLogsResult(json.result);
}

function parseBlockNumberHex(hex?: string): number {
  if (!hex) return 0;
  const s = String(hex);
  return s.startsWith('0x') ? parseInt(s, 16) : parseInt(s, 10);
}

async function rowFromParsedLog(
  iface: ethers.Interface,
  raw: BscScanRawLog,
  side: 'buy' | 'sell',
  provider: ethers.Provider,
  blockTsCache: Map<number, number>,
): Promise<FactoryTradeRow | null> {
  if (!raw.topics?.length) return null;
  const data = raw.data && raw.data !== '' ? raw.data : '0x';
  let parsed: ethers.LogDescription | null = null;
  try {
    parsed = iface.parseLog({ topics: raw.topics as string[], data });
  } catch {
    return null;
  }
  if (!parsed) return null;

  const args = parsed.args;

  const blockNumber = parseBlockNumberHex(raw.blockNumber);
  let timestamp = 0;
  if (raw.timeStamp && /^\d+$/.test(String(raw.timeStamp))) {
    timestamp = parseInt(String(raw.timeStamp), 10);
  } else if (blockNumber > 0) {
    const cached = blockTsCache.get(blockNumber);
    if (cached !== undefined) {
      timestamp = cached;
    } else {
      const b = await provider.getBlock(blockNumber);
      timestamp = Number(b?.timestamp ?? 0);
      blockTsCache.set(blockNumber, timestamp);
    }
  }

  const txHash = raw.transactionHash ?? '';

  if (side === 'buy') {
    const ethWei = args[2] as bigint;
    const tokenWei = args[3] as bigint;
    const priceWei = args[4] as bigint;
    const ethAmount = parseFloat(ethers.formatEther(ethWei ?? 0n));
    const tokenAmount = parseFloat(ethers.formatEther(tokenWei ?? 0n));
    const newPrice = parseFloat(ethers.formatEther(priceWei ?? 0n));
    const user = String(args[1] ?? '');
    return {
      side: 'buy',
      amountETH: ethAmount,
      price: newPrice,
      timestamp,
      txHash,
      user,
      tokenAmount,
    };
  }

  const tokenWei = args[2] as bigint;
  const ethWei = args[3] as bigint;
  const priceWei = args[4] as bigint;
  const tokenAmount = parseFloat(ethers.formatEther(tokenWei ?? 0n));
  const ethAmount = parseFloat(ethers.formatEther(ethWei ?? 0n));
  const newPrice = parseFloat(ethers.formatEther(priceWei ?? 0n));
  const user = String(args[1] ?? '');
  return {
    side: 'sell',
    amountETH: ethAmount,
    price: newPrice,
    timestamp,
    txHash,
    user,
    tokenAmount,
  };
}

export async function fetchFactoryTradesViaEtherscanV2(tokenAddr: string, apiKey: string): Promise<FactoryTradeRow[]> {
  const factoryAddr = CONTRACT_ADDRESSES.TOKEN_FACTORY;
  const iface = new ethers.Interface(TOKEN_FACTORY_ABI);
  const purchased = iface.getEvent('TokenPurchased');
  const sold = iface.getEvent('TokenSold');
  if (!purchased || !sold) throw new Error('ABI missing TokenPurchased / TokenSold');
  const topicPurchased = purchased.topicHash.toLowerCase();
  const topicSold = sold.topicHash.toLowerCase();

  const provider = new ethers.JsonRpcProvider(getRpc());
  const latest = await explorerLatestBlock(apiKey);
  const { deployBlock, fallbackWindow } = getEventScanConfig();
  const fromBlock = deployBlock ?? Math.max(0, latest - fallbackWindow);

  const chunk = apiChunkBlocks();
  const trades: FactoryTradeRow[] = [];
  const blockTsCache = new Map<number, number>();

  for (let start = fromBlock; start <= latest; start += chunk) {
    const end = Math.min(start + chunk - 1, latest);

    const buyLogs = await explorerGetLogs(factoryAddr, tokenAddr, topicPurchased, start, end, apiKey);
    await sleep(BETWEEN_BSCSCAN_CALLS_MS);
    const sellLogs = await explorerGetLogs(factoryAddr, tokenAddr, topicSold, start, end, apiKey);
    await sleep(BETWEEN_BSCSCAN_CALLS_MS);

    for (const log of buyLogs) {
      const row = await rowFromParsedLog(iface, log, 'buy', provider, blockTsCache);
      if (row) trades.push(row);
    }
    for (const log of sellLogs) {
      const row = await rowFromParsedLog(iface, log, 'sell', provider, blockTsCache);
      if (row) trades.push(row);
    }
  }

  trades.sort((a, b) => a.timestamp - b.timestamp);
  return trades;
}

async function fetchFactoryTradesRpc(
  tokenAddr: string,
  provider?: ethers.Provider,
): Promise<FactoryTradeRow[]> {
  const readProvider = provider ?? new ethers.JsonRpcProvider(getRpc());
  const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, readProvider);
  const baseCfg = getEventScanConfig();
  const { deployBlock, fallbackWindow } =
    provider != null
      ? {
          deployBlock: baseCfg.deployBlock,
          fallbackWindow: Math.min(baseCfg.fallbackWindow, getWalletLogLookbackBlocks()),
        }
      : baseCfg;
  const latestBlock = await readProvider.getBlockNumber();
  const fromBlock = deployBlock ?? Math.max(0, latestBlock - fallbackWindow);

  const purchaseFilter = factory.filters.TokenPurchased(tokenAddr);
  const purchaseEvents = await queryFilterChunked(factory, purchaseFilter, fromBlock, latestBlock);
  const sellFilter = factory.filters.TokenSold(tokenAddr);
  const sellEvents = await queryFilterChunked(factory, sellFilter, fromBlock, latestBlock);

  const trades: FactoryTradeRow[] = [];
  const blockTsCache = new Map<number, number>();
  const getBlockTs = async (blockNumber: number) => {
    const cached = blockTsCache.get(blockNumber);
    if (cached !== undefined) return cached;
    const b = await readProvider.getBlock(blockNumber);
    const ts = Number(b?.timestamp ?? 0);
    blockTsCache.set(blockNumber, ts);
    return ts;
  };

  for (const event of purchaseEvents) {
    const args = event.args;
    if (!args || args.length < 5) continue;
    const timestamp = await getBlockTs(event.blockNumber);
    const buyer = args[1] as string;
    const ethAmount = parseFloat(ethers.formatEther(args[2]));
    const tokenAmount = parseFloat(ethers.formatEther(args[3]));
    const newPrice = parseFloat(ethers.formatEther(args[4]));
    trades.push({
      side: 'buy',
      amountETH: ethAmount,
      price: newPrice,
      timestamp,
      txHash: event.transactionHash,
      user: buyer,
      tokenAmount,
    });
  }

  for (const event of sellEvents) {
    const args = event.args;
    if (!args || args.length < 5) continue;
    const timestamp = await getBlockTs(event.blockNumber);
    const seller = args[1] as string;
    const tokenAmount = parseFloat(ethers.formatEther(args[2]));
    const ethAmount = parseFloat(ethers.formatEther(args[3]));
    const newPrice = parseFloat(ethers.formatEther(args[4]));
    trades.push({
      side: 'sell',
      amountETH: ethAmount,
      price: newPrice,
      timestamp,
      txHash: event.transactionHash,
      user: seller,
      tokenAmount,
    });
  }

  trades.sort((a, b) => a.timestamp - b.timestamp);
  return trades;
}

/**
 * 1) API (`VITE_API_URL`) primeiro — rápido e não trava na MetaMask.
 * 2) Com wallet: getLogs com janela curta; senão Etherscan / RPC público.
 */
async function fetchFactoryTradesUncached(
  tokenAddr: string,
  opts?: { refresh?: boolean; readProvider?: ethers.Provider },
): Promise<FactoryTradeRow[]> {
  const api = getBackendApiUrl();
  if (api) {
    try {
      const q = opts?.refresh ? '?refresh=1' : '';
      const res = await fetch(`${api}/api/trades/${encodeURIComponent(tokenAddr)}${q}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const j = (await res.json()) as { trades?: FactoryTradeRow[] };
        if (Array.isArray(j.trades)) return j.trades;
        throw new Error('Backend JSON: missing or invalid `trades` array');
      }
      const body = await res.text().catch(() => '');
      throw new Error(`Backend /api/trades HTTP ${res.status}: ${body.slice(0, 400)}`);
    } catch (e) {
      if (!allowBrowserTradeIndexingFallback()) {
        const msg = e instanceof Error ? e.message : String(e);
        const networkFail = /failed to fetch|networkerror|load failed/i.test(msg);
        const hint = networkFail
          ? ` Abre no browser ${api}/health — tem de responder {"ok":true,...}. Se não abrir, o API não está a correr (outra janela: npm run server ou npm run dev:full).`
          : '';
        throw new Error(
          `Trades só via servidor (${api}). Liga \`npm run server\` ou usa \`npm run dev:full\`. ${msg}.${hint}`,
        );
      }
      console.warn(
        '[fetchFactoryTrades] Backend falhou — fallback browser (VITE_ALLOW_BROWSER_TRADE_INDEXING):',
        e,
      );
    }
  }

  if (opts?.readProvider) {
    try {
      return await fetchFactoryTradesRpc(tokenAddr, opts.readProvider);
    } catch (e) {
      console.warn('[fetchFactoryTrades] wallet RPC failed, fallback Etherscan/public:', e);
      const apiKey = getEtherscanV2ApiKey();
      if (apiKey) {
        try {
          return await fetchFactoryTradesViaEtherscanV2(tokenAddr, apiKey);
        } catch {
          /* last resort below */
        }
      }
      throw e;
    }
  }

  const apiKey = getEtherscanV2ApiKey();
  if (apiKey) {
    try {
      const viaApi = await fetchFactoryTradesViaEtherscanV2(tokenAddr, apiKey);
      return viaApi;
    } catch {
      /* explorer error — try RPC */
    }
    return fetchFactoryTradesRpc(tokenAddr);
  }
  return fetchFactoryTradesRpc(tokenAddr);
}

const tradeCache = new Map<string, { rows: FactoryTradeRow[]; at: number }>();
const tradeInflight = new Map<string, Promise<FactoryTradeRow[]>>();
const TRADE_CACHE_MS = 45_000;

/** Clears cached trades so the next `fetchFactoryTrades` hits the network again (e.g. refresh button). */
export function invalidateFactoryTradesCache(tokenAddr?: string): void {
  if (tokenAddr) {
    const k = tokenAddr.toLowerCase();
    tradeCache.delete(`${k}:w`);
    tradeCache.delete(`${k}:p`);
    return;
  }
  tradeCache.clear();
}

export type FetchFactoryTradesOptions = { refresh?: boolean; readProvider?: ethers.Provider };

/**
 * Deduplicates concurrent calls and short-TTL caches — avoids double Etherscan/RPC storms when chart + trades hook both load.
 * `refresh: true` ignora cache no browser e pede `?refresh=1` ao servidor (novo scan + atualiza disco).
 */
export async function fetchFactoryTrades(
  tokenAddr: string,
  options?: FetchFactoryTradesOptions,
): Promise<FactoryTradeRow[]> {
  const key = tokenAddr.toLowerCase();
  const mode = options?.readProvider ? 'w' : 'p';
  const cacheKey = `${key}:${mode}`;
  const now = Date.now();
  if (!options?.refresh) {
    const hit = tradeCache.get(cacheKey);
    if (hit && now - hit.at < TRADE_CACHE_MS) {
      return hit.rows;
    }
  }
  const inflightKey = options?.refresh ? `${cacheKey}:refresh` : cacheKey;
  let p = tradeInflight.get(inflightKey);
  if (!p) {
    p = (async () => {
      const rows = await fetchFactoryTradesUncached(tokenAddr, {
        refresh: options?.refresh,
        readProvider: options?.readProvider,
      });
      tradeCache.set(cacheKey, { rows, at: Date.now() });
      return rows;
    })().finally(() => {
      tradeInflight.delete(inflightKey);
    });
    tradeInflight.set(inflightKey, p);
  }
  return p;
}
