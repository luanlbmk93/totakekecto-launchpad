import { ethers } from 'ethers';
import { loadTokenFactoryAbi } from './loadAbi.mjs';
import { queryFilterChunked } from './chunked.mjs';
import { fetchTradesViaEtherscan, fetchTradesViaBscScan, readProviderUrl } from './etherscanTrades.mjs';
import {
  readTradesDisk,
  writeTradesDisk,
  mergeTradesByTxHash,
  withDiskLock,
  appendTradeStorageLog,
} from './tradeDiskCache.mjs';

// IMPORTANT: default to current BSC TokenFactory proxy (upgradeable).
const DEFAULT_FACTORY = '0x9EF2388a7218f55a374DD6d0d0aE49c8aE7b9f67';

function factoryAddress() {
  return (process.env.TOKEN_FACTORY || DEFAULT_FACTORY).trim();
}

function rpcUrl() {
  return readProviderUrl();
}

function makeProvider() {
  // Disable JSON-RPC batching to avoid providers rate-limiting `eth_getLogs` "in batch" (-32005).
  return new ethers.JsonRpcProvider(rpcUrl(), undefined, { batchMaxCount: 1, batchStallTime: 0 });
}

/** Chave só BscScan (legacy api.bscscan.com) — fallback quando Etherscan V2 free não cobre BSC. */
function bscscanKey() {
  const a = process.env.BSCSCAN_API_KEY?.trim();
  if (a && a.length > 8) return a;
  const b = process.env.VITE_BSCSCAN_API_KEY?.trim();
  if (b && b.length > 8) return b;
  return '';
}

/** Mesma chave Etherscan V2 que no frontend — pode estar no .env como VITE_ETHERSCAN_API_KEY */
function etherscanKey() {
  const a = process.env.ETHERSCAN_API_KEY?.trim();
  if (a && a.length > 8) return a;
  const b = process.env.VITE_ETHERSCAN_API_KEY?.trim();
  if (b && b.length > 8) return b;
  const c = process.env.BSCSCAN_API_KEY?.trim();
  if (c && c.length > 8) return c;
  return '';
}

/**
 * RPC fallback: janela mais pequena por defeito (menos getLogs) se não definires FACTORY_LOG_LOOKBACK_BLOCKS.
 */
function getRpcScanConfig() {
  const deployRaw = process.env.FACTORY_DEPLOY_BLOCK || process.env.VITE_FACTORY_DEPLOY_BLOCK;
  const deployBlock = deployRaw ? Number(deployRaw) : NaN;
  const lookRaw = process.env.FACTORY_LOG_LOOKBACK_BLOCKS || process.env.VITE_FACTORY_LOG_LOOKBACK_BLOCKS;
  const lookback = lookRaw ? Number(lookRaw) : NaN;
  const defaultRpcWindow = Number(process.env.RPC_LOG_LOOKBACK_DEFAULT) || 400_000;
  return {
    deployBlock: Number.isFinite(deployBlock) && deployBlock > 0 ? deployBlock : null,
    fallbackWindow: Number.isFinite(lookback) && lookback > 0 ? Math.floor(lookback) : defaultRpcWindow,
  };
}

async function applyIncrementalUpdateToDisk(tokenAddr, fromBlock, toBlock) {
  if (fromBlock > toBlock) return;
  const inc = await fetchTradesIncremental(tokenAddr, fromBlock, toBlock);
  if (!inc || inc.length === 0) {
    await withDiskLock(async () => {
      const disk = await readTradesDisk(tokenAddr);
      const existing = disk?.trades ?? [];
      const prevLb = typeof disk?.lastScannedBlock === 'number' ? disk.lastScannedBlock : 0;
      await writeTradesDisk(tokenAddr, existing, Math.max(prevLb, toBlock));
    });
    return;
  }
  await withDiskLock(async () => {
    const disk = await readTradesDisk(tokenAddr);
    const existing = disk?.trades ?? [];
    const merged = mergeTradesByTxHash(existing, inc);
    for (const t of inc) {
      await appendTradeStorageLog({
        token: tokenAddr.toLowerCase(),
        side: t.side,
        txHash: t.txHash,
        timestamp: t.timestamp,
        source: 'incremental',
      });
    }
    const prevLb = typeof disk?.lastScannedBlock === 'number' ? disk.lastScannedBlock : 0;
    await writeTradesDisk(tokenAddr, merged, Math.max(prevLb, toBlock));
  });
}

async function fetchTradesViaRpc(tokenAddr) {
  const provider = makeProvider();
  const abi = loadTokenFactoryAbi();
  const factory = new ethers.Contract(factoryAddress(), abi, provider);
  const { deployBlock, fallbackWindow } = getRpcScanConfig();
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = deployBlock ?? Math.max(0, latestBlock - fallbackWindow);

  const purchaseFilter = factory.filters.TokenPurchased(tokenAddr);
  const purchaseEvents = await queryFilterChunked(factory, purchaseFilter, fromBlock, latestBlock);
  const sellFilter = factory.filters.TokenSold(tokenAddr);
  const sellEvents = await queryFilterChunked(factory, sellFilter, fromBlock, latestBlock);

  const trades = [];
  const blockTsCache = new Map();
  const getBlockTs = async (blockNumber) => {
    const c = blockTsCache.get(blockNumber);
    if (c !== undefined) return c;
    const b = await provider.getBlock(blockNumber);
    const ts = Number(b?.timestamp ?? 0);
    blockTsCache.set(blockNumber, ts);
    return ts;
  };

  for (const event of purchaseEvents) {
    const args = event.args;
    if (!args || args.length < 5) continue;
    const timestamp = await getBlockTs(event.blockNumber);
    const buyer = args[1];
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
    const seller = args[1];
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

/** Só blocos [fromBlock, toBlock] — para merge incremental após snapshot em disco. */
async function fetchTradesIncremental(tokenAddr, fromBlock, toBlock) {
  if (fromBlock > toBlock) return [];
  const provider = makeProvider();
  const abi = loadTokenFactoryAbi();
  const factory = new ethers.Contract(factoryAddress(), abi, provider);

  const purchaseFilter = factory.filters.TokenPurchased(tokenAddr);
  const purchaseEvents = await queryFilterChunked(factory, purchaseFilter, fromBlock, toBlock);
  const sellFilter = factory.filters.TokenSold(tokenAddr);
  const sellEvents = await queryFilterChunked(factory, sellFilter, fromBlock, toBlock);

  const trades = [];
  const blockTsCache = new Map();
  const getBlockTs = async (blockNumber) => {
    const c = blockTsCache.get(blockNumber);
    if (c !== undefined) return c;
    const b = await provider.getBlock(blockNumber);
    const ts = Number(b?.timestamp ?? 0);
    blockTsCache.set(blockNumber, ts);
    return ts;
  };

  for (const event of purchaseEvents) {
    const args = event.args;
    if (!args || args.length < 5) continue;
    const timestamp = await getBlockTs(event.blockNumber);
    const buyer = args[1];
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
    const seller = args[1];
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
 * Scan ao vivo (BscScan / Etherscan V2 / RPC). Caro em tempo — usar só quando não há cache em disco.
 */
async function fetchTradesLive(tokenAddr) {
  const key = etherscanKey();
  const abi = loadTokenFactoryAbi();
  const factory = factoryAddress();

  if (key) {
    try {
      return await fetchTradesViaEtherscan(tokenAddr, key, factory, abi);
    } catch (e) {
      const msg = String(e?.message || e);
      console.warn('[api/trades] Etherscan V2 falhou:', msg);
      const bsk = bscscanKey();
      if (bsk) {
        try {
          console.warn('[api/trades] A tentar BscScan API (api.bscscan.com)…');
          return await fetchTradesViaBscScan(tokenAddr, bsk, factory, abi);
        } catch (e2) {
          console.warn('[api/trades] BscScan também falhou:', e2?.message || e2);
        }
      } else if (/not supported for this chain|full chain coverage|upgrade your api plan/i.test(msg)) {
        console.warn(
          '[api/trades] Coloca BSCSCAN_API_KEY (BscScan) no .env — o plano free da Etherscan V2 muitas vezes não inclui BSC.',
        );
      }
      console.warn('[api/trades] A usar RPC (getLogs; se BSC_RPC_URL for Alchemy, usa seed público via readProviderUrl).');
    }
  } else {
    const bsk = bscscanKey();
    if (bsk) {
      try {
        return await fetchTradesViaBscScan(tokenAddr, bsk, factory, abi);
      } catch (e) {
        console.warn('[api/trades] BscScan falhou:', e?.message || e);
      }
    }
    console.warn(
      '[api/trades] Sem chave Etherscan/BscScan — só RPC. Adiciona BSCSCAN_API_KEY ou VITE_ETHERSCAN_API_KEY (pago) para BSC na V2.',
    );
  }
  return fetchTradesViaRpc(tokenAddr);
}

/**
 * @param {{ refresh?: boolean }} [options] — `refresh: true` ignora disco e volta a fazer scan completo.
 * @returns {{ trades: object[], fromDisk: boolean }}
 */
export async function fetchTradesForToken(tokenAddr, options = {}) {
  const refresh = options.refresh === true;
  const provider = makeProvider();
  const latest = await provider.getBlockNumber();

  if (!refresh) {
    const disk = await readTradesDisk(tokenAddr);
    if (disk !== null && typeof disk.lastScannedBlock === 'number') {
      if (disk.lastScannedBlock >= latest) {
        return { trades: disk.trades, fromDisk: true };
      }
      // Serve disk immediately to avoid long-polling/hanging requests on public RPC.
      // Update in background (stale-while-revalidate).
      const bgOn = process.env.TRADE_INCREMENTAL_BACKGROUND !== '0';
      if (bgOn) {
        void applyIncrementalUpdateToDisk(tokenAddr, disk.lastScannedBlock + 1, latest).catch((e) => {
          console.warn('[api/trades] incremental background failed:', e?.message || e);
        });
        return { trades: disk.trades, fromDisk: true, stale: true };
      }
      const inc = await fetchTradesIncremental(tokenAddr, disk.lastScannedBlock + 1, latest);
      const merged = mergeTradesByTxHash(disk.trades, inc);
      await withDiskLock(async () => {
        const prevLb = typeof disk.lastScannedBlock === 'number' ? disk.lastScannedBlock : 0;
        await writeTradesDisk(tokenAddr, merged, Math.max(prevLb, latest));
      });
      return { trades: merged, fromDisk: false };
    }
    if (disk !== null && typeof disk.lastScannedBlock !== 'number') {
      const trades = await fetchTradesLive(tokenAddr);
      await withDiskLock(async () => {
        await writeTradesDisk(tokenAddr, trades, latest);
      });
      return { trades, fromDisk: false };
    }
  }

  const trades = await fetchTradesLive(tokenAddr);
  await withDiskLock(async () => {
    await writeTradesDisk(tokenAddr, trades, latest);
  });
  return { trades, fromDisk: false };
}

/**
 * Indexador: aplica logs da factory num intervalo de blocos a todos os tokens tocados.
 * Grava em `server/data/trades-cache/` + linhas em `trades-storage/factory-trades.jsonl`.
 */
export async function applyFactoryLogsToDisk(fromBlock, toBlock) {
  if (fromBlock > toBlock) return { tokensTouched: 0 };
  const provider = makeProvider();
  const abi = loadTokenFactoryAbi();
  const factory = new ethers.Contract(factoryAddress(), abi, provider);
  const purchaseEvents = await queryFilterChunked(
    factory,
    factory.filters.TokenPurchased(),
    fromBlock,
    toBlock,
  );
  const sellEvents = await queryFilterChunked(factory, factory.filters.TokenSold(), fromBlock, toBlock);

  const blockTsCache = new Map();
  const getBlockTs = async (blockNumber) => {
    const c = blockTsCache.get(blockNumber);
    if (c !== undefined) return c;
    const b = await provider.getBlock(blockNumber);
    const ts = Number(b?.timestamp ?? 0);
    blockTsCache.set(blockNumber, ts);
    return ts;
  };

  /** @type {Map<string, object[]>} */
  const byToken = new Map();

  for (const event of purchaseEvents) {
    const args = event.args;
    if (!args || args.length < 5) continue;
    const tokenAddr = String(args[0]).toLowerCase();
    const timestamp = await getBlockTs(event.blockNumber);
    const buyer = args[1];
    const ethAmount = parseFloat(ethers.formatEther(args[2]));
    const tokenAmount = parseFloat(ethers.formatEther(args[3]));
    const newPrice = parseFloat(ethers.formatEther(args[4]));
    const row = {
      side: 'buy',
      amountETH: ethAmount,
      price: newPrice,
      timestamp,
      txHash: event.transactionHash,
      user: buyer,
      tokenAmount,
    };
    if (!byToken.has(tokenAddr)) byToken.set(tokenAddr, []);
    byToken.get(tokenAddr).push(row);
  }

  for (const event of sellEvents) {
    const args = event.args;
    if (!args || args.length < 5) continue;
    const tokenAddr = String(args[0]).toLowerCase();
    const timestamp = await getBlockTs(event.blockNumber);
    const seller = args[1];
    const tokenAmount = parseFloat(ethers.formatEther(args[2]));
    const ethAmount = parseFloat(ethers.formatEther(args[3]));
    const newPrice = parseFloat(ethers.formatEther(args[4]));
    const row = {
      side: 'sell',
      amountETH: ethAmount,
      price: newPrice,
      timestamp,
      txHash: event.transactionHash,
      user: seller,
      tokenAmount,
    };
    if (!byToken.has(tokenAddr)) byToken.set(tokenAddr, []);
    byToken.get(tokenAddr).push(row);
  }

  let tokensTouched = 0;
  await withDiskLock(async () => {
    for (const [tokenAddr, newRows] of byToken) {
      newRows.sort((a, b) => a.timestamp - b.timestamp);
      const disk = await readTradesDisk(tokenAddr);
      const existing = disk?.trades ?? [];
      const merged = mergeTradesByTxHash(existing, newRows);
      for (const t of newRows) {
        await appendTradeStorageLog({
          token: tokenAddr,
          side: t.side,
          txHash: t.txHash,
          timestamp: t.timestamp,
          source: 'indexer',
        });
      }
      const prevLb = typeof disk?.lastScannedBlock === 'number' ? disk.lastScannedBlock : 0;
      await writeTradesDisk(tokenAddr, merged, Math.max(prevLb, toBlock));
      tokensTouched += 1;
    }
  });

  return { tokensTouched };
}
