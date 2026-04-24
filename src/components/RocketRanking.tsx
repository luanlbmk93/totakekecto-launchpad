/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Rocket,
  Zap,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Flame,
  Image as ImageIcon,
} from "lucide-react";
import { TokenInfo } from "../hooks/useContracts";
import { useRocketBoost } from "../hooks/useRocketBoost";

interface RocketRankingProps {
  tokens: TokenInfo[];
  onTokenSelect: (tokenAddress: string) => void;
  onRocketBoost?: (token: TokenInfo) => void;
}

interface TokenWithScore extends TokenInfo {
  rocketScore: number;
}

const RANK_LABELS = [
  "1ST",
  "2ND",
  "3RD",
  "4TH",
  "5TH",
  "6TH",
  "7TH",
  "8TH",
  "9TH",
  "10TH",
];

export const RocketRanking: React.FC<RocketRankingProps> = ({
  tokens,
  onTokenSelect,
}) => {
  const [boosted, setBoosted] = useState<TokenWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>({
    decayPerHour: 0,
    pricePerPoint: "0",
    paused: false,
  });

  const { getRocketScore, getRocketConfig } = useRocketBoost();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isPointerDown = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        try {
          const cfg = await getRocketConfig();
          if (cfg) setConfig(cfg);
        } catch {}
        const arr: TokenWithScore[] = [];
        if (tokens?.length) {
          for (const t of tokens.slice(0, 30)) {
            try {
              const score = Number((await getRocketScore(t.tokenAddress)) || 0);
              if (score > 0) arr.push({ ...t, rocketScore: score });
            } catch {}
          }
        }
        arr.sort((a, b) => b.rocketScore - a.rocketScore);
        setBoosted(arr.slice(0, 10));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tokens]);

  const displayed: (TokenWithScore | null)[] = useMemo(() => {
    const slots = new Array(10).fill(null) as (TokenWithScore | null)[];
    for (let i = 0; i < Math.min(boosted.length, 10); i++) slots[i] = boosted[i];
    return slots;
  }, [boosted]);

  const loopItems = useMemo(() => [...displayed, ...displayed], [displayed]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const speed = 0.8;
    const step = () => {
      if (!el) return;
      if (!isPointerDown.current) {
        el.scrollLeft += speed;
      }
      const half = el.scrollWidth / 2;
      if (el.scrollLeft >= half) {
        el.scrollLeft = el.scrollLeft - half;
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loopItems.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const down = () => (isPointerDown.current = true);
    const up = () => (isPointerDown.current = false);

    el.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const scrollBy = (px: number) =>
    scrollerRef.current?.scrollTo({
      left: (scrollerRef.current?.scrollLeft || 0) + px,
      behavior: "smooth",
    });

  const fmt = (v: number) =>
    v >= 1_000_000
      ? (v / 1_000_000).toFixed(1) + "M"
      : v >= 1_000
      ? (v / 1_000).toFixed(1) + "K"
      : String(v);

  if (loading) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-2 text-xs text-vault-primary">
          <div className="h-4 w-4 animate-spin rounded-full border border-vault-primary border-t-transparent" />
          <span>Loading Rocket Race…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* HEADER */}
      <div className="mb-2 flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-vault-primary" />
          <h2 className="text-base font-extrabold text-white tracking-tight">
            <span className="text-vault-primary">Rocket</span> Token Race
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-yellow-300" />
            <span className="font-bold text-yellow-300">
              {boosted.length} BOOSTED
            </span>
          </div>
          <span className="mx-1 h-3 w-px bg-white/10" />
          <div className="flex items-center gap-1 text-zinc-400">
            <Flame className="h-3 w-3 text-red-300" />
            <span>-{fmt(Number(config?.decayPerHour || 24))}/h</span>
          </div>
          <span className="mx-1 h-3 w-px bg-white/10" />
          <div className="flex items-center gap-1 text-zinc-400">
            <Rocket className="h-3 w-3 text-vault-primary" />
            <span>
              {parseFloat(config?.pricePerPoint || "0").toFixed(8)} BNB/pt
            </span>
          </div>
        </div>
      </div>

      {/* TRACK */}
      <div className="relative w-full">
        <div
          ref={scrollerRef}
          className="w-full overflow-x-hidden overflow-y-hidden snap-x snap-mandatory"
        >
          <div className="flex flex-nowrap items-center gap-3 px-2 py-4">
            {loopItems.map((maybeToken, i) =>
              maybeToken ? (
                <RaceCard
                  key={`${maybeToken.tokenAddress}-${i}`}
                  index={i % 10}
                  token={maybeToken}
                  onClick={() => onTokenSelect(maybeToken.tokenAddress)}
                />
              ) : (
                <PlaceholderRaceCard key={`ghost-${i}`} index={i % 10} />
              )
            )}
          </div>
        </div>

        {/* Setas */}
        <button
          onClick={() => scrollBy(-240)}
          className="flex absolute left-0 top-1/2 -translate-y-1/2 rounded-md bg-black/40 p-1 md:p-2 backdrop-blur-sm hover:bg-black/60 border border-white/10"
          aria-label="scroll left"
        >
          <ChevronLeft className="h-4 w-4 md:h-5 md:w-5 text-white" />
        </button>
        <button
          onClick={() => scrollBy(240)}
          className="flex absolute right-0 top-1/2 -translate-y-1/2 rounded-md bg-black/40 p-1 md:p-2 backdrop-blur-sm hover:bg-black/60 border border-white/10"
          aria-label="scroll right"
        >
          <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-white" />
        </button>
      </div>
    </div>
  );
};

/* ===== Tamanho fixo para todos ===== */
function sizeClasses() {
  return { wrapper: "w-44 h-36 md:w-48 md:h-40", innerH: "h-full" };
}

/* ===== Card real ===== */
const RaceCard: React.FC<{
  index: number;
  token: TokenWithScore;
  onClick: () => void;
}> = ({ index, token, onClick }) => {
  const rank = RANK_LABELS[index] ?? `${index + 1}TH`;
  const { wrapper, innerH } = sizeClasses();

  return (
    <div
      className={`group relative snap-start cursor-pointer flex-none ${wrapper}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div
    className={`relative ${innerH} rounded-lg border border-[#1e2a3a] bg-transparent shadow-md transition-transform duration-200 group-hover:-translate-y-0.5`}
      >
        {/* Rank */}
        <div className="absolute -left-1 -top-2 rounded-[4px] bg-[#ff7a00] px-2 py-0.5">
          <span className="text-[10px] font-extrabold tracking-wide text-black">
            {rank}
          </span>
        </div>
        {/* Score */}
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <Trophy className="h-3.5 w-3.5 text-yellow-300" />
          <span className="text-sm font-extrabold text-yellow-300">
            {formatCompact(token.rocketScore)}
          </span>
        </div>
        {/* Centro */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3">
          <img
            src={token.imageUrl}
            alt={token.name}
            className="h-20 w-20 md:h-24 md:w-24 rounded-full border border-[#253246] bg-black object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=100";
            }}
          />
          <span className="text-[12px] font-bold text-vault-primary leading-none truncate max-w-[120px]">
            ${token.symbol}
          </span>
        </div>
        <div className="absolute bottom-2 left-3 text-[9px] uppercase tracking-wide text-zinc-500">
        </div>
      </div>
    </div>
  );
};

/* ===== Placeholder ===== */
const PlaceholderRaceCard: React.FC<{ index: number }> = ({ index }) => {
  const rank = RANK_LABELS[index] ?? `${index + 1}TH`;
  const { wrapper, innerH } = sizeClasses();

  return (
    <div className={`group relative snap-start flex-none ${wrapper}`}>
      <div
    className={`relative ${innerH} rounded-lg border border-[#1e2a3a] bg-transparent opacity-80`}
      >
        <div className="absolute -left-1 -top-2 rounded-[4px] bg-[#cc6600] px-2 py-0.5">
          <span className="text-[10px] font-extrabold tracking-wide text-black/70">
            {rank}
          </span>
        </div>
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <Trophy className="h-3.5 w-3.5 text-yellow-700" />
          <span className="text-sm font-extrabold text-yellow-700">0</span>
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
    <div className="h-20 w-20 md:h-24 md:w-24 rounded-full border border-[#253246] bg-transparent flex items-center justify-center">
      <ImageIcon className="h-6 w-6 text-zinc-600" />
    </div>
          <span className="text-[12px] font-bold text-zinc-500 leading-none">
            —
          </span>
        </div>
      </div>
    </div>
  );
};

function formatCompact(v: number) {
  if (!v) return "0";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return String(v);
}
