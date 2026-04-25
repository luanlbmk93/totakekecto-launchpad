import { useState } from 'react';
import { ethers, parseEther, isAddress, getAddress, ZeroAddress } from 'ethers';
import { useWeb3 } from './useWeb3';
import { CONTRACT_ADDRESSES, TOKEN_FACTORY_ABI } from '../contracts/contractAddresses';
import { mineVanitySalt } from '../utils/mineVanitySalt';
import { getBscReadRpcUrl, getBscReadRpcUrls } from '../config/bscReadRpc';
import { getBackendApiUrl } from '../config/apiBackend';
import { pushTradeToBackend } from '../utils/recordTrade';
import {
  getBuyAmountWei,
  getSellAmountWei,
  presaleNetEthFromGrossWei,
} from '../utils/bondingMath';
import toast from 'react-hot-toast';
import { validateCreateTokenMetadata } from '../utils/tokenCreateMetadata';

// ---------- Fallback RPC p/ leitura sem wallet (usa VITE_BSC_RPC_URL quando definido) ----------
let publicProviderSingleton: ethers.JsonRpcProvider | null = null;
function getPublicProvider(): ethers.JsonRpcProvider {
  if (!publicProviderSingleton) {
    publicProviderSingleton = new ethers.JsonRpcProvider(getBscReadRpcUrl());
  }
  return publicProviderSingleton;
}

function getPublicReadProviders(): ethers.JsonRpcProvider[] {
  return getBscReadRpcUrls().map((u) => new ethers.JsonRpcProvider(u));
}

// --------------------------------------------------------

const DEBUG = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;
const debugLog = (...args: any[]) => {
  if (DEBUG) console.log(...args);
};

export type TokenListLoadDiag = {
  /** Human-readable summary for UI */
  headline: string;
  /** Extra detail lines */
  details: string[];
  /** Severity for styling */
  severity: 'info' | 'warn' | 'error';
};

let lastTokenListLoadDiag: TokenListLoadDiag | null = null;

export function getTokenListLoadDiagnostics(): TokenListLoadDiag | null {
  return lastTokenListLoadDiag;
}

function isLikelyRpcOrNetworkError(e: unknown): boolean {
  const msg = String((e as any)?.shortMessage || (e as any)?.message || e);
  return /unauthorized|api key|missing response|failed to detect network|timeout|network|could not coalesce error|bad gateway|service unavailable|429|rate limit/i.test(
    msg
  );
}

function isLikelyWrongChainError(e: unknown): boolean {
  const msg = String((e as any)?.shortMessage || (e as any)?.message || e);
  return /wrong network|invalid chain|chain id|unsupported chain|chain mismatch/i.test(msg);
}

function isMissingRevertDataError(e: unknown): boolean {
  const msg = String((e as any)?.shortMessage || (e as any)?.message || e);
  return /missing revert data/i.test(msg);
}

/**
 * Map TokenFactory custom errors to friendly, actionable messages.
 * Requires the `error ...()` entries in TOKEN_FACTORY_ABI so ethers can decode them.
 */
const FACTORY_ERROR_MESSAGES: Record<string, string> = {
  NotInitialized: 'Factory not initialized (tokenDeployer address missing).',
  InsufficientValue: 'Not enough BNB sent: need at least CREATION_MIN_FEE + MIN_CREATOR_FIRST_BUY.',
  FirstBuyTooSmall:
    'First buy below the minimum. Raise the first-buy amount (standard: 0.0001 BNB; CTO lock requires 0.5 BNB minimum).',
  InvalidLockTier: 'Invalid first-buy lock tier (allowed: 0, 1, 2, 3).',
  DexFeeCap: 'Total tax exceeds MAX_TOTAL_TAX_BPS (10%).',
  AllocSum: 'Tax allocation buckets (Funds+Burn+Dividend+LP) must sum to exactly 100% (10000 bps).',
  RewardKindInvalid:
    'Reward kind invalid: use 0 (BNB) or 1 (USDT) when dividends ON; must be 0 when dividends OFF.',
  InvalidTreasury: 'Funds wallet required when Funds allocation > 0.',
  AntiBotCfg:
    'Anti-bot config invalid: duration must be 0 or exactly 1 day (86400s); max-tx/wallet bps must be 0.',
  InvalidSalt:
    'Vanity salt rejected on-chain (predicted address did not match). Recompile contracts so the MemeCoin artifact in the frontend matches the deployed TokenDeployer.',
  Reentrancy: 'Reentrancy lock triggered — retry the transaction.',
  OnlyOwner: 'Only contract owner can call this function.',
  BurnAgentNotSet: 'Burn agent not set on the factory.',
  EcoFeeFail: 'Ecosystem fee transfer failed.',
  CreationFeeFail: 'Creation fee transfer failed.',
  CreatorFeeFail: 'Creator fee transfer failed.',
  NetEthZero: 'Net ETH after fees is zero — raise first-buy amount.',
  CtoMaxBuy: 'Buy exceeds 5% cap per transaction during bonding phase.',
  CtoMaxWallet: 'Wallet would exceed 5% cap after this buy.',
  AlreadyGraduated: 'Token already graduated to DEX.',
  TokenAlreadyGraduated: 'Token already graduated to DEX.',
  TokenBanned_: 'Token is banned by the admin.',
  TokenMissing: 'Token not found in factory.',
};

type TxAction = 'createToken' | 'buyToken' | 'sellToken' | 'claim' | 'generic';

/** Best-effort decode of a revert error to a friendly message. */
function friendlyContractError(e: any, action: TxAction = 'generic'): string | null {
  // ethers v6 often populates error.revert = { name, signature, args }
  const name: string | undefined =
    e?.revert?.name || e?.errorName || e?.error?.errorName || e?.info?.error?.data?.errorName;
  if (name && FACTORY_ERROR_MESSAGES[name]) return FACTORY_ERROR_MESSAGES[name];

  // Try decoding from raw error data using the factory ABI.
  const rawData: string | undefined =
    e?.data ??
    e?.error?.data ??
    e?.info?.error?.data ??
    e?.info?.error?.error?.data ??
    e?.transaction?.data;
  if (typeof rawData === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(rawData)) {
    try {
      const iface = new ethers.Interface(TOKEN_FACTORY_ABI as unknown as string[]);
      const parsed = iface.parseError(rawData);
      if (parsed?.name && FACTORY_ERROR_MESSAGES[parsed.name]) {
        return FACTORY_ERROR_MESSAGES[parsed.name];
      }
      if (parsed?.name) return `Contract reverted: ${parsed.name}()`;
    } catch {
      /* ignore */
    }
  }

  // Empty revert data (0x) frequently means a CREATE2 address collision or an
  // assembly revert(0,0) — happens when the same (name+symbol) was already used
  // because vanity mining starts deterministically at i=0.
  const msg = String(
    e?.shortMessage ||
      e?.message ||
      e?.info?.error?.message ||
      e?.info?.error?.shortMessage ||
      ''
  );
  if (/require\(false\)|missing revert data|execution reverted\s*$/i.test(msg)) {
    if (action === 'createToken') {
      return 'Transaction reverted without a reason. Common fixes: (1) Do not use a huge base64 image URL (data:image/...) — use a short https:// link; (2) change name+symbol if that pair was already deployed (CREATE2 collision); (3) align MemeCoin bytecode / VITE_TOKEN_DEPLOYER with deploy; (4) creation fee to treasury failing; (5) not enough BNB for CREATION_MIN_FEE + min first buy.';
    }
    if (action === 'buyToken' || action === 'sellToken') {
      return 'Transaction reverted without a reason (no revert data). Most common causes on buy/sell: (1) your wallet is on the wrong network (must be BNB Chain mainnet, chainId 56); (2) the token address has no contract code on the network you are sending the tx to; (3) RPC/provider issues (rate limit / timeout). Switch to BSC mainnet and retry.';
    }
    return 'Transaction reverted without a reason (no revert data). This is usually caused by wrong network selection or an RPC/provider issue. Switch to BNB Chain mainnet (chainId 56) and retry.';
  }

  return null;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}

export interface TokenInfo {
  tokenAddress: string;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  website: string;
  telegram: string;
  twitter: string;
  discord: string;
  creator: string;
  totalSupply: string;
  currentPrice: string;
  marketCap: string;
  createdAt: string;
  graduated: boolean;
  realETH: string;
  /** `bondingCurves(token).targetETH` — same as factory `GRADUATION_TARGET` at launch */
  graduationTargetEth?: string;
  creatorTokensBurned: boolean;
  vestingEndTime: string;
  dexPair: string;
  firstBuyLockTier: number;
  firstBuyUnlockTime: string;
  paysDividends?: boolean;
  rewardKind?: number;
  totalTaxBps?: number;
  allocFundsBps?: number;
  allocBurnBps?: number;
  allocDividendBps?: number;
  allocLpBps?: number;
  fundsWallet?: string;
  antiBotDurationSec?: number;
  antiBotMaxTxBps?: number;
  antiBotMaxWalletBps?: number;
  dividendExempt?: string;
  /** Factory moderation flag */
  isBanned?: boolean;
}

export interface LaunchTaxConfig {
  rewardKind: number;
  totalTaxBps: number;
  allocFundsBps: number;
  allocBurnBps: number;
  allocDividendBps: number;
  allocLpBps: number;
  fundsWallet: string;
  antiBotDurationSec: number;
  antiBotMaxTxBps: number;
  antiBotMaxWalletBps: number;
  dividendExempt: string;
}

export const useContracts = () => {
  const [loading, setLoading] = useState(false);
  const { signer, account } = useWeb3();

  const createToken = async (
    name: string,
    symbol: string,
    description: string,
    imageUrl: string,
    website: string = '',
    telegram: string = '',
    twitter: string = '',
    discord: string = '',
    burnTokens: boolean = false,
    firstBuyLockTier: number = 0,
    firstBuyBnb: string = '0.01',
    paysDividends: boolean = false,
    tax: LaunchTaxConfig
  ) => {
    if (!signer || !account) {
      toast.error('Please connect your wallet first');
      return false;
    }

    const metaErr = validateCreateTokenMetadata(imageUrl, description);
    if (metaErr) {
      toast.error(metaErr, { id: 'create-token' });
      return false;
    }

    try {
      setLoading(true);
      let firstBuyWei: bigint;
      try {
        firstBuyWei = parseEther(firstBuyBnb);
      } catch {
        toast.error('Invalid first buy amount', { id: 'create-token' });
        return false;
      }

      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, signer);

      // Ensure wallet is on BSC mainnet (WalletConnect can connect on other chains).
      try {
        const net = await signer.provider!.getNetwork();
        const chainId = Number(net.chainId);
        if (chainId !== 56) {
          toast.error(`Switch your wallet to BNB Chain (BSC mainnet, chainId 56). Current chainId: ${chainId}`, {
            id: 'create-token',
          });
          return false;
        }
      } catch (e: unknown) {
        if (isLikelyRpcOrNetworkError(e)) {
          toast.error(
            'RPC/provider error while reading network. Fix VITE_BSC_RPC_URL and redeploy the frontend build.',
            { id: 'create-token' }
          );
          return false;
        }
      }

      // Read factory "vanity" marker via the public BSC RPC (more reliable than the wallet's JSON-RPC on mobile).
      const readProvider = getPublicProvider();
      const factoryReader = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, readProvider);

      let useNewFactory = false;
      try {
        const code = await withTimeout(readProvider.getCode(CONTRACT_ADDRESSES.TOKEN_FACTORY), 12_000, 'eth_getCode');
        if (!code || code === '0x') {
          toast.error(
            `TOKEN_FACTORY address has no contract code on BSC. Check VITE_TOKEN_FACTORY (currently: ${CONTRACT_ADDRESSES.TOKEN_FACTORY}).`,
            { id: 'create-token' }
          );
          return false;
        }

        const suffix = await withTimeout(factoryReader.VAULT_TOKEN_ADDRESS_SUFFIX.staticCall(), 12_000, 'VAULT_TOKEN_ADDRESS_SUFFIX');
        useNewFactory = true;
        // Sanity: repo expects 0x8888; if mismatch, still allow (custom deployments), but warn in console.
        if (DEBUG && BigInt(suffix as any) !== BigInt(0x8888)) {
          debugLog('Unexpected VAULT_TOKEN_ADDRESS_SUFFIX:', String(suffix));
        }
      } catch (e: unknown) {
        if (isLikelyRpcOrNetworkError(e) || isLikelyWrongChainError(e)) {
          toast.error(
            'RPC error reading TokenFactory on BSC. Fix VITE_BSC_RPC_URL (no-key public RPC) and redeploy the frontend build.',
            { id: 'create-token' }
          );
          return false;
        }
        useNewFactory = false;
      }

      if (!useNewFactory) {
        toast.error(
          `This app requires the custom TOKEN_FACTORY (vanity). Update VITE_TOKEN_FACTORY (current: ${CONTRACT_ADDRESSES.TOKEN_FACTORY}).`,
          { id: 'create-token' }
        );
        return false;
      }

      try {
        await withTimeout(factoryReader.MAX_TOTAL_TAX_BPS.staticCall(), 12_000, 'MAX_TOTAL_TAX_BPS');
      } catch (e: unknown) {
        if (isLikelyRpcOrNetworkError(e) || isLikelyWrongChainError(e)) {
          toast.error(
            'RPC/provider error while reading TokenFactory. Fix VITE_BSC_RPC_URL and retry.',
            { id: 'create-token' }
          );
          return false;
        }
        toast.error('Factory bytecode outdated — redeploy contracts and update TOKEN_FACTORY.', { id: 'create-token' });
        return false;
      }

      let creationFeeBn = parseEther('0.0032');
      let minCreatorFirstBuyBn = parseEther('0.0001');
      try {
        const [cf, mfb] = await withTimeout(
          Promise.all([
            factoryReader.CREATION_MIN_FEE.staticCall(),
            factoryReader.MIN_CREATOR_FIRST_BUY.staticCall(),
          ]),
          12_000,
          'CREATION_MIN_FEE/MIN_CREATOR_FIRST_BUY'
        );
        creationFeeBn = BigInt(cf.toString());
        minCreatorFirstBuyBn = BigInt(mfb.toString());
      } catch (e: unknown) {
        if (isLikelyRpcOrNetworkError(e) || isLikelyWrongChainError(e)) {
          toast.error(
            'RPC error reading factory fee constants. Fix VITE_BSC_RPC_URL and retry.',
            { id: 'create-token' }
          );
          return false;
        }
      }

      const totalValue = creationFeeBn + firstBuyWei;

      console.log('🚀 ===== CREATING TOKEN =====');
      console.log('📍 Contract:', CONTRACT_ADDRESSES.TOKEN_FACTORY);
      console.log(
        '💰 msg.value:',
        ethers.formatEther(totalValue),
        'BNB (on-chain creation fee',
        ethers.formatEther(creationFeeBn),
        '+ first buy field',
        ethers.formatEther(firstBuyWei) + ')'
      );
      console.log('📊 Params:', { name, symbol, description, burnTokens, firstBuyLockTier, paysDividends });

      if (tax.allocFundsBps > 0 && !isAddress(tax.fundsWallet)) {
        toast.error('Invalid funds wallet address', { id: 'create-token' });
        return false;
      }
      const fw = tax.allocFundsBps > 0 ? getAddress(tax.fundsWallet) : ZeroAddress;
      const divEx =
        tax.dividendExempt && isAddress(tax.dividendExempt) ? getAddress(tax.dividendExempt) : ZeroAddress;

      const launchConfig = [
        tax.rewardKind,
        tax.totalTaxBps,
        tax.allocFundsBps,
        tax.allocBurnBps,
        tax.allocDividendBps,
        tax.allocLpBps,
        fw,
        tax.antiBotDurationSec,
        tax.antiBotMaxTxBps,
        tax.antiBotMaxWalletBps,
        divEx,
      ] as const;

      // Verify the TokenDeployer the front uses for CREATE2 prediction matches
      // the one the deployed factory will actually call. A mismatch => revert InvalidSalt.
      try {
        const onChainDeployer: string = await (factoryReader as any).tokenDeployer();
        if (
          onChainDeployer &&
          onChainDeployer.toLowerCase() !== CONTRACT_ADDRESSES.TOKEN_DEPLOYER.toLowerCase()
        ) {
          toast.error(
            `TokenDeployer mismatch: factory uses ${onChainDeployer}, frontend expects ${CONTRACT_ADDRESSES.TOKEN_DEPLOYER}. Update VITE_TOKEN_DEPLOYER and rebuild.`,
            { id: 'create-token' },
          );
          return false;
        }
      } catch {
        /* non-fatal: if the call fails, we still attempt and rely on preflight */
      }

      let salt = ethers.ZeroHash;
      let predictedAddress = '';
      let vanityIndex = 0;
      let startAt = 0;

      const isNoDataRevert = (e: any) => {
        const detail = String(e?.shortMessage || e?.message || e || '');
        return isMissingRevertDataError(e) || /no data present|require\(false\)|missing revert data/i.test(detail);
      };

      // IMPORTANT: CREATE2 collisions revert with empty data (0x). Public RPCs can also drop revert data.
      // To make creation robust, we keep mining new salts until BOTH:
      // - predicted CREATE2 address has no bytecode
      // - preflight staticCall does not fail with "no data" revert
      const MAX_CREATE_RETRIES = 8;
      toast.loading('Mining vanity address...', { id: 'create-token' });

      for (let attempt = 0; attempt < MAX_CREATE_RETRIES; attempt++) {
        // 1) Mine a vanity salt starting at `startAt`
        try {
          const mined = await mineVanitySalt(name, symbol, CONTRACT_ADDRESSES.TOKEN_FACTORY, CONTRACT_ADDRESSES.TOKEN_DEPLOYER, {
            startAt,
            onProgress: (i) => {
              if (i % 500000 === 0) {
                toast.loading(`Mining... ${(i / 1000).toFixed(0)}k iterations`, { id: 'create-token' });
              }
            },
          });
          salt = mined.salt;
          predictedAddress = mined.predictedAddress;
          vanityIndex = mined.index;
          console.log('✅ Salt mined:', mined.iterations, 'iterations, index:', mined.index, 'address:', mined.predictedAddress);
        } catch {
          toast.error('Vanity mining failed. Try again.', { id: 'create-token' });
          return false;
        }

        // 2) Multi-RPC collision check for predicted address (avoid false "0x" from one flaky RPC)
        try {
          let hasCode = false;
          const providers = [readProvider, ...getPublicReadProviders()];
          for (const p of providers) {
            try {
              const code = await withTimeout(p.getCode(predictedAddress), 10_000, 'eth_getCode(predicted)');
              if (code && code !== '0x') {
                hasCode = true;
                break;
              }
            } catch {
              /* ignore individual RPC failures */
            }
          }
          if (hasCode) {
            startAt = vanityIndex + 1;
            toast.loading('Address collision detected. Mining a new salt…', { id: 'create-token' });
            continue;
          }
        } catch {
          /* fall through to preflight */
        }

        // 3) Preflight on read RPCs; if it fails with "no data", assume collision/RPC and retry with a new salt.
        let preflightOk = false;
        try {
          const providers = [readProvider, ...getPublicReadProviders()];
          for (const p of providers) {
            const fr = p === readProvider ? (factoryReader as any) : (new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, p) as any);
            try {
              await fr.createToken.staticCall(
                name,
                symbol,
                description,
                imageUrl,
                website,
                telegram,
                twitter,
                discord,
                burnTokens,
                firstBuyLockTier,
                paysDividends,
                launchConfig,
                salt,
                { value: totalValue, from: account }
              );
              preflightOk = true;
              break;
            } catch (e2: any) {
              const friendly2 = friendlyContractError(e2, 'createToken');
              if (friendly2 && !isNoDataRevert(e2)) {
                console.error('[createToken] preflight revert:', e2);
                toast.error(friendly2, { id: 'create-token' });
                return false;
              }
              if (!isNoDataRevert(e2)) {
                console.error('[createToken] preflight failed:', e2);
              }
            }
          }
        } catch {
          /* ignore */
        }

        if (preflightOk) {
          break;
        }

        // no-data preflight: retry with next index
        startAt = vanityIndex + 1;
        toast.loading('RPC returned no revert data. Retrying with a new salt…', { id: 'create-token' });
      }

      if (!predictedAddress) {
        toast.error('Failed to find a valid salt. Try again.', { id: 'create-token' });
        return false;
      }

      toast.loading('Creating token...', { id: 'create-token' });
      
      // Enforce minimum based on whether CTO lock is enabled.
      if (Number(firstBuyLockTier) > 0) {
        // CTO: enforce minCtoFirstBuyWei (fallback 0.5 BNB)
        let minCtoWei = parseEther('0.5');
        try {
          const v = await (factory as any).minCtoFirstBuyWei?.();
          if (typeof v === 'bigint' && v > 0n) minCtoWei = v;
        } catch {
          /* keep fallback */
        }
        if (firstBuyWei < minCtoWei) {
          toast.error(`CTO first buy must be at least ${ethers.formatEther(minCtoWei)} BNB`, { id: 'create-token' });
          return false;
        }
      } else if (firstBuyWei < minCreatorFirstBuyBn) {
        toast.error(
          `First buy must be at least ${ethers.formatEther(minCreatorFirstBuyBn)} BNB (factory MIN_CREATOR_FIRST_BUY).`,
          { id: 'create-token' }
        );
        return false;
      }

      const balance = await signer.provider.getBalance(account);
      console.log('💰 Current balance:', ethers.formatEther(balance), 'BNB');
      
      if (balance < totalValue) {
        toast.error('Insufficient BNB balance', { id: 'create-token' });
        return false;
      }

      // Preflight is handled in the retry loop above (salt mining + collision checks).

      // MetaMask/injected RPC sometimes fails estimateGas with -32603 + "require(false)" even when
      // the tx would be valid. Avoid hard-blocking by providing a manual gasLimit.
      const GAS_LIMIT_CREATE = 4_000_000n;
      const txReq = await (factory as any).createToken.populateTransaction(
        name,
        symbol,
        description,
        imageUrl,
        website,
        telegram,
        twitter,
        discord,
        burnTokens,
        firstBuyLockTier,
        paysDividends,
        launchConfig,
        salt,
        { value: totalValue }
      );

      const tx = await signer.sendTransaction({
        ...(txReq as any),
        value: totalValue,
        gasLimit: GAS_LIMIT_CREATE,
      });
      
      console.log('📝 Transaction hash:', tx.hash);
      console.log('⏳ Waiting for confirmation...');

      const receipt = await tx.wait();
      if (!receipt) {
        toast.error('Transaction not confirmed (no receipt). Try again.', { id: 'create-token' });
        return false;
      }
      // Record the creator-first-buy (and any immediate buys/sells) from this same tx.
      try {
        const iface = new ethers.Interface(TOKEN_FACTORY_ABI as unknown as string[]);
        let createdToken: string | null = null;
        for (const log of receipt.logs ?? []) {
          if (String(log.address).toLowerCase() !== CONTRACT_ADDRESSES.TOKEN_FACTORY.toLowerCase()) continue;
          try {
            const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
            if (parsed?.name === 'TokenCreated') {
              createdToken = String(parsed.args[0]);
              break;
            }
          } catch {
            // ignore non-matching logs
          }
        }
        if (createdToken) void pushTradeToBackend(createdToken, tx.hash);
      } catch (e) {
        console.warn('[createToken] recordTrade push failed', e);
      }
      console.log('✅ TOKEN CREATED SUCCESSFULLY!');
      toast.success('Token created successfully!', { id: 'create-token' });
      return true;
    } catch (error: any) {
      console.error('Error creating token:', error);
      console.log('❌ ===== DETAILED ERROR =====');
      console.log('❌ Reason:', error.reason);
      console.log('❌ Code:', error.code);
      console.log('❌ Data:', error.data);
      console.log('❌ Revert:', error.revert);
      const friendly = friendlyContractError(error, 'createToken');
      toast.error(friendly || error.reason || 'Failed to create token', { id: 'create-token' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const getAllTokens = async (): Promise<TokenInfo[]> => {
    try {
      lastTokenListLoadDiag = null;

      const api = getBackendApiUrl();
      if (api) {
        try {
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), 120_000);
          const res = await fetch(`${api}/api/tokens`, { signal: ac.signal, cache: 'no-store' });
          clearTimeout(timer);
          if (res.ok) {
            const j = (await res.json()) as { tokens?: TokenInfo[] };
            if (Array.isArray(j.tokens) && j.tokens.length > 0) {
              debugLog('✅ Token list from backend API:', j.tokens.length);
              lastTokenListLoadDiag = {
                headline: 'Token list loaded from API',
                details: [`API: ${api}`, `Tokens: ${j.tokens.length}`],
                severity: 'info',
              };
              return j.tokens;
            }
            if (Array.isArray(j.tokens) && j.tokens.length === 0) {
              // Not an error: empty list is valid when nothing was created yet.
              // If you expected tokens, it's usually indexer/deploy-block/RPC on the server.
              console.info(
                '[getAllTokens] API returned 0 tokens (valid if none exist yet). Trying on-chain fallback via public BSC RPC…',
              );
              lastTokenListLoadDiag = {
                headline: 'API returned an empty token list',
                details: [
                  `This is normal if no tokens were created yet.`,
                  `If you already created tokens on-chain, check backend indexer settings: TOKEN_FACTORY, BSC_RPC_URL, FACTORY_DEPLOY_BLOCK.`,
                  `API: ${api}`,
                ],
                severity: 'info',
              };
            }
          } else {
            console.warn(`[getAllTokens] Backend API HTTP ${res.status} — falling back to RPC`);
            lastTokenListLoadDiag = {
              headline: `Backend API returned HTTP ${res.status}`,
              details: [`Falling back to on-chain reads via public BSC RPC.`, `API: ${api}`],
              severity: 'warn',
            };
          }
        } catch (e) {
          console.warn('[getAllTokens] Backend API request failed — falling back to RPC', e);
          lastTokenListLoadDiag = {
            headline: 'Backend API unreachable',
            details: [
              `Could not fetch ${api}/api/tokens.`,
              `Falling back to on-chain reads via public BSC RPC.`,
              `If this persists, verify DNS/HTTPS for the API and that the Node process is running.`,
            ],
            severity: 'warn',
          };
        }
      } else {
        lastTokenListLoadDiag = {
          headline: 'Backend API URL not configured',
          details: [
            `VITE_API_URL is missing/invalid in the frontend build.`,
            `Loading tokens directly from chain via public BSC RPC (slower / more rate limits).`,
          ],
          severity: 'info',
        };
      }

      debugLog('🔍 ===== STARTING TOKEN SEARCH =====');
      debugLog('📍 Contract Address:', CONTRACT_ADDRESSES.TOKEN_FACTORY);
      debugLog('👤 Signer:', signer ? 'CONNECTED' : 'DISCONNECTED');

      // Read-only: always use the dedicated BSC JSON-RPC, not the wallet. MetaMask's default RPC
      // often returns -32603 under load; wrong wallet network would query the wrong chain.
      const readProvider = getPublicProvider();
      const net = await readProvider.getNetwork();
      debugLog('🌐 Network (read provider):', net);

      const factory = new ethers.Contract(
        CONTRACT_ADDRESSES.TOKEN_FACTORY,
        TOKEN_FACTORY_ABI,
        readProvider,
      );

      debugLog('🔍 Checking if contract exists...');
      const code = await readProvider.getCode(CONTRACT_ADDRESSES.TOKEN_FACTORY);
      debugLog('📋 Contract code length:', code.length);
      if (code === '0x') {
        debugLog('❌ CONTRACT DOES NOT EXIST AT ADDRESS!');
        return [];
      }
      
      debugLog('📋 Searching tokens through allTokens array...');
      const tokenAddresses: string[] = [];
      
      let index = 0;
      while (true) {
        try {
          const tokenAddress = await factory.allTokens(index);
          if (tokenAddress === ethers.ZeroAddress) break;
          tokenAddresses.push(tokenAddress);
          debugLog(`📋 Token ${index}:`, tokenAddress);
          index++;
        } catch (error) {
          break;
        }
      }
      
      debugLog('📋 ===== FINAL RESULT =====');
      debugLog('📋 TOTAL TOKENS FOUND:', tokenAddresses.length);
      
      if (tokenAddresses.length === 0) {
        debugLog('❌ ===== NO TOKENS FOUND! =====');
        lastTokenListLoadDiag = {
          headline: 'No tokens found on-chain',
          details: [
            `Factory: ${CONTRACT_ADDRESSES.TOKEN_FACTORY}`,
            `If you expected tokens, verify FACTORY_DEPLOY_BLOCK / indexer on the API server, or confirm tokens were actually created.`,
          ],
          severity: 'info',
        };
        return [];
      }
      
      debugLog('🔄 ===== PROCESSING EACH TOKEN =====');

      const CONCURRENCY = 6; // evita estourar RPC/free rate-limit

      const maybeTokens = await mapWithConcurrency(tokenAddresses, CONCURRENCY, async (address, i) => {
        try {
          debugLog(`🔄 [${i + 1}/${tokenAddresses.length}] PROCESSING:`, address);

          // paraleliza chamadas por token
          const [info, bondingCurve, isBanned] = await Promise.all([
            factory.tokenInfo(address),
            factory.bondingCurves(address),
            factory.bannedTokens(address),
          ]);

          const firstBuyLockTier =
            typeof info.firstBuyLockTier === 'bigint'
              ? Number(info.firstBuyLockTier)
              : Number(info.firstBuyLockTier ?? 0);

          const tokenData = {
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
          } as TokenInfo;

          return tokenData;
        } catch (error) {
          if (DEBUG) console.error(`❌ [${i + 1}] ERROR PROCESSING:`, address, error);
          return null;
        }
      });

      const tokens = maybeTokens.filter(Boolean) as TokenInfo[];

      debugLog('✅ ===== FINAL RESULT =====');
      debugLog('✅ TOKENS PROCESSED SUCCESSFULLY:', tokens.length);
      debugLog(
        '📊 FINAL LIST:',
        tokens.map((t) => ({ name: t.name, symbol: t.symbol, burned: t.creatorTokensBurned }))
      );
      debugLog('===== END DEBUG =====');

      const sorted = tokens.sort((a, b) => parseInt(b.createdAt) - parseInt(a.createdAt));

      // If API was empty but chain has tokens, make the diagnosis explicit (common confusion).
      if (lastTokenListLoadDiag?.headline === 'API returned an empty token list' && sorted.length > 0) {
        lastTokenListLoadDiag = {
          headline: 'API list is empty, but chain has tokens',
          details: [
            `Loaded ${sorted.length} token(s) via on-chain fallback.`,
            `This usually means the backend indexer/cache is behind or misconfigured (FACTORY_DEPLOY_BLOCK / TOKEN_FACTORY / BSC_RPC_URL).`,
            ...(lastTokenListLoadDiag.details?.length ? [`Previous note: ${lastTokenListLoadDiag.details[0]}`] : []),
          ],
          severity: 'warn',
        };
      } else if (!lastTokenListLoadDiag || lastTokenListLoadDiag.headline === 'API returned an empty token list') {
        lastTokenListLoadDiag = {
          headline: 'Token list loaded from chain',
          details: [`Tokens: ${sorted.length}`, `Factory: ${CONTRACT_ADDRESSES.TOKEN_FACTORY}`],
          severity: 'info',
        };
      }

      return sorted;
    } catch (error) {
      console.error('❌ ===== GENERAL ERROR =====', error);
      lastTokenListLoadDiag = {
        headline: 'Failed to load tokens',
        details: [String((error as any)?.message || error)],
        severity: 'error',
      };
      return [];
    }
  };

  const buyToken = async (tokenAddress: string, bnbAmount: string) => {
    if (!signer) {
      toast.error('Please connect your wallet');
      return false;
    }

    try {
      setLoading(true);
      toast.loading('Buying tokens...', { id: 'buy-token' });
      
      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, signer);
      const readProvider = getPublicProvider();
      const factoryReader = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, readProvider);

      // Ensure wallet is on BSC mainnet for writes.
      try {
        const net = await signer.provider!.getNetwork();
        const chainId = Number(net.chainId);
        if (chainId !== 56) {
          toast.error(`Switch your wallet to BNB Chain (BSC mainnet, chainId 56). Current chainId: ${chainId}`, {
            id: 'buy-token',
          });
          return false;
        }
      } catch (e: unknown) {
        if (isLikelyRpcOrNetworkError(e)) {
          toast.error('RPC/provider error while reading network. Fix VITE_BSC_RPC_URL and retry.', { id: 'buy-token' });
          return false;
        }
      }

      let valueWei: bigint;
      try {
        valueWei = ethers.parseEther(bnbAmount);
      } catch {
        toast.error('Invalid BNB amount', { id: 'buy-token' });
        return false;
      }
      if (valueWei <= 0n) {
        toast.error('Send a BNB amount greater than 0', { id: 'buy-token' });
        return false;
      }

      // Defensive checks: the factory `buyToken` does NOT check TokenMissing.
      // If `tokenAddress` has no code, the on-chain `MemeCoin(token).transfer(...)`
      // can revert with no data (looks like require(false)).
      try {
        const code = await withTimeout(readProvider.getCode(tokenAddress), 12_000, 'eth_getCode(token)');
        if (!code || code === '0x') {
          toast.error('Token address has no contract code (wrong token address).', { id: 'buy-token' });
          return false;
        }
      } catch (e: unknown) {
        if (isLikelyRpcOrNetworkError(e) || isLikelyWrongChainError(e)) {
          toast.error('RPC error checking token bytecode. Fix VITE_BSC_RPC_URL and retry.', { id: 'buy-token' });
          return false;
        }
      }

      try {
        const info = await withTimeout(factoryReader.tokenInfo.staticCall(tokenAddress), 12_000, 'tokenInfo');
        const addr = String((info as any)?.tokenAddress ?? '');
        if (!addr || addr === ZeroAddress) {
          toast.error('Token not found in factory (wrong token address).', { id: 'buy-token' });
          return false;
        }
        // Avoid opaque CALL_EXCEPTION: we can tell the user the real reason without eth_call.
        if ((info as any)?.graduated === true) {
          toast.error('Token already graduated to DEX — factory buy is disabled. Buy on PancakeSwap instead.', {
            id: 'buy-token',
            duration: 8000,
          });
          return false;
        }
        try {
          const banned = await withTimeout(factoryReader.bannedTokens.staticCall(tokenAddress), 12_000, 'bannedTokens');
          if (banned === true) {
            toast.error('Token is banned by the admin.', { id: 'buy-token' });
            return false;
          }
        } catch {
          /* non-fatal */
        }
      } catch (e: unknown) {
        // If tokenInfo fails, we still have bytecode check; continue to preflight.
        if (isLikelyRpcOrNetworkError(e) || isLikelyWrongChainError(e)) {
          toast.error('RPC error reading token info. Fix VITE_BSC_RPC_URL and retry.', { id: 'buy-token' });
          return false;
        }
      }

      // Preflight to surface custom errors (CtoMaxBuy, TokenBanned_, etc.) before wallet estimateGas.
      try {
        // IMPORTANT: do the eth_call through the dedicated read RPC, not the wallet RPC.
        // Mobile wallet providers frequently return CALL_EXCEPTION with "missing revert data"
        // for eth_call under load, even when the contract would succeed.
        await (factoryReader as any).buyToken.staticCall(tokenAddress, { value: valueWei, from: account });
      } catch (simErr: any) {
        // If the RPC dropped revert data, retry across a couple read RPC endpoints.
        if (isMissingRevertDataError(simErr)) {
          for (const p of getPublicReadProviders()) {
            try {
              const fr = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, p);
              await (fr as any).buyToken.staticCall(tokenAddress, { value: valueWei, from: account });
              // Preflight passed on alternate RPC, proceed with real tx.
              break;
            } catch (e2: any) {
              // stop early if we got a real revert that can be decoded
              const friendly2 = friendlyContractError(e2, 'buyToken');
              if (friendly2) {
                console.error('[buyToken] preflight revert (alt rpc):', e2);
                toast.error(friendly2, { id: 'buy-token', duration: 10_000 });
                return false;
              }
              if (!isMissingRevertDataError(e2)) {
                console.error('[buyToken] preflight failed (alt rpc):', e2);
              }
            }
          }
        }

        const friendly = friendlyContractError(simErr, 'buyToken');
        console.error('[buyToken] preflight revert:', simErr);
        const detail = String(simErr?.shortMessage || simErr?.message || simErr || 'unknown');
        toast.error(friendly || `Buy simulation failed. ${detail}`, { id: 'buy-token', duration: 10_000 });
        return false;
      }
      
      const tx = await factory.buyToken(tokenAddress, { value: valueWei });

      const receipt = await tx.wait();
      const txh = receipt?.hash ?? tx.hash;
      if (txh) void pushTradeToBackend(tokenAddress, txh);
      toast.success('Tokens purchased successfully!', { id: 'buy-token' });
      return true;
    } catch (error: any) {
      console.error('Error buying token:', error);
      const friendly = friendlyContractError(error, 'buyToken');
      toast.error(friendly || error.reason || 'Failed to buy tokens', { id: 'buy-token' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const sellToken = async (tokenAddress: string, tokenAmount: string) => {
    if (!signer) {
      toast.error('Please connect your wallet');
      return false;
    }

    try {
      setLoading(true);
      toast.loading('Selling tokens...', { id: 'sell-token' });
      
      // Ensure wallet is on BSC mainnet for writes.
      try {
        const net = await signer.provider!.getNetwork();
        const chainId = Number(net.chainId);
        if (chainId !== 56) {
          toast.error(`Switch your wallet to BNB Chain (BSC mainnet, chainId 56). Current chainId: ${chainId}`, {
            id: 'sell-token',
          });
          return false;
        }
      } catch (e: unknown) {
        if (isLikelyRpcOrNetworkError(e)) {
          toast.error('RPC/provider error while reading network. Fix VITE_BSC_RPC_URL and retry.', { id: 'sell-token' });
          return false;
        }
      }

      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function approve(address spender, uint256 amount) external returns (bool)'],
        signer
      );
      
      const approveTx = await tokenContract.approve(
        CONTRACT_ADDRESSES.TOKEN_FACTORY,
        ethers.parseEther(tokenAmount)
      );
      await approveTx.wait();
      
      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, signer);
      
      const tx = await factory.sellToken(tokenAddress, ethers.parseEther(tokenAmount));
      const receipt = await tx.wait();
      const txh = receipt?.hash ?? tx.hash;
      if (txh) void pushTradeToBackend(tokenAddress, txh);

      toast.success('Tokens sold successfully!', { id: 'sell-token' });
      return true;
    } catch (error: any) {
      console.error('Error selling token:', error);
      const friendly = friendlyContractError(error, 'sellToken');
      toast.error(friendly || error.reason || 'Failed to sell tokens', { id: 'sell-token' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const getBuyAmount = async (tokenAddress: string, bnbAmount: string) => {
    try {
      const runner = (signer as any) || getPublicProvider();
      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, runner);
      const curve = await factory.bondingCurves(tokenAddress);
      const gross = ethers.parseEther(bnbAmount);
      const net = presaleNetEthFromGrossWei(gross);
      const out = getBuyAmountWei(curve.virtualETH, curve.virtualToken, net);
      return ethers.formatEther(out);
    } catch (error) {
      return '0';
    }
  };

  const getSellAmount = async (tokenAddress: string, tokenAmount: string) => {
    try {
      const runner = (signer as any) || getPublicProvider();
      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, runner);
      const curve = await factory.bondingCurves(tokenAddress);
      const tokenWei = ethers.parseEther(tokenAmount);
      const ethOut = getSellAmountWei(curve.virtualETH, curve.virtualToken, tokenWei);
      return ethers.formatEther(ethOut);
    } catch (error) {
      return '0';
    }
  };

  const getTokenBalance = async (tokenAddress: string, userAddress: string) => {
    try {
      const runner = (signer as any) || getPublicProvider();
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        runner
      );
      const balance = await tokenContract.balanceOf(userAddress);
      return ethers.formatEther(balance);
    } catch (error) {
      return '0';
    }
  };

  const getEthBalance = async (userAddress: string) => {
    try {
      const runner = signer?.provider || getPublicProvider();
      const bal = await runner.getBalance(userAddress);
      return ethers.formatEther(bal);
    } catch (error) {
      return '0';
    }
  };

  const claimFirstBuyTokens = async (tokenAddress: string) => {
    if (!signer) {
      toast.error('Please connect your wallet');
      return false;
    }

    try {
      setLoading(true);
      toast.loading('Claiming first buy tokens...', { id: 'claim-first-buy' });

      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, signer);

      const tx = await factory.claimFirstBuyTokens(tokenAddress);
      await tx.wait();

      toast.success('First buy tokens claimed!', { id: 'claim-first-buy' });
      return true;
    } catch (error: any) {
      console.error('Error claiming first buy tokens:', error);
      const friendly = friendlyContractError(error, 'claim');
      toast.error(friendly || error.reason || 'Failed to claim first buy tokens', { id: 'claim-first-buy' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const getCreatorFirstBuyStatus = async (tokenAddress: string) => {
    try {
      const runner = (signer as any) || getPublicProvider();
      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, runner);
      const [info, locked] = await Promise.all([
        factory.tokenInfo(tokenAddress),
        factory.creatorFirstBuyLocked(tokenAddress),
      ]);

      const row: any = info;
      const tierRaw = row.firstBuyLockTier ?? row[18];
      const tier = typeof tierRaw === 'bigint' ? Number(tierRaw) : Number(tierRaw ?? 0);
      const unlockRaw = row.firstBuyUnlockTime ?? row[19] ?? 0;
      const unlockTime = BigInt(unlockRaw?.toString?.() ?? unlockRaw ?? 0);
      const now = BigInt(Math.floor(Date.now() / 1000));
      const lockedAmt = locked;
      const hasLockCommitment = tier > 0;
      const canClaim = unlockTime > 0n && now >= unlockTime && lockedAmt > 0n;

      return {
        tier,
        unlockTime: unlockTime.toString(),
        lockedAmount: ethers.formatEther(lockedAmt),
        hasLockCommitment,
        canClaim,
      };
    } catch (error) {
      console.error('Error getting first buy status:', error);
      return null;
    }
  };

  const claimCreatorTokens = async (tokenAddress: string) => {
    if (!signer) {
      toast.error('Please connect your wallet');
      return false;
    }

    try {
      setLoading(true);
      toast.loading('Claiming creator tokens...', { id: 'claim-tokens' });
      
      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, signer);
      
      const tx = await factory.claimCreatorTokens(tokenAddress);
      await tx.wait();
      
      toast.success('Creator tokens claimed successfully!', { id: 'claim-tokens' });
      return true;
    } catch (error: any) {
      console.error('Error claiming tokens:', error);
      const friendly = friendlyContractError(error, 'claim');
      toast.error(friendly || error.reason || 'Failed to claim tokens', { id: 'claim-tokens' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const getCreatorTokenStatus = async (tokenAddress: string) => {
    try {
      const runner = (signer as any) || getPublicProvider();
      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, runner);
      const info = await factory.tokenInfo(tokenAddress);
      const lockedAmount = await factory.creatorTokensLocked(tokenAddress);
      
      const now = Math.floor(Date.now() / 1000);
      const vestingEnd = parseInt(info.vestingEndTime.toString());
      const canClaim = !info.creatorTokensBurned && vestingEnd > 0 && now >= vestingEnd && lockedAmount > 0;
      
      return {
        burned: info.creatorTokensBurned,
        lockedAmount: ethers.formatEther(lockedAmount),
        vestingEndTime: info.vestingEndTime.toString(),
        canClaim: canClaim
      };
    } catch (error) {
      console.error('Error getting creator token status:', error);
      return null;
    }
  };

  const updateTokenMetadata = async (
    tokenAddress: string,
    description: string,
    imageUrl: string,
    website: string,
    telegram: string,
    twitter: string,
    discord: string
  ) => {
    if (!signer) {
      toast.error('Please connect your wallet');
      return false;
    }

    const metaErr = validateCreateTokenMetadata(imageUrl, description);
    if (metaErr) {
      toast.error(metaErr, { id: 'update-metadata' });
      return false;
    }

    try {
      setLoading(true);
      toast.loading('Updating token metadata...', { id: 'update-metadata' });

      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, signer);
      const tx = await factory.updateTokenMetadata(
        tokenAddress,
        description,
        imageUrl,
        website,
        telegram,
        twitter,
        discord
      );
      await tx.wait();

      toast.success('Token metadata updated!', { id: 'update-metadata' });
      return true;
    } catch (error: any) {
      console.error('Error updating token metadata:', error);
      const friendly = friendlyContractError(error, 'generic');
      toast.error(friendly || error.reason || 'Failed to update token metadata', { id: 'update-metadata' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    createToken,
    getAllTokens,
    buyToken,
    sellToken,
    getBuyAmount,
    getSellAmount,
    getTokenBalance,
    getEthBalance,
    claimCreatorTokens,
    claimFirstBuyTokens,
    getCreatorFirstBuyStatus,
    getCreatorTokenStatus,
    updateTokenMetadata,
    loading
  };
};
