import { CONTRACT_ADDRESSES } from '../contracts/contractAddresses';
import type { TokenInfo } from '../hooks/useContracts';

const KEY = `vault_tokens_v1_${CONTRACT_ADDRESSES.TOKEN_FACTORY.toLowerCase()}`;

function normalize(t: Partial<TokenInfo>): TokenInfo {
  return {
    tokenAddress: String(t.tokenAddress ?? ''),
    name: String(t.name ?? ''),
    symbol: String(t.symbol ?? ''),
    description: String(t.description ?? ''),
    imageUrl: String(t.imageUrl ?? ''),
    website: String(t.website ?? ''),
    telegram: String(t.telegram ?? ''),
    twitter: String(t.twitter ?? ''),
    discord: String(t.discord ?? ''),
    creator: String(t.creator ?? ''),
    totalSupply: String(t.totalSupply ?? '0'),
    currentPrice: String(t.currentPrice ?? '0'),
    marketCap: String(t.marketCap ?? '0'),
    createdAt: String(t.createdAt ?? '0'),
    graduated: Boolean(t.graduated),
    realETH: String(t.realETH ?? '0'),
    graduationTargetEth: t.graduationTargetEth != null ? String(t.graduationTargetEth) : undefined,
    creatorTokensBurned: Boolean(t.creatorTokensBurned),
    vestingEndTime: String(t.vestingEndTime ?? '0'),
    dexPair: String(t.dexPair ?? ''),
    firstBuyLockTier: Number(t.firstBuyLockTier ?? 0),
    firstBuyUnlockTime: String(t.firstBuyUnlockTime ?? '0'),
    paysDividends: t.paysDividends,
    rewardKind: t.rewardKind,
    totalTaxBps: t.totalTaxBps,
    allocFundsBps: t.allocFundsBps,
    allocBurnBps: t.allocBurnBps,
    allocDividendBps: t.allocDividendBps,
    allocLpBps: t.allocLpBps,
    fundsWallet: t.fundsWallet,
    antiBotDurationSec: t.antiBotDurationSec,
    antiBotMaxTxBps: t.antiBotMaxTxBps,
    antiBotMaxWalletBps: t.antiBotMaxWalletBps,
    dividendExempt: t.dividendExempt,
    isBanned: t.isBanned,
  };
}

/** Last successful `getAllTokens` snapshot — instant paint on next visit. */
export function readTokenListCache(): TokenInfo[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tokens?: unknown };
    if (!Array.isArray(parsed.tokens) || parsed.tokens.length === 0) return null;
    return parsed.tokens.map(x => normalize(x as Partial<TokenInfo>));
  } catch {
    return null;
  }
}

export function writeTokenListCache(tokens: TokenInfo[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), tokens }));
  } catch {
    /* quota / private mode */
  }
}
