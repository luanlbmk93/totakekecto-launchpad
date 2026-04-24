import React, { useEffect, useMemo, useState } from 'react';
import { ethers, isAddress } from 'ethers';
import {
  User,
  RefreshCw,
  Image as ImageIcon,
  Globe,
  Send,
  Twitter,
  MessageCircle,
  Save,
  PackageCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useWeb3 } from '../hooks/useWeb3';
import { useContracts, TokenInfo } from '../hooks/useContracts';
import { CONTRACT_ADDRESSES, TOKEN_FACTORY_ABI } from '../contracts/contractAddresses';

const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`;

type MetaForm = {
  description: string;
  imageUrl: string;
  website: string;
  telegram: string;
  twitter: string;
  discord: string;
};

const emptyMeta: MetaForm = {
  description: '',
  imageUrl: '',
  website: '',
  telegram: '',
  twitter: '',
  discord: '',
};

export const CreatorPanel: React.FC = () => {
  const { signer, account, isConnected } = useWeb3();
  const {
    getAllTokens,
    updateTokenMetadata,
    claimFirstBuyTokens,
    getCreatorFirstBuyStatus,
    loading,
  } = useContracts();

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [selected, setSelected] = useState<string>('');
  const [manualAddress, setManualAddress] = useState('');
  const [form, setForm] = useState<MetaForm>(emptyMeta);
  const [saving, setSaving] = useState(false);
  const [firstBuyStatus, setFirstBuyStatus] = useState<null | {
    tier: number;
    unlockTime: string;
    lockedAmount: string;
    hasLockCommitment: boolean;
    canClaim: boolean;
  }>(null);

  const myTokens = useMemo(() => {
    if (!account) return [] as TokenInfo[];
    return tokens.filter((t) => (t.creator ?? '').toLowerCase() === account.toLowerCase());
  }, [tokens, account]);

  const selectedToken = useMemo(
    () => myTokens.find((t) => t.tokenAddress.toLowerCase() === selected.toLowerCase()) ?? null,
    [myTokens, selected]
  );

  const loadTokens = async () => {
    setLoadingTokens(true);
    try {
      const list = await getAllTokens();
      setTokens(list);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.reason || 'Failed to load tokens');
    } finally {
      setLoadingTokens(false);
    }
  };

  useEffect(() => {
    void loadTokens();
  }, []);

  useEffect(() => {
    if (!selected && myTokens.length > 0) setSelected(myTokens[0].tokenAddress);
  }, [myTokens, selected]);

  useEffect(() => {
    if (selectedToken) {
      setForm({
        description: selectedToken.description ?? '',
        imageUrl: selectedToken.imageUrl ?? '',
        website: selectedToken.website ?? '',
        telegram: selectedToken.telegram ?? '',
        twitter: selectedToken.twitter ?? '',
        discord: selectedToken.discord ?? '',
      });
      void refreshFirstBuyStatus(selectedToken.tokenAddress);
    } else {
      setForm(emptyMeta);
      setFirstBuyStatus(null);
    }
  }, [selectedToken?.tokenAddress]);

  const refreshFirstBuyStatus = async (addr: string) => {
    try {
      const s = await getCreatorFirstBuyStatus(addr);
      setFirstBuyStatus(s);
    } catch {
      setFirstBuyStatus(null);
    }
  };

  const handleAddManual = async () => {
    const a = manualAddress.trim();
    if (!isAddress(a)) {
      toast.error('Invalid address');
      return;
    }
    if (!signer) {
      toast.error('Connect your wallet first');
      return;
    }
    try {
      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, signer);
      const info = await factory.tokenInfo(a);
      const creator = String(info.creator ?? '').toLowerCase();
      if (!account || creator !== account.toLowerCase()) {
        toast.error('This wallet is not the creator of that token');
        return;
      }
      const bonding = await factory.bondingCurves(a);
      const newTok: TokenInfo = {
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
        realETH: ethers.formatEther(bonding.realETH),
        graduationTargetEth: ethers.formatEther(bonding.targetETH),
        creatorTokensBurned: info.creatorTokensBurned,
        vestingEndTime: info.vestingEndTime.toString(),
        dexPair: info.dexPair,
        firstBuyLockTier: Number(info.firstBuyLockTier ?? 0),
        firstBuyUnlockTime: (info.firstBuyUnlockTime ?? 0n).toString(),
      };
      setTokens((prev) => {
        if (prev.some((t) => t.tokenAddress.toLowerCase() === a.toLowerCase())) return prev;
        return [newTok, ...prev];
      });
      setSelected(info.tokenAddress);
      setManualAddress('');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.reason || 'Failed to load token from chain');
    }
  };

  const handleSave = async () => {
    if (!selectedToken) return;
    setSaving(true);
    try {
      const ok = await updateTokenMetadata(
        selectedToken.tokenAddress,
        form.description,
        form.imageUrl,
        form.website,
        form.telegram,
        form.twitter,
        form.discord
      );
      if (ok) {
        await loadTokens();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClaim = async () => {
    if (!selectedToken) return;
    await claimFirstBuyTokens(selectedToken.tokenAddress);
    await refreshFirstBuyStatus(selectedToken.tokenAddress);
  };

  if (!isConnected) {
    return (
      <div className="max-w-3xl mx-auto rounded-2xl p-8 border border-[#1F2937] bg-[#11161D] text-center">
        <div className="flex justify-center mb-4">
          <div className="bg-vault-primary/15 p-3 rounded-xl">
            <User className="h-6 w-6 text-vault-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">My coins</h1>
        <p className="text-[#9CA3AF]">
          Connect your wallet to manage metadata for the memecoins you created.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="rounded-2xl p-8 border border-[#1F2937] bg-[#11161D]">
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-vault-primary/20 p-3 rounded-xl">
            <User className="h-6 w-6 text-vault-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">My coins</h1>
        </div>
        <p className="text-[#9CA3AF] text-sm">
          Manage the memecoins you created with <span className="text-vault-primary font-medium">{account ? shortAddr(account) : '—'}</span>:
          update logo, description, social links and claim your locked first buy when available.
        </p>
      </div>

      <div className="rounded-2xl p-6 border border-[#1F2937] bg-[#0B0F14] space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm font-semibold text-white">
            Your tokens {loadingTokens ? '(loading…)' : `(${myTokens.length})`}
          </div>
          <button
            type="button"
            onClick={() => void loadTokens()}
            disabled={loadingTokens}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#11161D] border border-[#1F2937] text-white text-xs disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingTokens ? 'animate-spin' : ''}`} />
            Refresh list
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
            placeholder="Add a token address you created (0x…)"
            className="flex-1 px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => void handleAddManual()}
            className="px-4 py-2 rounded-lg bg-[#11161D] border border-[#1F2937] text-white text-sm hover:border-vault-primary/50"
          >
            Add
          </button>
        </div>

        {myTokens.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#1F2937] bg-[#11161D]/40 p-6 text-center text-sm text-[#9CA3AF]">
            You have not created any token with this wallet yet, or the token list is still syncing.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {myTokens.map((t) => {
              const isSel = selected.toLowerCase() === t.tokenAddress.toLowerCase();
              return (
                <button
                  key={t.tokenAddress}
                  type="button"
                  onClick={() => setSelected(t.tokenAddress)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                    isSel
                      ? 'border-vault-primary bg-vault-primary/10'
                      : 'border-[#1F2937] bg-[#11161D]/50 hover:border-vault-primary/40'
                  }`}
                >
                  <img
                    src={t.imageUrl}
                    alt=""
                    className="h-10 w-10 rounded-lg object-cover border border-[#1F2937] bg-[#0B0F14] shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=100';
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-white text-sm font-semibold truncate">{t.name}</div>
                    <div className="text-[#9CA3AF] text-xs uppercase tracking-wide">${t.symbol}</div>
                    <div className="text-[10px] font-mono text-[#6B7280] truncate">{shortAddr(t.tokenAddress)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedToken && (
        <>
          <div className="rounded-2xl p-6 border border-[#1F2937] bg-[#0B0F14] space-y-5">
            <div className="flex items-start gap-3">
              <div className="bg-vault-primary/15 p-2.5 rounded-xl shrink-0">
                <ImageIcon className="h-5 w-5 text-vault-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Update metadata</h2>
                <p className="text-sm text-[#9CA3AF] mt-1">
                  Change the logo, description and social links for{' '}
                  <span className="text-white font-semibold">{selectedToken.name}</span>{' '}
                  (<span className="font-mono">{shortAddr(selectedToken.tokenAddress)}</span>).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4">
              <div className="h-24 w-24 rounded-xl border border-[#1F2937] bg-[#11161D] overflow-hidden flex items-center justify-center shrink-0">
                {form.imageUrl?.trim() ? (
                  <img src={form.imageUrl.trim()} alt="Logo preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-[#6B7280]">No logo yet</span>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#9CA3AF]">Image URL (logo)</label>
                <input
                  type="url"
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                  placeholder="https://.../logo.png"
                  className="w-full px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white font-mono text-xs"
                />
                <p className="text-[11px] text-[#6B7280]">
                  Square image recommended (500×500). Do not paste base64 photos.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9CA3AF] mb-1">Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white text-sm"
                placeholder="Short description of your memecoin"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[#9CA3AF] mb-1">
                  <Globe className="h-3.5 w-3.5" /> Website
                </label>
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  className="w-full px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white text-sm"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[#9CA3AF] mb-1">
                  <Send className="h-3.5 w-3.5" /> Telegram
                </label>
                <input
                  type="text"
                  value={form.telegram}
                  onChange={(e) => setForm({ ...form, telegram: e.target.value })}
                  className="w-full px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white text-sm"
                  placeholder="@channel"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[#9CA3AF] mb-1">
                  <Twitter className="h-3.5 w-3.5" /> Twitter / X
                </label>
                <input
                  type="text"
                  value={form.twitter}
                  onChange={(e) => setForm({ ...form, twitter: e.target.value })}
                  className="w-full px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white text-sm"
                  placeholder="@handle"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[#9CA3AF] mb-1">
                  <MessageCircle className="h-3.5 w-3.5" /> Discord
                </label>
                <input
                  type="text"
                  value={form.discord}
                  onChange={(e) => setForm({ ...form, discord: e.target.value })}
                  className="w-full px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white text-sm"
                  placeholder="discord.gg/..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || loading}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-vault-primary text-[#0B0F14] font-bold disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {saving || loading ? 'Saving…' : 'Save metadata'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl p-6 border border-[#1F2937] bg-[#0B0F14] space-y-4">
            <div className="flex items-start gap-3">
              <div className="bg-vault-primary/15 p-2.5 rounded-xl shrink-0">
                <PackageCheck className="h-5 w-5 text-vault-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Creator first buy</h2>
                <p className="text-sm text-[#9CA3AF] mt-1">
                  If you enabled CTO lock at launch, your first-buy tokens become claimable after the lock expires.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[#1F2937] bg-[#11161D]/50 p-4 text-sm space-y-2">
              <div className="text-[#9CA3AF]">
                Lock tier:{' '}
                <span className="text-white">
                  {firstBuyStatus?.tier === 0 && 'None'}
                  {firstBuyStatus?.tier === 1 && '3 months'}
                  {firstBuyStatus?.tier === 2 && '6 months'}
                  {firstBuyStatus?.tier === 3 && '12 months'}
                  {firstBuyStatus == null && '—'}
                </span>
              </div>
              <div className="text-[#9CA3AF]">
                Locked amount:{' '}
                <span className="text-white">
                  {firstBuyStatus ? `${firstBuyStatus.lockedAmount} tokens` : '—'}
                </span>
              </div>
              <div className="text-[#9CA3AF]">
                Status:{' '}
                <span className="text-white">
                  {firstBuyStatus?.canClaim
                    ? 'Ready to claim'
                    : firstBuyStatus?.hasLockCommitment
                      ? 'Still locked'
                      : 'No locked first buy'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleClaim()}
              disabled={loading || !firstBuyStatus?.canClaim}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-vault-primary text-[#0B0F14] font-bold disabled:opacity-40"
            >
              Claim first buy tokens
            </button>
          </div>
        </>
      )}
    </div>
  );
};
