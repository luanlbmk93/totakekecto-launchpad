import React from 'react';
import { Calendar, ChevronRight, ShieldCheck } from 'lucide-react';
import { TokenInfo } from '../hooks/useContracts';

interface TokenCardProps {
  token: TokenInfo;
  onRefresh: () => void;
  onTokenSelect: (tokenAddress: string) => void;
}

const mini = 'inline-flex items-center rounded border px-1 py-px text-[8px] font-bold uppercase tracking-wide';

function formatCurveBnb(s: string) {
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return '0';
  if (n === 0) return '0';
  // Never show scientific notation in UI.
  if (n < 0.000001) {
    const fixed = n.toFixed(12);
    // trim trailing zeros
    return fixed.replace(/\.?0+$/, '');
  }
  if (n < 0.01) return n.toFixed(6).replace(/\.?0+$/, '');
  if (n < 1) return n.toFixed(4);
  return n.toFixed(3);
}

export const TokenCard: React.FC<TokenCardProps> = ({ token, onRefresh, onTokenSelect }) => {
  const getProgressPercent = () => {
    if (token.graduated) return 100;
    const current = parseFloat(token.realETH);
    const target = parseFloat(token.graduationTargetEth ?? '0.01');
    const t = Number.isFinite(target) && target > 0 ? target : 0.01;
    return Math.min((current / t) * 100, 100);
  };

  const pct = getProgressPercent();
  const isBanned = token.isBanned;
  const hasCto = (token.firstBuyLockTier ?? 0) > 0;
  void onRefresh;

  const created = new Date(parseInt(token.createdAt, 10) * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className="group flex gap-3 rounded-xl border border-[#1F2937] bg-[#11161D] p-2.5 pr-3 transition-all hover:border-vault-primary/45 hover:bg-[#141a22] cursor-pointer"
      onClick={() => onTokenSelect(token.tokenAddress)}
    >
      {/* Coin logo LARGE — left side, card bottom */}
      <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 sm:h-20 sm:w-20">
        <div className="h-full w-full overflow-hidden rounded-xl border-2 border-[#2A3442] bg-[#0B0F14] shadow-inner ring-1 ring-white/5">
          <img
            src={token.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=200';
            }}
          />
        </div>
        {isBanned && <div className="absolute inset-0 rounded-xl bg-red-900/25 ring-1 ring-red-500/40" aria-hidden />}
        {hasCto && (
          <span
            className="absolute -bottom-0.5 -right-0.5 flex items-center gap-0.5 rounded-md border border-violet-400/40 bg-gradient-to-br from-[#6d28d9] to-[#4c1d95] px-1 py-px shadow-md"
            title="CTO"
          >
            <ShieldCheck className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
            <span className="pr-0.5 text-[7px] font-extrabold text-white">CTO</span>
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold leading-tight text-white sm:text-[15px]">{token.name}</h3>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-vault-primary">${token.symbol}</p>
          </div>
          <span className="shrink-0 text-sm font-bold tabular-nums text-vault-primary">{pct.toFixed(0)}%</span>
        </div>

        <div className="flex flex-wrap gap-1">
          {token.graduated && (
            <span className={`${mini} border-emerald-500/45 bg-emerald-500/10 text-emerald-300`}>DEX</span>
          )}
          {isBanned && <span className={`${mini} border-red-500/50 bg-red-500/10 text-red-300`}>Banned</span>}
          {token.paysDividends && (
            <span className={`${mini} border-amber-500/40 bg-amber-500/10 text-amber-200`}>Div</span>
          )}
        </div>

        <p className="text-[10px] leading-tight text-zinc-500">
          <span className="text-zinc-400">Curve</span>{' '}
          <span className="font-semibold text-white">{formatCurveBnb(token.realETH)}</span>
          <span className="text-zinc-600"> BNB</span>
          <span className="mx-1.5 text-zinc-600">·</span>
          <span className="text-zinc-400">Target</span>{' '}
          <span className="font-medium text-white/90">{formatCurveBnb(token.graduationTargetEth ?? '0.01')}</span>
          <span className="text-zinc-600"> BNB</span>
        </p>

        {!token.graduated && (
          <div className="h-1 overflow-hidden rounded-full bg-[#0B0F14]">
            <div className="h-full rounded-full bg-vault-primary" style={{ width: `${pct}%` }} />
          </div>
        )}

        <div className="flex items-center justify-between text-[9px] text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3 opacity-70" />
            {created}
          </span>
          <span className="inline-flex items-center gap-0.5 font-semibold text-vault-primary group-hover:translate-x-px">
            Open <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
};
