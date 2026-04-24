import React, { useMemo, useState } from 'react';
import { ethers, isAddress } from 'ethers';
import { Shield, Settings, Coins, Landmark, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWeb3 } from '../hooks/useWeb3';
import { useRocketBoost } from '../hooks/useRocketBoost';
import { ROCKET_BOOST_ADDRESS } from '../contracts/rocketBoostABI';
import { CONTRACT_ADDRESSES, TOKEN_FACTORY_ABI } from '../contracts/contractAddresses';

const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

type FactoryMeta = {
  owner: string;
  burnAgent: string;
  treasury: string;
  totalFees: string;
  creationFees: string;
  isOwner: boolean;
};

export const AdminDashboard: React.FC = () => {
  const { signer, account, isConnected } = useWeb3();
  const {
    getRocketConfig,
    getRocketOwner,
    setRocketParams,
    setRocketTreasury: setRocketTreasuryOnChain,
    pauseRocket,
    unpauseRocket,
    loading: rocketLoading,
  } = useRocketBoost();

  const [tokenAddress, setTokenAddress] = useState('');
  const [burnAgentAddress, setBurnAgentAddress] = useState('');
  const [treasuryAddress, setTreasuryAddress] = useState('');
  const [rocketOwner, setRocketOwner] = useState<string | null>(null);
  const [rocketTreasury, setRocketTreasuryValue] = useState('');
  const [rocketPricePerPoint, setRocketPricePerPoint] = useState('');
  const [rocketMaxPoints, setRocketMaxPoints] = useState('1000');
  const [rocketPaused, setRocketPaused] = useState<boolean | null>(null);
  const [banReason, setBanReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [factoryLoading, setFactoryLoading] = useState(false);
  const [factoryMeta, setFactoryMeta] = useState<FactoryMeta | null>(null);

  const tokenOk = useMemo(() => isAddress(tokenAddress.trim()), [tokenAddress]);
  const canRead = Boolean(signer);

  const fetchFactoryMeta = async (): Promise<FactoryMeta> => {
    if (!signer) throw new Error('No signer');
    const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, signer);
    const owner = String(await factory.owner());
    const burnAgent = String(await factory.burnAgent());
    const treasury = String(await factory.ecosystemTreasury());
    const totalFees = ethers.formatEther(await factory.totalFeesCollected());
    const creationFees = ethers.formatEther(await factory.creationFeesCollected());
    return {
      owner,
      burnAgent,
      treasury,
      totalFees,
      creationFees,
      isOwner: !!account && owner.toLowerCase() === account.toLowerCase(),
    };
  };

  const loadFactoryOverview = async () => {
    if (!signer) {
      toast.error('Connect your wallet first');
      return;
    }
    setFactoryLoading(true);
    try {
      const meta = await fetchFactoryMeta();
      setFactoryMeta(meta);
      setBurnAgentAddress(meta.burnAgent);
      setTreasuryAddress(meta.treasury);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.reason || 'Failed to load factory data');
    } finally {
      setFactoryLoading(false);
    }
  };

  const loadRocketOverview = async () => {
    setBusy(true);
    try {
      const [cfg, owner] = await Promise.all([getRocketConfig(), getRocketOwner()]);
      setRocketOwner(owner);
      if (cfg) {
        setRocketPricePerPoint(String(cfg.pricePerPoint ?? ''));
        setRocketMaxPoints(String(cfg.maxPoints ?? ''));
        setRocketPaused(Boolean(cfg.paused));
      }
      try {
        const activeProvider = signer?.provider;
        if (activeProvider) {
          const c = new ethers.Contract(ROCKET_BOOST_ADDRESS, ['function treasury() view returns (address)'], activeProvider);
          const t = String(await c.treasury());
          setRocketTreasuryValue(t);
        }
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e?.reason || 'Failed to load RocketBoost data');
    } finally {
      setBusy(false);
    }
  };

  const ownerWrite = async (
    fn: (factory: ethers.Contract) => Promise<ethers.TransactionResponse>,
    successMsg: string,
  ) => {
    if (!signer) {
      toast.error('Connect your wallet first');
      return;
    }
    if (!factoryMeta) {
      toast.error('Load factory data first (top button)');
      return;
    }
    if (!factoryMeta.isOwner) {
      toast.error('Only the factory owner can perform this action');
      return;
    }
    setBusy(true);
    try {
      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, signer);
      const tx = await fn(factory);
      await tx.wait();
      toast.success(successMsg);
      await loadFactoryOverview();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.reason || 'Transaction failed');
    } finally {
      setBusy(false);
    }
  };

  const fmtFees = (v: string | undefined) => (v !== undefined && v !== '' ? v : '—');
  const isRocketOwnerUi = !!account && !!rocketOwner && rocketOwner.toLowerCase() === account.toLowerCase();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="rounded-2xl p-8 border border-red-500/30 bg-[#11161D]">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-red-500/15 p-3 rounded-xl">
            <Shield className="h-6 w-6 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin dashboard</h1>
        </div>
        <p className="text-[#9CA3AF] text-sm mb-3">
          Platform owner only. Manage factory fees, burn agent, treasury, RocketBoost parameters and token moderation.
        </p>
        <p className="text-xs text-[#6B7280] font-mono break-all mb-5">
          Factory: {CONTRACT_ADDRESSES.TOKEN_FACTORY}
        </p>

        <button
          type="button"
          onClick={() => void loadFactoryOverview()}
          disabled={!canRead || factoryLoading}
          className="px-5 py-3 bg-vault-primary text-[#0B0F14] font-bold rounded-xl disabled:opacity-40"
        >
          {factoryLoading ? 'Loading…' : 'Load / refresh factory data'}
        </button>
        <p className="text-xs text-[#6B7280] mt-2">
          No token address needed — updates owner on-chain, fee balances, Burn Agent and treasury.
        </p>
      </div>

      <div className="rounded-2xl p-6 border border-[#1F2937] bg-[#0B0F14] space-y-5">
        <div className="flex items-start gap-3">
          <div className="bg-vault-primary/15 p-2.5 rounded-xl shrink-0">
            <Landmark className="h-6 w-6 text-vault-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Platform owner</h2>
            <p className="text-sm text-[#9CA3AF] mt-1">
              The wallet that is <code className="text-[#D1D5DB] text-xs">owner()</code> of the Factory contract can
              withdraw accumulated fees and update Burn Agent / Treasury.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-[#1F2937] bg-[#11161D]/80 p-4">
          <div className="flex items-start gap-2">
            <Wallet className="h-4 w-4 text-[#6B7280] mt-0.5 shrink-0" />
            <div>
              <div className="text-xs text-[#6B7280] uppercase tracking-wide">Connected wallet</div>
              <div className="text-white font-mono text-sm">
                {isConnected && account ? shortAddr(account) : '—'}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-[#6B7280] mt-0.5 shrink-0" />
            <div>
              <div className="text-xs text-[#6B7280] uppercase tracking-wide">Owner on-chain (factory)</div>
              <div className="text-white font-mono text-sm">
                {factoryMeta?.owner ? shortAddr(factoryMeta.owner) : '—'}
                {factoryMeta?.isOwner ? (
                  <span className="ml-2 text-green-400 text-xs font-sans">(you)</span>
                ) : factoryMeta?.owner ? (
                  <span className="ml-2 text-amber-500/90 text-xs font-sans">(different wallet)</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#1F2937] bg-[#11161D]/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-vault-primary text-sm font-semibold">
              <Coins className="h-4 w-4" />
              Platform fees (eco / trading)
            </div>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              All fees accrued from ecosystem activity, <span className="text-white">excluding</span> token creation fees.
            </p>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold text-white tabular-nums">{fmtFees(factoryMeta?.totalFees)}</span>
              <span className="text-sm text-[#9CA3AF]">BNB</span>
            </div>
            <button
              type="button"
              disabled={busy || !factoryMeta?.isOwner}
              onClick={() => void ownerWrite((f) => f.withdrawFees(), 'Platform fees withdrawn')}
              className="w-full px-4 py-2.5 rounded-lg bg-vault-primary text-[#0B0F14] font-semibold disabled:opacity-40 text-sm"
            >
              Withdraw platform fees
            </button>
          </div>

          <div className="rounded-xl border border-[#1F2937] bg-[#11161D]/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-vault-primary text-sm font-semibold">
              <Coins className="h-4 w-4" />
              Token creation fees
            </div>
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              BNB paid by users when <span className="text-white">launching</span> a new token (creation fee).
            </p>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-bold text-white tabular-nums">{fmtFees(factoryMeta?.creationFees)}</span>
              <span className="text-sm text-[#9CA3AF]">BNB</span>
            </div>
            <button
              type="button"
              disabled={busy || !factoryMeta?.isOwner}
              onClick={() => void ownerWrite((f) => f.withdrawCreationFees(), 'Creation fees withdrawn')}
              className="w-full px-4 py-2.5 rounded-lg bg-vault-primary text-[#0B0F14] font-semibold disabled:opacity-40 text-sm"
            >
              Withdraw creation fees
            </button>
          </div>
        </div>

        <div className="border-t border-[#1F2937] pt-4 space-y-3">
          <div className="text-sm font-medium text-[#D1D5DB]">Configuration (owner only)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-[#6B7280]">Burn Agent</label>
              <input
                value={burnAgentAddress}
                onChange={(e) => setBurnAgentAddress(e.target.value)}
                placeholder="0x…"
                className="w-full px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white font-mono text-xs"
              />
              <button
                type="button"
                disabled={!isAddress(burnAgentAddress.trim()) || busy || !factoryMeta?.isOwner}
                onClick={() => void ownerWrite((f) => f.setBurnAgent(burnAgentAddress.trim()), 'Burn Agent updated')}
                className="w-full px-4 py-2 rounded-lg bg-[#11161D] border border-[#1F2937] text-white disabled:opacity-40 text-sm"
              >
                Set Burn Agent
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-[#6B7280]">Ecosystem treasury</label>
              <input
                value={treasuryAddress}
                onChange={(e) => setTreasuryAddress(e.target.value)}
                placeholder="0x… (use 0x000...000 to accumulate in-contract)"
                className="w-full px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white font-mono text-xs"
              />
              <button
                type="button"
                disabled={!isAddress(treasuryAddress.trim()) || busy || !factoryMeta?.isOwner}
                onClick={() =>
                  void ownerWrite((f) => f.setEcosystemTreasury(treasuryAddress.trim()), 'Treasury updated')
                }
                className="w-full px-4 py-2 rounded-lg bg-[#11161D] border border-[#1F2937] text-white disabled:opacity-40 text-sm"
              >
                Set treasury
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-6 border border-[#1F2937] bg-[#0B0F14] space-y-5">
        <div className="flex items-start gap-3">
          <div className="bg-vault-primary/15 p-2.5 rounded-xl shrink-0">
            <Settings className="h-6 w-6 text-vault-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">RocketBoost (booster) admin</h2>
            <p className="text-sm text-[#9CA3AF] mt-1">
              Owner-only controls for the RocketBoost contract: pricing, max points per tx, treasury, pause.
            </p>
            <p className="text-xs text-[#6B7280] font-mono break-all mt-2">Rocket: {ROCKET_BOOST_ADDRESS}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadRocketOverview()}
          disabled={rocketLoading}
          className="px-5 py-3 bg-vault-primary text-[#0B0F14] font-bold rounded-xl disabled:opacity-40"
        >
          Load / refresh RocketBoost data
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-[#1F2937] bg-[#11161D]/80 p-4">
          <div className="flex items-start gap-2">
            <Wallet className="h-4 w-4 text-[#6B7280] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-[#6B7280] uppercase tracking-wide">Connected wallet</div>
              <div className="text-white font-mono text-sm">{isConnected && account ? shortAddr(account) : '—'}</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="h-4 w-4 text-[#6B7280] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-[#6B7280] uppercase tracking-wide">Owner on-chain (rocket)</div>
              <div className="text-white font-mono text-sm">
                {rocketOwner ? shortAddr(rocketOwner) : '—'}
                {isRocketOwnerUi ? (
                  <span className="ml-2 text-green-400 text-xs font-sans">(you)</span>
                ) : rocketOwner ? (
                  <span className="ml-2 text-amber-500/90 text-xs font-sans">(different wallet)</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-[#1F2937] bg-[#11161D]/50 p-4 space-y-3">
            <div className="text-sm font-medium text-[#D1D5DB]">Pricing</div>
            <div className="space-y-2">
              <label className="text-xs text-[#6B7280]">Price per point (BNB)</label>
              <input
                value={rocketPricePerPoint}
                onChange={(e) => setRocketPricePerPoint(e.target.value)}
                placeholder="0.0001"
                className="w-full px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-[#6B7280]">Max points per tx</label>
              <input
                value={rocketMaxPoints}
                onChange={(e) => setRocketMaxPoints(e.target.value)}
                placeholder="1000"
                className="w-full px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white font-mono text-xs"
              />
            </div>
            <button
              type="button"
              disabled={!isRocketOwnerUi || busy || rocketLoading}
              onClick={() => void setRocketParams(rocketPricePerPoint, Number(rocketMaxPoints))}
              className="w-full px-4 py-2.5 rounded-lg bg-vault-primary text-[#0B0F14] font-semibold disabled:opacity-40 text-sm"
            >
              Update Rocket params
            </button>
          </div>

          <div className="rounded-xl border border-[#1F2937] bg-[#11161D]/50 p-4 space-y-3">
            <div className="text-sm font-medium text-[#D1D5DB]">Treasury & pause</div>
            <div className="space-y-2">
              <label className="text-xs text-[#6B7280]">Treasury</label>
              <input
                value={rocketTreasury}
                onChange={(e) => setRocketTreasuryValue(e.target.value)}
                placeholder="0x…"
                className="w-full px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white font-mono text-xs"
              />
            </div>
            <button
              type="button"
              disabled={!isRocketOwnerUi || busy || rocketLoading}
              onClick={() => void setRocketTreasuryOnChain(rocketTreasury)}
              className="w-full px-4 py-2 rounded-lg bg-[#11161D] border border-[#1F2937] text-white disabled:opacity-40 text-sm"
            >
              Set Rocket treasury
            </button>

            <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14]/70 p-3 text-xs text-[#9CA3AF]">
              Status:{' '}
              <span className="text-white font-semibold">
                {rocketPaused == null ? '—' : rocketPaused ? 'Paused' : 'Active'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!isRocketOwnerUi || busy || rocketLoading}
                onClick={async () => {
                  await pauseRocket();
                  await loadRocketOverview();
                }}
                className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-40"
              >
                Pause
              </button>
              <button
                type="button"
                disabled={!isRocketOwnerUi || busy || rocketLoading}
                onClick={async () => {
                  await unpauseRocket();
                  await loadRocketOverview();
                }}
                className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-40"
              >
                Unpause
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-6 border border-[#1F2937] bg-[#0B0F14]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4 text-vault-primary font-semibold">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Moderation (factory owner)
          </div>
        </div>
        <label className="text-xs text-[#6B7280] block mb-1">Target token address</label>
        <input
          value={tokenAddress}
          onChange={(e) => setTokenAddress(e.target.value)}
          placeholder="0x…"
          className="w-full px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white font-mono text-xs mb-3"
        />
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
          <input
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            placeholder="Ban reason"
            className="px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white text-sm"
          />
          <button
            type="button"
            disabled={!tokenOk || !banReason.trim() || busy || !factoryMeta?.isOwner}
            onClick={() => void ownerWrite((f) => f.banToken(tokenAddress.trim(), banReason.trim()), 'Token banned')}
            className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-40"
          >
            Ban
          </button>
          <button
            type="button"
            disabled={!tokenOk || busy || !factoryMeta?.isOwner}
            onClick={() => void ownerWrite((f) => f.unbanToken(tokenAddress.trim()), 'Token unbanned')}
            className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-40"
          >
            Unban
          </button>
        </div>
      </div>
    </div>
  );
};
