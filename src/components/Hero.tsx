import React from 'react';
import { Plus, Search } from 'lucide-react';
import { RocketRanking } from './RocketRanking';
import { TokenInfo } from '../hooks/useContracts';
import { useGlobalTrades } from '../hooks/useGlobalTrades';
import type { AppView } from '../App';

// --- EventTicker ---
const EventTicker: React.FC<{ limit?: number; onTokenSelect: (addr: string) => void }> = ({ limit = 8, onTokenSelect }) => {
  const { trades } = useGlobalTrades();

  if (!trades || trades.length === 0) {
    return (
      <div className="w-full bg-[#11161D]/80 border border-[#1F2937]/80 text-[#6B7280] px-4 py-2 mb-4 text-[11px] font-mono rounded-lg">
        Live activity loads in the background — no need to wait.
      </div>
    );
  }

  const latest = trades.slice(0, limit);

  return (
    <div className="w-full overflow-hidden relative mb-4">
      <style>
        {`
          @keyframes marquee {
            0% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
          .animate-marquee {
            display: flex;
            gap: 1rem;
            animation: marquee 25s linear infinite;
            white-space: nowrap;
          }
        `}
      </style>

      <div className="animate-marquee">
        {latest.concat(latest).map((t, i) => (
          <div
            key={i}
            onClick={() => onTokenSelect(t.tokenAddress)}
            className={`px-4 py-2 rounded-lg text-sm font-bold cursor-pointer border transition-transform hover:scale-105 ${
              t.side === 'buy'
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : t.side === 'sell'
                ? 'bg-red-500/15 border-red-500/50 text-red-300'
                : 'bg-[#A855F7]/15 border-[#A855F7]/50 text-[#A855F7]'
            }`}
          >
            <span className="font-mono">
              {t.user.slice(0, 6)}...{t.user.slice(-4)}
            </span>{' '}
            {t.side === 'buy'
              ? `BUY ${t.tokenAmount?.toFixed(2)} ${t.tokenSymbol ?? ''}`
              : t.side === 'sell'
              ? `SELL ${t.tokenAmount?.toFixed(2)} ${t.tokenSymbol ?? ''}`
              : `Created ${t.tokenSymbol ?? ''}`}
          </div>
        ))}
      </div>
    </div>
  );
};

interface HeroProps {
  onNavigate: (view: AppView) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  tokens: TokenInfo[];
  onTokenSelect: (tokenAddress: string) => void;
  onRocketBoost: (token: TokenInfo) => void;
}

export const Hero: React.FC<HeroProps> = ({
  onNavigate,
  searchTerm,
  onSearchChange,
  tokens,
  onTokenSelect,
  onRocketBoost,
}) => {
  return (
    <div className="relative pb-8">
      <div className="relative overflow-hidden rounded-3xl border border-[#1F2937] bg-gradient-to-br from-[#11161D] via-[#0F141B] to-[#0B0F14] px-5 py-6 md:px-8 md:py-8">
        <div className="pointer-events-none absolute -top-24 -right-20 h-56 w-56 rounded-full bg-vault-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-[#A855F7]/10 blur-3xl" />

        <p className="text-[11px] uppercase tracking-[0.24em] text-[#9CA3AF] mb-3">Tota Vault</p>
        <EventTicker limit={8} onTokenSelect={onTokenSelect} />

        <div className="mt-5 grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-8 space-y-5">
            <h1 className="text-3xl md:text-5xl font-semibold text-white leading-tight max-w-4xl">
              Launch meme coins with
              <span className="text-vault-primary"> first-buy commitment</span>
              <span className="text-[#A855F7]"> and bonding curves</span>
            </h1>

            <p className="text-[#9CA3AF] text-base md:text-lg max-w-3xl leading-relaxed">
              Deploy fast on BNB Chain, trade instantly on the curve, and keep launch data transparent from day one.
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('create')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-vault-primary text-[#0B0F14] font-bold hover:bg-vault-primary-hover transition-colors"
              >
                <Plus className="h-5 w-5" />
                Create token
              </button>
              <button
                type="button"
                onClick={() => onNavigate('faq')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[#2A3442] text-white hover:border-vault-primary hover:text-vault-primary transition-colors"
              >
                FAQ
              </button>
            </div>
          </div>

          <div className="xl:col-span-4">
            <div className="rounded-2xl border border-[#1F2937] bg-[#0B0F14]/70 p-4 md:p-5">
              <p className="text-sm font-semibold text-white mb-3">Quick Search</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-primary h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search by name, symbol, address..."
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[#11161D] border border-[#1F2937] rounded-xl text-white placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-vault-primary focus:border-vault-primary text-sm"
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-[#1F2937] bg-[#11161D] px-3 py-2 text-[#9CA3AF]">
                  Network
                  <p className="text-white font-semibold mt-1">BNB Chain</p>
                </div>
                <div className="rounded-lg border border-[#1F2937] bg-[#11161D] px-3 py-2 text-[#9CA3AF]">
                  Launch Mode
                  <p className="text-white font-semibold mt-1">Bonding Curve</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <span className="px-2.5 py-1 rounded-full text-xs border border-[#2A3442] bg-[#11161D] text-[#9CA3AF]">CTO First Buy</span>
          <span className="px-2.5 py-1 rounded-full text-xs border border-[#2A3442] bg-[#11161D] text-[#9CA3AF]">Curve Trading</span>
          <span className="px-2.5 py-1 rounded-full text-xs border border-[#2A3442] bg-[#11161D] text-[#9CA3AF]">Factory Dashboard</span>
          <span className="px-2.5 py-1 rounded-full text-xs border border-[#2A3442] bg-[#11161D] text-[#9CA3AF]">Platform Lock</span>
        </div>
      </div>

      <div className="mt-8">
        <RocketRanking tokens={tokens} onTokenSelect={onTokenSelect} onRocketBoost={onRocketBoost} />
      </div>
    </div>
  );
};
