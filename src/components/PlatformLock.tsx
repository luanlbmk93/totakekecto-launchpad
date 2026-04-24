import React, { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { Lock, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWeb3 } from '../hooks/useWeb3';
import { CONTRACT_ADDRESSES, PLATFORM_TOKEN_LOCK_ABI } from '../contracts/contractAddresses';

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

const DURATION_PRESETS: { label: string; seconds: number }[] = [
  { label: '7 days', seconds: 7 * 86400 },
  { label: '30 days', seconds: 30 * 86400 },
  { label: '90 days', seconds: 90 * 86400 },
  { label: '365 days', seconds: 365 * 86400 },
];

type LockRow = { id: number; amount: bigint; unlockAt: bigint; withdrawn: boolean };

export const PlatformLock: React.FC = () => {
  const { signer, account, isConnected } = useWeb3();
  const vault = CONTRACT_ADDRESSES.PLATFORM_TOKEN_LOCK?.trim() ?? '';

  const [tokenAddr, setTokenAddr] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [durationSec, setDurationSec] = useState(DURATION_PRESETS[1].seconds);
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [decimals, setDecimals] = useState(18);
  const [rows, setRows] = useState<LockRow[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const vaultOk = vault.length > 0 && ethers.isAddress(vault);

  const fetchTokenMeta = useCallback(async () => {
    if (!signer || !tokenAddr.trim() || !ethers.isAddress(tokenAddr.trim())) {
      setTokenSymbol('');
      setDecimals(18);
      return;
    }
    setLoadingMeta(true);
    try {
      const erc20 = new ethers.Contract(tokenAddr.trim(), ERC20_ABI, signer);
      const [sym, dec] = await Promise.all([
        erc20.symbol().catch(() => 'TOKEN'),
        erc20.decimals().catch(() => 18),
      ]);
      setTokenSymbol(String(sym));
      setDecimals(Number(dec));
    } catch {
      setTokenSymbol('');
      toast.error('Could not read token contract');
    } finally {
      setLoadingMeta(false);
    }
  }, [signer, tokenAddr]);

  useEffect(() => {
    const t = setTimeout(() => void fetchTokenMeta(), 400);
    return () => clearTimeout(t);
  }, [fetchTokenMeta]);

  const loadLocks = useCallback(async () => {
    if (!signer || !account || !vaultOk || !tokenAddr.trim() || !ethers.isAddress(tokenAddr.trim())) {
      setRows([]);
      return;
    }
    setRefreshing(true);
    try {
      const lock = new ethers.Contract(vault, PLATFORM_TOKEN_LOCK_ABI, signer);
      const token = tokenAddr.trim();
      const n = Number(await lock.lockCount(account, token));
      const out: LockRow[] = [];
      for (let i = 0; i < n; i++) {
        const [amount, unlockAt, withdrawn] = await lock.lockInfo(account, token, i);
        out.push({ id: i, amount, unlockAt, withdrawn });
      }
      setRows(out);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load locks');
    } finally {
      setRefreshing(false);
    }
  }, [signer, account, vaultOk, tokenAddr, vault]);

  useEffect(() => {
    void loadLocks();
  }, [loadLocks]);

  const handleApproveAndDeposit = async () => {
    if (!signer || !account || !vaultOk) return;
    const t = tokenAddr.trim();
    if (!ethers.isAddress(t)) {
      toast.error('Invalid token address');
      return;
    }
    const amt = amountStr.trim();
    if (!amt || Number(amt) <= 0) {
      toast.error('Enter amount');
      return;
    }
    setBusy(true);
    try {
      const erc20 = new ethers.Contract(t, ERC20_ABI, signer);
      const lock = new ethers.Contract(vault, PLATFORM_TOKEN_LOCK_ABI, signer);
      const parsed = ethers.parseUnits(amt, decimals);
      const cur = await erc20.allowance(account, vault);
      if (cur < parsed) {
        const txA = await erc20.approve(vault, ethers.MaxUint256);
        await txA.wait();
      }
      const txD = await lock.deposit(t, parsed, BigInt(durationSec));
      await txD.wait();
      toast.success('Tokens locked');
      setAmountStr('');
      await loadLocks();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Transaction failed';
      toast.error(msg.slice(0, 120));
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async (lockId: number) => {
    if (!signer || !vaultOk) return;
    const t = tokenAddr.trim();
    setBusy(true);
    try {
      const lock = new ethers.Contract(vault, PLATFORM_TOKEN_LOCK_ABI, signer);
      const tx = await lock.withdraw(t, lockId);
      await tx.wait();
      toast.success('Withdrawn');
      await loadLocks();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Withdraw failed';
      toast.error(msg.slice(0, 120));
    } finally {
      setBusy(false);
    }
  };

  if (!vaultOk) {
    return (
      <div className="max-w-2xl mx-auto rounded-2xl p-8 border border-[#1F2937] bg-[#11161D]">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-vault-primary/20 p-3 rounded-xl">
            <Lock className="h-6 w-6 text-vault-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">Platform lock</h1>
        </div>
        <p className="text-[#9CA3AF] text-sm leading-relaxed">
          Set <span className="font-mono text-white">PLATFORM_TOKEN_LOCK</span> in{' '}
          <span className="font-mono text-white">src/contracts/contractAddresses.ts</span> to the deployed{' '}
          <span className="font-mono text-white">TotaVaultLocked</span> address (printed at the end of{' '}
          <span className="font-mono text-white">npm run deploy:bsc</span> / <span className="font-mono">deploy:testnet</span>
          ).
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="rounded-2xl p-8 border border-[#1F2937] bg-[#11161D]">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-vault-primary/20 p-3 rounded-xl">
            <Lock className="h-6 w-6 text-vault-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">Platform lock</h1>
        </div>
        <p className="text-[#9CA3AF] text-sm mb-6">
          Lock BEP-20 tokens in the platform vault.
        </p>
        <p className="text-xs text-[#6B7280] font-mono break-all mb-6">Vault: {vault}</p>

        <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Token address</label>
        <input
          value={tokenAddr}
          onChange={(e) => setTokenAddr(e.target.value)}
          placeholder="0x..."
          className="w-full px-4 py-3 bg-[#0B0F14] border border-[#1F2937] rounded-xl text-white font-mono text-sm mb-4"
        />

        <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">
          Amount {tokenSymbol ? `(${tokenSymbol})` : ''} {loadingMeta ? '…' : ''}
        </label>
        <input
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          inputMode="decimal"
          placeholder="0.0"
          className="w-full px-4 py-3 bg-[#0B0F14] border border-[#1F2937] rounded-xl text-white mb-4"
        />

        <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Lock duration</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          {DURATION_PRESETS.map((p) => (
            <button
              key={p.seconds}
              type="button"
              onClick={() => setDurationSec(p.seconds)}
              className={`py-2 rounded-xl text-xs font-semibold border ${
                durationSec === p.seconds
                  ? 'bg-vault-primary/20 border-vault-primary text-white'
                  : 'bg-[#0B0F14] border-[#1F2937] text-[#9CA3AF]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={!isConnected || !account || busy}
          onClick={() => void handleApproveAndDeposit()}
          className="w-full px-6 py-4 bg-vault-primary hover:bg-vault-primary-hover disabled:bg-[#1F2937] text-[#0B0F14] font-bold rounded-xl"
        >
          {!isConnected ? 'Connect wallet' : busy ? 'Working…' : 'Approve (if needed) & lock'}
        </button>
      </div>

      <div className="rounded-2xl p-6 border border-[#1F2937] bg-[#0B0F14]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-vault-primary">Your locks</h2>
          <button
            type="button"
            onClick={() => void loadLocks()}
            disabled={refreshing || !tokenAddr.trim()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1F2937] text-[#9CA3AF] hover:text-white text-sm"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        {!tokenAddr.trim() || !ethers.isAddress(tokenAddr.trim()) ? (
          <p className="text-[#9CA3AF] text-sm">Enter a token address to see positions.</p>
        ) : rows.length === 0 ? (
          <p className="text-[#9CA3AF] text-sm">No locks for this token.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const now = Math.floor(Date.now() / 1000);
              const ready = !r.withdrawn && Number(r.unlockAt) <= now;
              const humanAmt = ethers.formatUnits(r.amount, decimals);
              return (
                <li
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 rounded-xl border border-[#1F2937] bg-[#11161D]"
                >
                  <div>
                    <div className="text-white font-mono text-sm">
                      #{r.id} — {humanAmt} {tokenSymbol || 'tokens'}
                    </div>
                    <div className="text-xs text-[#9CA3AF]">
                      {r.withdrawn
                        ? 'Withdrawn'
                        : `Unlocks ${new Date(Number(r.unlockAt) * 1000).toLocaleString()}`}
                    </div>
                  </div>
                  {!r.withdrawn && (
                    <button
                      type="button"
                      disabled={!ready || busy}
                      onClick={() => void handleWithdraw(r.id)}
                      className="px-4 py-2 rounded-lg bg-[#A855F7] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {ready ? 'Withdraw' : 'Still locked'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
