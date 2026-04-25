import React, { useState, useEffect } from 'react';
import { Rocket, DollarSign, Coins, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { useContracts } from '../hooks/useContracts';
import { useWeb3 } from '../hooks/useWeb3';
import { validateCreateTokenMetadata } from '../utils/tokenCreateMetadata';

interface CreateTokenFormProps {
  onSuccess: () => void;
  onTokenCreated?: () => void;
}

/** 0 = no lock; 1 = 3 months; 2 = 6 months; 3 = 1 year (on-chain) */
type FirstBuyLockTier = 0 | 1 | 2 | 3;

export type DividendToken = 'none' | 'bnb' | 'usdt';

const emptyForm = () => ({
  name: '',
  symbol: '',
  description: '',
  imageUrl: '',
  website: '',
  telegram: '',
  twitter: '',
  discord: '',
  firstBuyBnb: '0.0001',
  lockFirstBuy: false,
  lockMonths: 12 as 3 | 6 | 12,
  dividendToken: 'none' as DividendToken,
  totalTaxBps: 500,
  pctFunds: '40',
  pctBurn: '20',
  pctDividend: '20',
  pctLp: '20',
  fundsWallet: '',
  antiBotDays: 0 as 0 | 1,
});

export const CreateTokenForm: React.FC<CreateTokenFormProps> = ({ onSuccess, onTokenCreated }) => {
  const [formData, setFormData] = useState(emptyForm);
  const [imagePreviewOk, setImagePreviewOk] = useState(true);

  const { createToken, loading } = useContracts();
  const { isConnected, account } = useWeb3();

  useEffect(() => {
    if (account) {
      setFormData((f) => (f.fundsWallet === '' ? { ...f, fundsWallet: account } : f));
    }
  }, [account]);


  const lockTierFromForm = (): FirstBuyLockTier => {
    if (!formData.lockFirstBuy) return 0;
    if (formData.lockMonths === 3) return 1;
    if (formData.lockMonths === 6) return 2;
    return 3;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected) {
      console.log('Wallet not connected');
      return;
    }

    const metaErr = validateCreateTokenMetadata(formData.imageUrl, formData.description);
    if (metaErr) {
      toast.error(metaErr, { id: 'create-token' });
      return;
    }

    const tier = lockTierFromForm();

    const firstBuyNumCheck = parseFloat(formData.firstBuyBnb) || 0;
    if (tier > 0) {
      const CTO_MIN_BNB = 0.5;
      if (firstBuyNumCheck < CTO_MIN_BNB) {
        toast.error(`CTO first buy must be at least ${CTO_MIN_BNB} BNB`);
        return;
      }
    }

    const taxBps = Number(formData.totalTaxBps) || 0;
    /** On-chain: 0% tax => all allocation buckets must be 0; ignore stale % fields in the form. */
    const divOn = taxBps > 0 && formData.dividendToken !== 'none';
    const toPct = (v: string) => {
      const n = Number.parseInt((v ?? '').trim(), 10);
      if (Number.isNaN(n)) return 0;
      return Math.min(100, Math.max(0, n));
    };
    const pctFundsN = taxBps === 0 ? 0 : toPct(formData.pctFunds);
    const pctBurnN = taxBps === 0 ? 0 : toPct(formData.pctBurn);
    const pctDividendN = taxBps === 0 ? 0 : divOn ? toPct(formData.pctDividend) : 0;
    const pctLpN = taxBps === 0 ? 0 : toPct(formData.pctLp);
    const allocSum = pctFundsN + pctBurnN + pctDividendN + pctLpN;
    // If totalTaxBps == 0 => allow a tax-free token (all buckets can be 0).
    if (taxBps > 0) {
      if (allocSum !== 100) {
        toast.error('Tax allocation buckets must sum to 100%');
        return;
      }
    } else {
      if (allocSum !== 0) {
        toast.error('With 0% tax, all allocation buckets must be 0%');
        return;
      }
    }
    if (pctFundsN > 0 && !formData.fundsWallet.trim()) {
      toast.error('Set a funds wallet or set Funds % to 0');
      return;
    }

    const antiBotSec: Record<0 | 1, number> = { 0: 0, 1: 86400 };
    const rewardKind = divOn ? (formData.dividendToken === 'usdt' ? 1 : 0) : 0;

    const result = await createToken(
      formData.name,
      formData.symbol.toUpperCase(),
      formData.description,
      formData.imageUrl,
      formData.website,
      formData.telegram,
      formData.twitter,
      formData.discord,
      true,
      tier,
      formData.firstBuyBnb,
      divOn,
      {
        rewardKind,
        totalTaxBps: taxBps,
        allocFundsBps: pctFundsN * 100,
        allocBurnBps: pctBurnN * 100,
        allocDividendBps: pctDividendN * 100,
        allocLpBps: pctLpN * 100,
        fundsWallet: formData.fundsWallet.trim() || account || '',
        antiBotDurationSec: antiBotSec[formData.antiBotDays],
        antiBotMaxTxBps: 0,
        antiBotMaxWalletBps: 0,
        dividendExempt: '',
      }
    );

    if (result) {
      console.log('✅ TOKEN CREATED SUCCESSFULLY! Waiting 3 seconds before navigating back...');
      setFormData(emptyForm());

      if (onTokenCreated) {
        onTokenCreated();
      }

      setTimeout(() => {
        onSuccess();
      }, 3000);
    }
  };

  const isWalletConnected = isConnected && account;

  const creationFee = 0.0032;
  const firstBuyNum = parseFloat(formData.firstBuyBnb) || 0;
  const totalSend = creationFee + firstBuyNum;
  const uiPct = (v: string) => {
    const n = Number.parseInt((v ?? '').trim(), 10);
    if (Number.isNaN(n)) return 0;
    return Math.min(100, Math.max(0, n));
  };

  return (
    <div className="rounded-2xl p-8 border border-[#1F2937] bg-[#11161D]">
      {/* Image preview (top) */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl border border-[#1F2937] bg-[#0B0F14] overflow-hidden flex items-center justify-center shrink-0">
              {formData.imageUrl?.trim() && imagePreviewOk ? (
                <img
                  src={formData.imageUrl.trim()}
                  alt="Token logo preview"
                  className="w-full h-full object-cover"
                  onError={() => setImagePreviewOk(false)}
                  onLoad={() => setImagePreviewOk(true)}
                />
              ) : (
                <div className="text-center px-2">
                  <div className="text-[11px] text-[#9CA3AF] leading-snug">
                    {formData.imageUrl?.trim() ? 'Invalid image' : 'No logo yet'}
                  </div>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Token logo</div>
              <div className="text-xs text-[#6B7280] truncate font-mono">
                {formData.imageUrl?.trim() ? formData.imageUrl.trim() : 'Paste a link in the Image URL field'}
              </div>
            </div>
          </div>

          <div className="w-full sm:max-w-md">
            <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Image link (URL)</label>
            <input
              type="url"
              required
              value={formData.imageUrl}
              onChange={(e) => {
                setImagePreviewOk(true);
                setFormData({ ...formData, imageUrl: e.target.value });
              }}
              className="w-full px-4 py-3 bg-[#0B0F14] border border-[#1F2937] rounded-xl text-white placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-vault-primary"
              placeholder="https://.../logo.png"
            />
            <p className="text-xs text-[#9CA3AF] mt-2">
              Tip: use a square image (e.g. <span className="text-white font-semibold">500×500</span>).{' '}
              <span className="text-amber-200/90">
                Do not paste a base64 photo (data:image/...) — the tx becomes huge and the network reverts.
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-3 mb-6">
        <div className="bg-vault-primary p-3 rounded-xl">
          <Rocket className="h-5 w-5 text-[#0B0F14]" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-vault-primary">Create token</h2>
          <p className="text-xs text-[#9CA3AF] mt-1">
            Configure the first buy and, if desired, enable CTO mode (lock) to signal commitment.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-4">
          <div className="text-sm font-semibold text-white">Quick summary</div>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-[#1F2937] bg-[#11161D] px-3 py-2 text-[#9CA3AF]">
              Creation fee
              <div className="text-white font-semibold mt-1">{creationFee} BNB</div>
            </div>
            <div className="rounded-lg border border-[#1F2937] bg-[#11161D] px-3 py-2 text-[#9CA3AF]">
              First buy
              <div className="text-white font-semibold mt-1">{firstBuyNum ? `${firstBuyNum} BNB` : '—'}</div>
            </div>
            <div className="rounded-lg border border-[#1F2937] bg-[#11161D] px-3 py-2 text-[#9CA3AF]">
              Estimated total
              <div className="text-white font-semibold mt-1">{totalSend.toFixed(4)} BNB</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Token name</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-3 bg-[#0B0F14] border border-[#1F2937] rounded-xl text-white placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-vault-primary focus:border-vault-primary"
              placeholder="e.g. Tota Coin"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Symbol</label>
            <input
              type="text"
              required
              value={formData.symbol}
              onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
              className="w-full px-4 py-3 bg-[#0B0F14] border border-[#1F2937] rounded-xl text-white placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-vault-primary focus:border-vault-primary"
              placeholder="TOTA"
            />
            <p className="text-xs text-[#6B7280] mt-1">Tip: use 3–6 letters, no spaces.</p>
          </div>
        </div>

        <div className="rounded-xl p-6 border border-[#1F2937] bg-[#0B0F14]">
          <div className="text-vault-primary font-semibold text-lg mb-1">First buy (required)</div>
          <p className="text-[#9CA3AF] text-sm mb-4">
            At creation, the same transaction executes your first buy on the curve. You can enable CTO mode to lock that
            first buy and display the CTO badge on the token.
          </p>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">First buy amount (BNB)</label>
            <input
              type="text"
              required
              inputMode="decimal"
              value={formData.firstBuyBnb}
              onChange={(e) => setFormData({ ...formData, firstBuyBnb: e.target.value })}
              className="w-full px-4 py-3 bg-[#11161D] border border-[#1F2937] rounded-xl text-white placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-vault-primary"
              placeholder="0.0001"
            />
            <p className="text-xs text-[#9CA3AF] mt-1">
              Standard launches: minimum <span className="text-white font-semibold">0.0001 BNB</span>.
              If CTO is enabled: minimum <span className="text-white font-semibold">0.5 BNB</span>.
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={formData.lockFirstBuy}
              onChange={(e) => setFormData({ ...formData, lockFirstBuy: e.target.checked })}
              className="w-4 h-4 rounded border-[#1F2937] text-[#A855F7] focus:ring-[#A855F7]"
            />
            <span className="text-white font-semibold">Enable CTO (lock first buy + CTO badge)</span>
          </label>

          {formData.lockFirstBuy && (
            <div className="rounded-xl border border-[#1F2937] bg-[#11161D]/50 p-4">
              <div className="text-white font-semibold">Lock duration (CTO)</div>
              <p className="text-xs text-[#9CA3AF] mt-1">Choose how long the first buy stays locked.</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {([3, 6, 12] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFormData({ ...formData, lockMonths: m })}
                    className={`py-2 rounded-xl text-sm font-semibold border transition-colors ${
                      formData.lockMonths === m
                        ? 'bg-[#A855F7]/20 border-[#A855F7] text-[#FFFFFF]'
                        : 'bg-[#11161D] border-[#1F2937] text-[#9CA3AF] hover:border-[#A855F7]/50'
                    }`}
                  >
                    {m} months
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl p-6 border border-[#1F2937] bg-[#0B0F14]">
          <div className="flex items-center gap-2 text-vault-primary font-semibold text-lg mb-4">
            <Coins className="h-5 w-5" />
            DEX tax (after PancakeSwap)
          </div>
          <p className="text-[#9CA3AF] text-sm mb-4">
            After graduation, total DEX tax is capped at 10% on-chain (or <span className="text-white">0%</span> — no extra
            tax on Pancake trades). LP bucket is burned to dead (deflation); true auto-addLiquidity would need a separate
            upgrade due to bytecode limits.
          </p>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Total tax on each DEX trade</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {([0, 100, 300, 500, 1000] as const).map((bps) => (
                <button
                  key={bps}
                  type="button"
                  onClick={() => {
                    // If user enables tax and hasn't set any split yet, seed reasonable defaults.
                    const hasAny =
                      (Number.parseInt(String(formData.pctFunds || '0'), 10) || 0) +
                        (Number.parseInt(String(formData.pctBurn || '0'), 10) || 0) +
                        (formData.dividendToken === 'none'
                          ? 0
                          : (Number.parseInt(String(formData.pctDividend || '0'), 10) || 0)) +
                        (Number.parseInt(String(formData.pctLp || '0'), 10) || 0) >
                      0;

                    if (bps === 0) {
                      setFormData({
                        ...formData,
                        totalTaxBps: 0,
                        pctFunds: '0',
                        pctBurn: '0',
                        pctDividend: '0',
                        pctLp: '0',
                        dividendToken: 'none',
                      });
                      return;
                    }

                    if (bps > 0 && !hasAny) {
                      if (formData.dividendToken === 'none') {
                        setFormData({
                          ...formData,
                          totalTaxBps: bps,
                          pctFunds: '40',
                          pctBurn: '20',
                          pctLp: '40',
                        });
                        return;
                      }
                      setFormData({
                        ...formData,
                        totalTaxBps: bps,
                        pctFunds: '40',
                        pctBurn: '20',
                        pctDividend: '20',
                        pctLp: '20',
                      });
                      return;
                    }

                    setFormData({ ...formData, totalTaxBps: bps });
                  }}
                  className={`py-2 rounded-xl text-sm font-semibold border transition-colors ${
                    formData.totalTaxBps === bps
                      ? 'bg-vault-primary/20 border-vault-primary text-white'
                      : 'bg-[#11161D] border-[#1F2937] text-[#9CA3AF] hover:border-vault-primary/50'
                  }`}
                >
                  {bps === 0 ? '0%' : `${bps / 100}%`}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#6B7280] mt-2">
              0% = no extra fee on DEX trades after graduation.
            </p>
          </div>

          {Number(formData.totalTaxBps) > 0 ? (
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">
                How the tax is split (must sum 100% of the tax)
              </label>
              <p className="text-xs text-[#6B7280] mb-3">
                This is a split of the <span className="text-white font-semibold">tax</span>, not the trade amount.
                Example: with{' '}
                <span className="text-white font-semibold">{(Number(formData.totalTaxBps) / 100).toFixed(2)}%</span> total
                tax, setting <span className="text-white font-semibold">40%</span> Funds means{' '}
                <span className="text-white font-semibold">
                  {(((Number(formData.totalTaxBps) / 100) * 40) / 100).toFixed(2)}%
                </span>{' '}
                of each trade goes to Funds.
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-[#9CA3AF]">Funds wallet</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formData.pctFunds}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') return setFormData({ ...formData, pctFunds: '' });
                      const n = Number.parseInt(v, 10);
                      setFormData({
                        ...formData,
                        pctFunds: String(Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n))),
                      });
                    }}
                    className="w-full mt-1 px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white"
                  />
                </div>
                <div>
                  <span className="text-[#9CA3AF]">Burn</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formData.pctBurn}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') return setFormData({ ...formData, pctBurn: '' });
                      const n = Number.parseInt(v, 10);
                      setFormData({
                        ...formData,
                        pctBurn: String(Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n))),
                      });
                    }}
                    className="w-full mt-1 px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white"
                  />
                </div>
                <div>
                  <span className="text-[#9CA3AF]">Dividends (holders)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    disabled={formData.dividendToken === 'none'}
                    value={formData.dividendToken === 'none' ? '0' : formData.pctDividend}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') return setFormData({ ...formData, pctDividend: '' });
                      const n = Number.parseInt(v, 10);
                      setFormData({
                        ...formData,
                        pctDividend: String(Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n))),
                      });
                    }}
                    className="w-full mt-1 px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white disabled:opacity-40"
                  />
                </div>
                <div>
                  <span className="text-[#9CA3AF]">LP (burned / deflation)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formData.pctLp}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') return setFormData({ ...formData, pctLp: '' });
                      const n = Number.parseInt(v, 10);
                      setFormData({
                        ...formData,
                        pctLp: String(Number.isNaN(n) ? 0 : Math.min(100, Math.max(0, n))),
                      });
                    }}
                    className="w-full mt-1 px-3 py-2 bg-[#11161D] border border-[#1F2937] rounded-lg text-white"
                  />
                </div>
              </div>
              <p className="text-xs text-vault-primary mt-2">
                Current sum:{' '}
                {uiPct(formData.pctFunds) +
                  uiPct(formData.pctBurn) +
                  (formData.dividendToken === 'none' ? 0 : uiPct(formData.pctDividend)) +
                  uiPct(formData.pctLp)}
                %/100
              </p>
            </div>
          ) : (
            <div className="mb-4 rounded-xl border border-[#1F2937] bg-[#11161D]/40 p-4">
              <div className="text-sm font-semibold text-white">Tax split</div>
              <p className="text-xs text-[#9CA3AF] mt-1">
                With <span className="text-white font-semibold">0%</span> DEX tax, there is no split to configure.
              </p>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Funds wallet (receives token share)</label>
            <input
              type="text"
              value={formData.fundsWallet}
              onChange={(e) => setFormData({ ...formData, fundsWallet: e.target.value })}
              className="w-full px-4 py-3 bg-[#11161D] border border-[#1F2937] rounded-xl text-white text-sm"
              placeholder="0x..."
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Reward token (for dividend slice)</label>
            <div className="grid grid-cols-3 gap-2">
              {(['none', 'bnb', 'usdt'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      dividendToken: t,
                      pctDividend: t === 'none' ? '0' : formData.pctDividend || '20',
                    })
                  }
                  className={`py-2 rounded-xl text-sm font-semibold border transition-colors ${
                    formData.dividendToken === t
                      ? 'bg-vault-primary/20 border-vault-primary text-white'
                      : 'bg-[#11161D] border-[#1F2937] text-[#9CA3AF] hover:border-vault-primary/50'
                  }`}
                >
                  {t === 'none' ? 'None' : t === 'bnb' ? 'WBNB' : 'USDT'}
                </button>
              ))}
            </div>
            {formData.dividendToken !== 'none' && (
              <p className="text-xs text-[#9CA3AF] mt-2">
                Dividend share is swapped to {formData.dividendToken === 'usdt' ? 'USDT' : 'WBNB'}; call processDividends on
                the token, then claimDividend.
              </p>
            )}
          </div>

          <div className="rounded-xl p-4 border border-[#1F2937] bg-[#11161D]/50">
            <div className="flex items-center gap-2 text-vault-primary font-semibold mb-3">
              <Shield className="h-5 w-5" />
              Anti-bot (first days on DEX)
            </div>
            <p className="text-[#9CA3AF] text-xs mb-3">
              On-chain anti-bot is either OFF or active for 1 day after graduation.
            </p>
            <label className="block text-sm text-[#9CA3AF] mb-2">Duration</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {([0, 1] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setFormData({ ...formData, antiBotDays: d })}
                  className={`py-2 rounded-xl text-xs font-semibold border ${
                    formData.antiBotDays === d
                      ? 'bg-vault-primary/20 border-vault-primary text-white'
                      : 'bg-[#0B0F14] border-[#1F2937] text-[#9CA3AF]'
                  }`}
                >
                  {d === 0 ? 'Off' : `${d}d`}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-[#9CA3AF] mt-4">
            Tax parameters are fixed at graduation (no owner toggle on-chain in this build — trust / honeypot-friendly).
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Description</label>
          <textarea
            required
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            className="w-full px-4 py-3 bg-[#0B0F14] border border-[#1F2937] rounded-xl text-white placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-vault-primary"
            placeholder="Explain the token in 1–2 lines (e.g. meme, utility, links)."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Website (optional)</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              className="w-full px-4 py-3 bg-[#0B0F14] border border-[#1F2937] rounded-xl text-white placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-vault-primary"
              placeholder="https://..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Telegram (optional)</label>
            <input
              type="text"
              value={formData.telegram}
              onChange={(e) => setFormData({ ...formData, telegram: e.target.value })}
              className="w-full px-4 py-3 bg-[#0B0F14] border border-[#1F2937] rounded-xl text-white placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-vault-primary"
              placeholder="@channel"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Twitter (optional)</label>
            <input
              type="text"
              value={formData.twitter}
              onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
              className="w-full px-4 py-3 bg-[#0B0F14] border border-[#1F2937] rounded-xl text-white placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-vault-primary"
              placeholder="@handle"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#9CA3AF] mb-2">Discord (optional)</label>
            <input
              type="text"
              value={formData.discord}
              onChange={(e) => setFormData({ ...formData, discord: e.target.value })}
              className="w-full px-4 py-3 bg-[#0B0F14] border border-[#1F2937] rounded-xl text-white placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-vault-primary"
              placeholder="discord.gg/..."
            />
          </div>
        </div>

        <div className="rounded-xl p-4 border border-[#1F2937] bg-[#0B0F14]">
          <div className="flex items-center space-x-2 text-vault-primary mb-3">
            <DollarSign className="h-4 w-4" />
            <span className="font-semibold">Total in this transaction</span>
          </div>
          <p className="text-[#FFFFFF]">
            Creation fee: <span className="text-vault-primary font-semibold">{creationFee} BNB</span>
            <span className="text-[#9CA3AF] mx-2">+</span>
            first buy: <span className="text-vault-primary font-semibold">{firstBuyNum || '—'} BNB</span>
          </p>
          <p className="text-[#A855F7] font-semibold mt-2">Estimated total: {totalSend.toFixed(4)} BNB</p>
        </div>

        <button
          type="submit"
          disabled={!isWalletConnected || loading}
          className="w-full px-6 py-4 bg-vault-primary hover:bg-vault-primary-hover disabled:bg-[#1F2937] text-[#0B0F14] font-bold rounded-xl transition-all duration-200 disabled:cursor-not-allowed"
        >
          {!isWalletConnected ? 'Connect wallet to create' : loading ? 'Creating...' : 'Create token'}
        </button>
      </form>
    </div>
  );
};
