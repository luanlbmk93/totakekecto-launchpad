/**
 * Trades por token via HTTP (Etherscan API V2 ou BscScan legacy).
 * Plano free da Etherscan V2 muitas vezes não inclui BSC → usamos BscScan como fallback.
 */
import { ethers } from 'ethers';

const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api';
const BSCSCAN_API = 'https://api.bscscan.com/api';
const BSC_CHAIN = '56';
const BETWEEN_MS = 280;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Alchemy cobra CU por pedido; getLogs em massa estoura 429. Usa seed público para scans longos. */
export function readProviderUrl() {
  const u = (process.env.BSC_RPC_URL || '').trim();
  if (/alchemy\.com/i.test(u)) {
    return (process.env.BSC_RPC_LOGS_FALLBACK || 'https://bsc-dataseed.binance.org/').trim();
  }
  return u || 'https://bsc-dataseed.binance.org/';
}

function v2Url(params) {
  const u = new URL(ETHERSCAN_V2);
  u.searchParams.set('chainid', BSC_CHAIN);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

function bscscanUrl(params) {
  const u = new URL(BSCSCAN_API);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}

async function latestBlockEtherscanV2(apiKey) {
  const u = v2Url({ module: 'proxy', action: 'eth_blockNumber', apikey: apiKey });
  const res = await fetch(u.toString());
  const json = await res.json();
  const hex = json.result;
  if (!hex || typeof hex !== 'string') throw new Error(`eth_blockNumber: ${json.message ?? JSON.stringify(json)}`);
  return parseInt(hex, 16);
}

async function latestBlockBscScan(apiKey) {
  const u = bscscanUrl({ module: 'proxy', action: 'eth_blockNumber', apikey: apiKey });
  const res = await fetch(u.toString());
  const json = await res.json();
  const hex = json.result;
  if (!hex || typeof hex !== 'string') throw new Error(`bscscan eth_blockNumber: ${json.message ?? JSON.stringify(json)}`);
  return parseInt(hex, 16);
}

function normalizeRaw(raw) {
  const t = raw.topics ?? raw.Topics;
  let topics = [];
  if (Array.isArray(t)) topics = t.map((x) => String(x).toLowerCase());
  else if (typeof t === 'string') {
    try {
      const p = JSON.parse(t);
      if (Array.isArray(p)) topics = p.map((x) => String(x).toLowerCase());
    } catch {
      topics = [];
    }
  }
  let data = raw.data ?? raw.Data ?? '0x';
  data = data === '' || data == null ? '0x' : String(data);
  const txh = raw.transactionHash ?? raw.hash ?? raw.txHash;
  return {
    topics,
    data,
    blockNumber: raw.blockNumber,
    timeStamp: raw.timeStamp ?? raw.timestamp,
    transactionHash: txh,
  };
}

function normalizeResult(raw) {
  if (Array.isArray(raw)) return raw.map((r) => normalizeRaw(r));
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map((r) => normalizeRaw(r));
    } catch {
      return [];
    }
  }
  return [];
}

async function getLogsEtherscanV2(factory, tokenAddr, topic0, fromBlock, toBlock, apiKey) {
  const topic1 = ethers.zeroPadValue(ethers.getAddress(tokenAddr), 32).toLowerCase();
  const u = v2Url({
    module: 'logs',
    action: 'getLogs',
    fromBlock: String(fromBlock),
    toBlock: String(toBlock),
    address: ethers.getAddress(factory).toLowerCase(),
    topic0: topic0.toLowerCase(),
    topic0_1_opr: 'and',
    topic1,
    apikey: apiKey,
  });
  const res = await fetch(u.toString());
  const json = await res.json();
  if (String(json.status) === '0') {
    const err = typeof json.result === 'string' ? json.result : json.message;
    if (/no records/i.test(String(err)) || err === 'No records found') return [];
    throw new Error(String(err));
  }
  return normalizeResult(json.result);
}

async function getLogsBscScan(factory, tokenAddr, topic0, fromBlock, toBlock, apiKey) {
  const topic1 = ethers.zeroPadValue(ethers.getAddress(tokenAddr), 32).toLowerCase();
  const u = bscscanUrl({
    module: 'logs',
    action: 'getLogs',
    fromBlock: String(fromBlock),
    toBlock: String(toBlock),
    address: ethers.getAddress(factory).toLowerCase(),
    topic0: topic0.toLowerCase(),
    topic0_1_opr: 'and',
    topic1,
    apikey: apiKey,
  });
  const res = await fetch(u.toString());
  const json = await res.json();
  if (String(json.status) === '0') {
    const err = typeof json.result === 'string' ? json.result : json.message;
    if (/no records/i.test(String(err)) || err === 'No records found') return [];
    throw new Error(String(err));
  }
  return normalizeResult(json.result);
}

function parseBlockHex(hex) {
  if (!hex) return 0;
  const s = String(hex);
  return s.startsWith('0x') ? parseInt(s, 16) : parseInt(s, 10);
}

async function rowFromLog(iface, raw, side, provider, blockTsCache) {
  if (!raw.topics?.length) return null;
  const data = raw.data && raw.data !== '' ? raw.data : '0x';
  let parsed;
  try {
    parsed = iface.parseLog({ topics: raw.topics, data });
  } catch {
    return null;
  }
  if (!parsed) return null;
  const args = parsed.args;
  const blockNumber = parseBlockHex(raw.blockNumber);
  let timestamp = 0;
  if (raw.timeStamp && /^\d+$/.test(String(raw.timeStamp))) {
    timestamp = parseInt(String(raw.timeStamp), 10);
  } else if (blockNumber > 0) {
    if (blockTsCache.has(blockNumber)) timestamp = blockTsCache.get(blockNumber);
    else {
      const b = await provider.getBlock(blockNumber);
      timestamp = Number(b?.timestamp ?? 0);
      blockTsCache.set(blockNumber, timestamp);
    }
  }
  const txHash = raw.transactionHash ?? '';
  if (side === 'buy') {
    const ethWei = args[2];
    const tokenWei = args[3];
    const priceWei = args[4];
    return {
      side: 'buy',
      amountETH: parseFloat(ethers.formatEther(ethWei ?? 0n)),
      price: parseFloat(ethers.formatEther(priceWei ?? 0n)),
      timestamp,
      txHash,
      user: String(args[1] ?? ''),
      tokenAmount: parseFloat(ethers.formatEther(tokenWei ?? 0n)),
    };
  }
  const tokenWei = args[2];
  const ethWei = args[3];
  const priceWei = args[4];
  return {
    side: 'sell',
    amountETH: parseFloat(ethers.formatEther(ethWei ?? 0n)),
    price: parseFloat(ethers.formatEther(priceWei ?? 0n)),
    timestamp,
    txHash,
    user: String(args[1] ?? ''),
    tokenAmount: parseFloat(ethers.formatEther(tokenWei ?? 0n)),
  };
}

function scanConfig() {
  const deployRaw = process.env.FACTORY_DEPLOY_BLOCK || process.env.VITE_FACTORY_DEPLOY_BLOCK;
  const d = deployRaw ? Number(deployRaw) : NaN;
  const lookRaw = process.env.FACTORY_LOG_LOOKBACK_BLOCKS || process.env.VITE_FACTORY_LOG_LOOKBACK_BLOCKS;
  const l = lookRaw ? Number(lookRaw) : NaN;
  return {
    deployBlock: Number.isFinite(d) && d > 0 ? d : null,
    fallbackWindow: Number.isFinite(l) && l > 0 ? Math.floor(l) : 1_500_000,
  };
}

function chunkBlocks() {
  const n = Number(process.env.ETHERSCAN_LOG_CHUNK_BLOCKS);
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 12_000;
}

/**
 * @param {(apiKey: string) => Promise<number>} latestBlockFn
 * @param {(factory: string, token: string, topic0: string, from: number, to: number, apiKey: string) => Promise<any[]>} getLogsFn
 */
async function explorerTradeScan(tokenAddr, apiKey, factoryAddr, abi, latestBlockFn, getLogsFn) {
  const iface = new ethers.Interface(abi);
  const purchased = iface.getEvent('TokenPurchased');
  const sold = iface.getEvent('TokenSold');
  if (!purchased || !sold) throw new Error('ABI missing TokenPurchased / TokenSold');
  const topicPurchased = purchased.topicHash.toLowerCase();
  const topicSold = sold.topicHash.toLowerCase();

  const provider = new ethers.JsonRpcProvider(readProviderUrl());
  const latest = await latestBlockFn(apiKey);
  const { deployBlock, fallbackWindow } = scanConfig();
  const fromBlock = deployBlock ?? Math.max(0, latest - fallbackWindow);

  const chunk = chunkBlocks();
  const trades = [];
  const blockTsCache = new Map();

  for (let start = fromBlock; start <= latest; start += chunk) {
    const end = Math.min(start + chunk - 1, latest);
    const buyLogs = await getLogsFn(factoryAddr, tokenAddr, topicPurchased, start, end, apiKey);
    await sleep(BETWEEN_MS);
    const sellLogs = await getLogsFn(factoryAddr, tokenAddr, topicSold, start, end, apiKey);
    await sleep(BETWEEN_MS);

    for (const log of buyLogs) {
      const row = await rowFromLog(iface, log, 'buy', provider, blockTsCache);
      if (row) trades.push(row);
    }
    for (const log of sellLogs) {
      const row = await rowFromLog(iface, log, 'sell', provider, blockTsCache);
      if (row) trades.push(row);
    }
  }

  trades.sort((a, b) => a.timestamp - b.timestamp);
  return trades;
}

export async function fetchTradesViaEtherscan(tokenAddr, apiKey, factoryAddr, abi) {
  return explorerTradeScan(tokenAddr, apiKey, factoryAddr, abi, latestBlockEtherscanV2, getLogsEtherscanV2);
}

/** BscScan `api.bscscan.com` — chave separada; plano free costuma incluir BSC. */
export async function fetchTradesViaBscScan(tokenAddr, apiKey, factoryAddr, abi) {
  return explorerTradeScan(tokenAddr, apiKey, factoryAddr, abi, latestBlockBscScan, getLogsBscScan);
}
