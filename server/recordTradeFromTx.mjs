/**
 * Grava trade em disco a partir de UM txHash — o servidor lê o recibo (evento real na factory).
 * Não depende de varrer a chain; o cliente só envia o hash depois de buy/sell na UI.
 */
import { ethers } from 'ethers';
import { loadTokenFactoryAbi } from './loadAbi.mjs';
import { readProviderUrl } from './etherscanTrades.mjs';
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

/**
 * @param {string} tokenAddr
 * @param {string} txHash
 * @returns {Promise<{ trades: object[], added: number }>}
 */
export async function recordTradeFromTxHash(tokenAddr, txHash) {
  const tokenNorm = ethers.getAddress(tokenAddr).toLowerCase();
  const h = String(txHash).trim().toLowerCase();
  if (!/^0x([0-9a-f]{64})$/.test(h)) {
    throw new Error('invalid txHash');
  }

  const provider = new ethers.JsonRpcProvider(readProviderUrl(), undefined, {
    batchMaxCount: 1,
    batchStallTime: 0,
  });
  const receipt = await provider.getTransactionReceipt(h);
  if (!receipt) {
    throw new Error('transaction not found (RPC may be lagging — retry)');
  }
  if (receipt.status !== 1) {
    throw new Error('transaction reverted');
  }

  const abi = loadTokenFactoryAbi();
  const iface = new ethers.Interface(abi);
  const fac = factoryAddress().toLowerCase();

  const block = await provider.getBlock(receipt.blockNumber);
  const ts = Number(block?.timestamp ?? 0);

  const newRows = [];
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== fac) continue;
    let parsed;
    try {
      parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      continue;
    }
    if (parsed.name !== 'TokenPurchased' && parsed.name !== 'TokenSold') continue;

    const t0 = String(parsed.args[0]).toLowerCase();
    if (t0 !== tokenNorm) continue;

    if (parsed.name === 'TokenPurchased') {
      const buyer = String(parsed.args[1]);
      const ethAmount = parseFloat(ethers.formatEther(parsed.args[2]));
      const tokenAmount = parseFloat(ethers.formatEther(parsed.args[3]));
      const newPrice = parseFloat(ethers.formatEther(parsed.args[4]));
      newRows.push({
        side: 'buy',
        amountETH: ethAmount,
        price: newPrice,
        timestamp: ts,
        txHash: receipt.hash,
        user: buyer,
        tokenAmount,
      });
    } else {
      const seller = String(parsed.args[1]);
      const tokenAmount = parseFloat(ethers.formatEther(parsed.args[2]));
      const ethAmount = parseFloat(ethers.formatEther(parsed.args[3]));
      const newPrice = parseFloat(ethers.formatEther(parsed.args[4]));
      newRows.push({
        side: 'sell',
        amountETH: ethAmount,
        price: newPrice,
        timestamp: ts,
        txHash: receipt.hash,
        user: seller,
        tokenAmount,
      });
    }
  }

  if (newRows.length === 0) {
    throw new Error('no TokenPurchased/TokenSold for this token in this transaction');
  }

  return await withDiskLock(async () => {
    const disk = await readTradesDisk(tokenNorm);
    const existing = disk?.trades ?? [];
    const merged = mergeTradesByTxHash(existing, newRows);
    const prevLb = typeof disk?.lastScannedBlock === 'number' ? disk.lastScannedBlock : 0;
    const blockNum = Number(receipt.blockNumber);
    await writeTradesDisk(tokenNorm, merged, Math.max(prevLb, blockNum));
    for (const t of newRows) {
      await appendTradeStorageLog({
        token: tokenNorm,
        side: t.side,
        txHash: t.txHash,
        timestamp: t.timestamp,
        source: 'user-tx',
      });
    }
    const added = newRows.length;
    return { trades: merged, added };
  });
}
