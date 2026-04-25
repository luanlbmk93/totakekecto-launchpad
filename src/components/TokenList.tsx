import React, { useEffect, useMemo, useRef, useState } from "react";
import { Coins, Filter, Sparkles, RefreshCw } from "lucide-react";
import { TokenCard } from "./TokenCard";
import { TokenInfo, useContracts, getTokenListLoadDiagnostics, type TokenListLoadDiag } from "../hooks/useContracts";
import { useWeb3 } from "../hooks/useWeb3";
import { readTokenListCache, writeTokenListCache } from "../utils/tokenListCache";

interface TokenListProps {
  onTokenSelect: (tokenAddress: string) => void;
  refreshTrigger?: number;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onTokensLoaded?: (tokens: TokenInfo[]) => void;
}

type MinimalToken = Pick<
  TokenInfo,
  "tokenAddress" | "name" | "symbol" | "graduated" | "createdAt" | "firstBuyLockTier" | "paysDividends" | "isBanned"
>;

function sortTokens(list: TokenInfo[]) {
  return [...list].sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
}

function shallowEqual(a: MinimalToken, b: MinimalToken) {
  return (
    a.tokenAddress === b.tokenAddress &&
    a.name === b.name &&
    a.symbol === b.symbol &&
    a.graduated === b.graduated &&
    Number(a.createdAt) === Number(b.createdAt) &&
    a.firstBuyLockTier === b.firstBuyLockTier &&
    a.paysDividends === b.paysDividends &&
    a.isBanned === b.isBanned
  );
}

function listsEffectivelyEqual(prev: TokenInfo[], next: TokenInfo[]) {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const A: MinimalToken = {
      tokenAddress: prev[i].tokenAddress,
      name: prev[i].name,
      symbol: prev[i].symbol,
      graduated: prev[i].graduated,
      createdAt: prev[i].createdAt,
      firstBuyLockTier: prev[i].firstBuyLockTier,
      paysDividends: prev[i].paysDividends,
      isBanned: prev[i].isBanned,
    };
    const B: MinimalToken = {
      tokenAddress: next[i].tokenAddress,
      name: next[i].name,
      symbol: next[i].symbol,
      graduated: next[i].graduated,
      createdAt: next[i].createdAt,
      firstBuyLockTier: next[i].firstBuyLockTier,
      paysDividends: next[i].paysDividends,
      isBanned: next[i].isBanned,
    };
    if (!shallowEqual(A, B)) return false;
  }
  return true;
}

const initialFromCache = readTokenListCache();

type TokenCategory =
  | "all"
  | "new"
  | "cto"
  | "dividends"
  | "almost"
  | "graduated"
  | "banned";

const CATEGORY_OPTIONS: { value: TokenCategory; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New (24h)" },
  { value: "cto", label: "CTO" },
  { value: "dividends", label: "Dividends" },
  { value: "almost", label: "Almost Graduated" },
  { value: "graduated", label: "Graduated" },
  { value: "banned", label: "Banned" },
];

const ONE_DAY_SECONDS = 24 * 60 * 60;

function isCtoToken(t: TokenInfo) {
  return (Number(t.firstBuyLockTier) || 0) > 0;
}

function isAlmostGraduated(t: TokenInfo) {
  if (t.graduated) return false;
  const current = parseFloat(t.realETH);
  const target = parseFloat(t.graduationTargetEth ?? "13");
  const t0 = Number.isFinite(target) && target > 0 ? target : 13;
  if (!Number.isFinite(current)) return false;
  return current / t0 >= 0.5;
}

function isNewToken(t: TokenInfo) {
  const createdAt = Number(t.createdAt) || 0;
  if (!createdAt) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  return nowSec - createdAt <= ONE_DAY_SECONDS;
}

export const TokenList: React.FC<TokenListProps> = ({ onTokenSelect, refreshTrigger, searchTerm, onSearchChange, onTokensLoaded }) => {
  const [tokens, setTokens] = useState<TokenInfo[]>(() => initialFromCache ?? []);
  const [loading, setLoading] = useState(() => (initialFromCache?.length ?? 0) === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterCategory, setFilterCategory] = useState<TokenCategory>("all");
  const [loadDiag, setLoadDiag] = useState<TokenListLoadDiag | null>(null);

  const { getAllTokens } = useContracts();
  const { isConnected } = useWeb3();

  // Mantém a lista estável e só troca se realmente houver mudança
  const applyTokens = (incoming: TokenInfo[]) => {
    const next = sortTokens(incoming);
    if (next.length > 0) writeTokenListCache(next);
    setTokens((prev) => {
      const prevSorted = sortTokens(prev);
      const result = listsEffectivelyEqual(prevSorted, next) ? prev : next;
      
      // Notify parent component about tokens
      if (onTokensLoaded) {
        onTokensLoaded(result);
      }
      
      return result;
    });
  };

  const loadTokens = async (opts?: { background?: boolean }) => {
    const asBg = !!opts?.background;

    if (!asBg) setLoading(true);
    else setIsRefreshing(true);

    try {
      const all = await getAllTokens();
      applyTokens(all);
      setLoadDiag(getTokenListLoadDiagnostics());
    } finally {
      if (!asBg) setLoading(false);
      else setIsRefreshing(false);
    }
  };

  // Carrega na Home mesmo sem wallet conectada + revalida quando a aba volta ao foco
  useEffect(() => {
    // Primeira carga
    loadTokens({ background: false });

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Revalida em background quando o usuário volta para a aba
        loadTokens({ background: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // Atualiza também quando o usuário conectar/desconectar (para refletir estados),
    // e quando alguém cria token (refreshTrigger).
  }, [isConnected, refreshTrigger]); // intencional

  // Opcional: polling leve (desativado por padrão). Ative se quiser.
  const pollingRef = useRef<number | null>(null);
  useEffect(() => {
    // Defina um intervalo gentil (ex.: 60s) — ou deixe 0 para desativar.
    const POLL_MS = 0; // coloque 60000 para 1 min, 0 para desligado
    if (POLL_MS <= 0) return;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      loadTokens({ background: true });
    };
    pollingRef.current = window.setInterval(tick, POLL_MS);
    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current);
    };
  }, []); // polling não depende da conexão

  const categoryCounts = useMemo(() => {
    const counts: Record<TokenCategory, number> = {
      all: 0,
      new: 0,
      cto: 0,
      dividends: 0,
      almost: 0,
      graduated: 0,
      banned: 0,
    };
    for (const t of tokens) {
      if (t.isBanned) {
        counts.banned += 1;
        continue;
      }
      counts.all += 1;
      if (isNewToken(t)) counts.new += 1;
      if (isCtoToken(t)) counts.cto += 1;
      if (t.paysDividends) counts.dividends += 1;
      if (isAlmostGraduated(t)) counts.almost += 1;
      if (t.graduated) counts.graduated += 1;
    }
    return counts;
  }, [tokens]);

  const filteredTokens = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return tokens.filter((t) => {
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      // Banned tokens are isolated: they only show in the "banned" tab
      // and never appear under any other category.
      if (filterCategory === "banned") return !!t.isBanned;
      if (t.isBanned) return false;

      switch (filterCategory) {
        case "new":
          return isNewToken(t);
        case "cto":
          return isCtoToken(t);
        case "dividends":
          return !!t.paysDividends;
        case "almost":
          return isAlmostGraduated(t);
        case "graduated":
          return !!t.graduated;
        case "all":
        default:
          return true;
      }
    });
  }, [tokens, searchTerm, filterCategory]);

  const diagStyles =
    loadDiag?.severity === "error"
      ? "border-danger-red/40 bg-danger-red/10 text-danger-red"
      : loadDiag?.severity === "warn"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
        : "border-[#2A3442] bg-[#0B0F14] text-[#D1D5DB]";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#1F2937] bg-[#11161D] p-4 md:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-2.5">
            <Coins className="h-5 w-5 text-vault-primary" />
          </div>
          <h2 className="text-lg font-semibold text-white md:text-xl">Tokens</h2>
          <div className="flex items-center gap-1.5 rounded-full border border-[#2A3442] bg-[#0B0F14] px-2.5 py-1">
            <Sparkles className="h-3 w-3 text-vault-primary" />
            <span className="text-xs font-semibold text-vault-primary">{categoryCounts.all}</span>
          </div>
          <button
            type="button"
            onClick={() => loadTokens({ background: true })}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[#2A3442] bg-[#0B0F14] px-3 py-2 text-sm text-white hover:border-vault-primary hover:text-vault-primary"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "…" : "Refresh"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-vault-primary" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as TokenCategory)}
            className="rounded-lg border border-[#2A3442] bg-[#0B0F14] px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-vault-primary"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({categoryCounts[opt.value]})
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORY_OPTIONS.map((opt) => {
              const active = filterCategory === opt.value;
              const count = categoryCounts[opt.value];
              const isBannedOpt = opt.value === "banned";
              const baseClasses =
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors";
              const activeClasses = isBannedOpt
                ? "border-red-500/60 bg-red-500/15 text-red-200"
                : "border-vault-primary/60 bg-vault-primary/15 text-vault-primary";
              const idleClasses = isBannedOpt
                ? "border-red-500/25 bg-[#0B0F14] text-red-300/80 hover:border-red-500/50 hover:text-red-200"
                : "border-[#2A3442] bg-[#0B0F14] text-[#9CA3AF] hover:border-vault-primary/40 hover:text-white";
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFilterCategory(opt.value)}
                  className={`${baseClasses} ${active ? activeClasses : idleClasses}`}
                >
                  <span>{opt.label}</span>
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      active
                        ? isBannedOpt
                          ? "bg-red-500/25 text-red-100"
                          : "bg-vault-primary/25 text-white"
                        : "bg-[#11161D] text-[#9CA3AF]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-[#1F2937] bg-[#11161D] p-2.5 animate-pulse">
              <div className="h-20 w-20 shrink-0 rounded-xl bg-zinc-800" />
              <div className="flex-1 space-y-2 py-0.5">
                <div className="h-4 w-2/3 rounded bg-zinc-800" />
                <div className="h-3 w-1/3 rounded bg-zinc-800/70" />
                <div className="h-3 w-full rounded bg-zinc-800/50" />
                <div className="h-1 w-full rounded bg-zinc-800/50" />
              </div>
            </div>
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <div className="text-center py-12">
          <div className="bg-[#11161D] rounded-full p-6 w-20 h-20 mx-auto mb-6 border border-[#2A3442]">
            <Coins className="h-8 w-8 text-vault-primary" />
          </div>
          <p className="text-white text-lg font-semibold mb-2">No tokens found</p>
          <p className="text-[#9CA3AF] mb-4">Be the first to create a token!</p>
          {loadDiag ? (
            <div className={`mx-auto max-w-2xl rounded-xl border px-4 py-3 text-left text-sm ${diagStyles}`}>
              <div className="font-semibold">{loadDiag.headline}</div>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-xs leading-relaxed opacity-95">
                {loadDiag.details.map((d, idx) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : filteredTokens.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredTokens.map((token) => (
            <TokenCard
              key={token.tokenAddress}
              token={token}
              onRefresh={() => loadTokens({ background: true })}
              onTokenSelect={onTokenSelect}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="bg-[#11161D] rounded-full p-6 w-20 h-20 mx-auto mb-6 border border-[#2A3442]">
            <Coins className="h-8 w-8 text-vault-primary" />
          </div>
          <p className="text-white text-lg font-semibold mb-2">No tokens found</p>
          <p className="text-[#9CA3AF]">
            {searchTerm
              ? "Try a different search term"
              : filterCategory === "banned"
                ? "No banned tokens."
                : `No tokens in "${CATEGORY_OPTIONS.find((o) => o.value === filterCategory)?.label}" yet.`}
          </p>
        </div>
      )}
    </div>
  );
};
