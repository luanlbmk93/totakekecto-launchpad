import { ethers } from 'ethers';
import { loadTokenFactoryAbi } from './loadAbi.mjs';

// IMPORTANT: default to current BSC TokenFactory proxy (upgradeable).
const DEFAULT_FACTORY = '0x9EF2388a7218f55a374DD6d0d0aE49c8aE7b9f67';

function factoryAddress() {
  return (process.env.TOKEN_FACTORY || DEFAULT_FACTORY).trim();
}

function rpcUrl() {
  return (process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/').trim();
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Same shape as `TokenInfo` in the frontend (JSON-serializable).
 */
export async function fetchAllTokens() {
  // Disable JSON-RPC batching for more predictable public RPC behavior.
  const provider = new ethers.JsonRpcProvider(rpcUrl(), undefined, { batchMaxCount: 1, batchStallTime: 0 });
  const abi = loadTokenFactoryAbi();
  const addr = factoryAddress();
  const factory = new ethers.Contract(addr, abi, provider);

  const code = await provider.getCode(addr);
  if (code === '0x') return [];

  const tokenAddresses = [];
  let index = 0;
  for (;;) {
    try {
      const tokenAddress = await factory.allTokens(index);
      if (tokenAddress === ethers.ZeroAddress) break;
      tokenAddresses.push(tokenAddress);
      index++;
    } catch {
      break;
    }
  }

  if (tokenAddresses.length === 0) return [];

  const CONCURRENCY = Math.min(8, Math.max(2, Number(process.env.TOKEN_FETCH_CONCURRENCY) || 4));

  const maybeTokens = await mapWithConcurrency(tokenAddresses, CONCURRENCY, async (address) => {
    try {
      const [info, bondingCurve, isBanned] = await Promise.all([
        factory.tokenInfo(address),
        factory.bondingCurves(address),
        factory.bannedTokens(address),
      ]);

      const firstBuyLockTier =
        typeof info.firstBuyLockTier === 'bigint'
          ? Number(info.firstBuyLockTier)
          : Number(info.firstBuyLockTier ?? 0);

      return {
        tokenAddress: info.tokenAddress,
        name: info.name,
        symbol: info.symbol,
        description: info.description,
        imageUrl: info.imageUrl,
        website: info.website,
        telegram: info.telegram,
        twitter: info.twitter,
        discord: info.discord,
        creator: info.creator,
        totalSupply: ethers.formatEther(info.totalSupply),
        currentPrice: ethers.formatEther(info.currentPrice),
        marketCap: ethers.formatEther(info.marketCap),
        createdAt: info.createdAt.toString(),
        graduated: info.graduated,
        realETH: ethers.formatEther(bondingCurve.realETH),
        graduationTargetEth: ethers.formatEther(bondingCurve.targetETH),
        creatorTokensBurned: info.creatorTokensBurned,
        vestingEndTime: info.vestingEndTime.toString(),
        dexPair: info.dexPair,
        firstBuyLockTier,
        firstBuyUnlockTime: (info.firstBuyUnlockTime ?? 0n).toString(),
        paysDividends: info.paysDividends ?? false,
        rewardKind: Number(info.rewardKind ?? 0),
        totalTaxBps: Number(info.totalTaxBps ?? 0),
        allocFundsBps: Number(info.allocFundsBps ?? 0),
        allocBurnBps: Number(info.allocBurnBps ?? 0),
        allocDividendBps: Number(info.allocDividendBps ?? 0),
        allocLpBps: Number(info.allocLpBps ?? 0),
        fundsWallet: info.fundsWallet,
        antiBotDurationSec: Number(info.antiBotDurationSec ?? 0),
        antiBotMaxTxBps: Number(info.antiBotMaxTxBps ?? 0),
        antiBotMaxWalletBps: Number(info.antiBotMaxWalletBps ?? 0),
        dividendExempt: info.dividendExempt,
        isBanned,
      };
    } catch {
      return null;
    }
  });

  const tokens = maybeTokens.filter(Boolean);
  tokens.sort((a, b) => parseInt(b.createdAt, 10) - parseInt(a.createdAt, 10));
  return tokens;
}
