/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Clock,
  RefreshCw,
  Globe,
  MessageCircle,
  Twitter,
  MessageSquare,
  Activity,
  Users,
  Rocket,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Calculator,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import { TokenInfo, useContracts } from "../hooks/useContracts";
import { useWeb3 } from "../hooks/useWeb3";
import { PriceChart } from "./PriceChart";
import { useFactoryEvents } from "../hooks/useFactoryEvents";
import { RocketBoostModal } from "./RocketBoostModal";
import { useRocketBoost } from "../hooks/useRocketBoost";
import toast from "react-hot-toast";
import ConnectButton from "./ConnectButton";
import { CONTRACT_ADDRESSES } from "../contracts/contractAddresses";
import { ethers } from "ethers";
import { getBscReadRpcUrl } from "../config/bscReadRpc";

const PLATFORM_LOCK_ADDRESS_LC = (CONTRACT_ADDRESSES.PLATFORM_TOKEN_LOCK ?? "").trim().toLowerCase();

/** ------------------------------------------------
 * TokenDetail (dark + flat + neon) — Buy/Sell inline
 * ------------------------------------------------ */

interface TokenDetailProps {
  tokenAddress: string;
  onBack: () => void;
}

type TabKey = "chart" | "trades" | "holders";

export const TokenDetail: React.FC<TokenDetailProps> = ({ tokenAddress, onBack }) => {
  // ---------- state ----------
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // removido TradingModal: agora é inline
  const [showRocketBoost, setShowRocketBoost] = useState(false);

  const [tokenBalance, setTokenBalance] = useState("0");
  const [firstBuyStatus, setFirstBuyStatus] = useState<{
    tier: number;
    unlockTime: string;
    lockedAmount: string;
    hasLockCommitment: boolean;
    canClaim: boolean;
  } | null>(null);
  const [rocketScore, setRocketScore] = useState(0);

  const [activeTab, setActiveTab] = useState<TabKey>("chart");
  const [loadingHolders, setLoadingHolders] = useState(false);
  const [holders, setHolders] = useState<Array<{ address: string; balance: string; percentage: number }>>([]);

  const [realTimeStats, setRealTimeStats] = useState<{ currentPrice: string; marketCap: string; realETH: string } | null>(null);

  // ---------- trade state (INLINE) ----------
  const [tradeTab, setTradeTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [estimatedOutput, setEstimatedOutput] = useState("0");
  const [balance, setBalance] = useState("0");
  const tradeBoxRef = useRef<HTMLDivElement | null>(null);

  // ---------- deps ----------
  const {
    getAllTokens,
    getTokenBalance,
    claimFirstBuyTokens,
    getCreatorFirstBuyStatus,
    buyToken,
    sellToken,
    getBuyAmount,
    getSellAmount,
    getEthBalance,
    loading,
  } = useContracts();
  const { account, provider } = useWeb3();
  const { chartData, loading: factoryEventsLoading, eventsError: factoryEventsError } =
    useFactoryEvents(tokenAddress, provider);
  const { getRocketScore } = useRocketBoost();

  // ---------- refs ----------
  const refreshingRef = useRef(false);

  // ---------- helpers ----------
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied!");
  };

  const formatNumber = (num: string) => {
    const n = parseFloat(num);
    if (Number.isNaN(n)) return "0";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(2) + "K";
    return n.toFixed(6);
  };

  const formatETH = (num: string) => {
    const n = parseFloat(num);
    return Number.isNaN(n) ? "0.000000" : n.toFixed(6);
  };

  /** On-chain `bondingCurves(token).targetETH` (factory `GRADUATION_TARGET`), not a UI guess */
  const graduationTargetBnB = useMemo(() => {
    const raw = token?.graduationTargetEth;
    const n = raw != null ? parseFloat(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
    return 13;
  }, [token?.graduationTargetEth]);

  const progressPct = useMemo(() => {
    if (!token) return 0;
    if (token.graduated) return 100;
    const current = parseFloat(realTimeStats?.realETH ?? token.realETH ?? "0");
    if (!Number.isFinite(current) || current <= 0) return 0;
    return Math.min((current / graduationTargetBnB) * 100, 100);
  }, [token, realTimeStats, graduationTargetBnB]);

  const currentPrice = useMemo(
    () => parseFloat(realTimeStats?.currentPrice || token?.currentPrice || "0"),
    [realTimeStats?.currentPrice, token?.currentPrice]
  );

  const isCreator = useMemo(
    () => (account && token?.creator ? account.toLowerCase() === token.creator.toLowerCase() : false),
    [account, token?.creator]
  );

  const firstBuyLockTierNum = Number((token as any)?.firstBuyLockTier ?? 0);
  const showCtoSeal = firstBuyLockTierNum > 0;

  const getFirstBuyLockRemaining = () => {
    const raw = (token as any)?.firstBuyUnlockTime ?? firstBuyStatus?.unlockTime;
    if (!raw || firstBuyLockTierNum <= 0) return null;
    const end = parseInt(String(raw), 10);
    if (!Number.isFinite(end) || end <= 0) return null;
    const now = Math.floor(Date.now() / 1000);
    const left = end - now;
    if (left <= 0) return null;
    const days = Math.floor(left / 86400);
    const hours = Math.floor((left % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((left % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // ===== cálculos para o progresso =====
  const safeNum = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const raisedEth = useMemo(
    () => safeNum(realTimeStats?.realETH ?? token?.realETH ?? 0),
    [realTimeStats?.realETH, token?.realETH]
  );
  const remainingEth = useMemo(
    () => Math.max(0, graduationTargetBnB - raisedEth),
    [graduationTargetBnB, raisedEth]
  );

  // On-chain in this build: creator allocation is 0 (all 1B supply is on the curve).
  const CREATOR_ALLOCATION = 0;
  const tokensAvailableForSale = useMemo(() => {
    if (!token) return null;
    const totalSupplyNum = safeNum(token.totalSupply);
    const curveSupply = Math.max(0, totalSupplyNum - CREATOR_ALLOCATION);

    if (chartData?.trades?.length) {
      const buysTokens = chartData.trades
        .filter((t: any) => t.side === "buy")
        .reduce((acc: number, t: any) => acc + safeNum(t.tokenAmount), 0);
      const sellsTokens = chartData.trades
        .filter((t: any) => t.side === "sell")
        .reduce((acc: number, t: any) => acc + safeNum(t.tokenAmount), 0);
      const netSoldToUsers = Math.max(0, buysTokens - sellsTokens);
      return Math.max(0, curveSupply - netSoldToUsers);
    }
    return null;
  }, [token, chartData]);

  // ---------- load data ----------
  const loadTokenData = async (bg = false) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (bg) setIsRefreshing(true);

    try {
      const tokens = await getAllTokens();
      const found = tokens.find((t) => t.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()) || null;
      if (found) {
        setToken(found);
        setRealTimeStats({
          currentPrice: found.currentPrice,
          marketCap: found.marketCap,
          realETH: found.realETH,
        });

        if (account) {
          void getTokenBalance(found.tokenAddress, account).then(setTokenBalance).catch(() => {});
        } else {
          setTokenBalance("0");
        }
        void getCreatorFirstBuyStatus(found.tokenAddress).then(setFirstBuyStatus).catch(() => {});
        void getRocketScore(found.tokenAddress).then(setRocketScore).catch(() => {});
      }
    } finally {
      refreshingRef.current = false;
      if (bg) setIsRefreshing(false);
    }
  };

  // ---------- effects ----------
  /** Initial load: chain reads only, no wallet. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setInitialLoading(true);
      try {
        await loadTokenData(false);
      } catch (e) {
        console.error("[TokenDetail] loadTokenData", e);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);

  /** On wallet connect/disconnect: refresh balances only. */
  useEffect(() => {
    if (!token) return;
    if (account) {
      void getTokenBalance(token.tokenAddress, account).then(setTokenBalance).catch(() => setTokenBalance("0"));
    } else {
      setTokenBalance("0");
    }
  }, [account, token?.tokenAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void loadTokenData(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const loadHolders = async () => {
    if (!token) return;
    setLoadingHolders(true);
    try {
      if (chartData && chartData.trades.length > 0) {
        const tradesByUser: Record<string, { buys: number; sells: number }> = {};
        chartData.trades.forEach((t) => {
          tradesByUser[t.user] ??= { buys: 0, sells: 0 };
          if (t.side === "buy") tradesByUser[t.user].buys += t.tokenAmount;
          else tradesByUser[t.user].sells += t.tokenAmount;
        });

        // NOTE: trade-based "holders" is only an approximation and breaks if people transfer tokens.
        // We use trades to get candidate addresses, but percentages must be based on TOTAL SUPPLY (1B),
        // and balances should come from the token contract (authoritative).

        const candidates = Object.entries(tradesByUser)
          .map(([address, ts]) => {
            const bal = ts.buys - ts.sells;
            return { address, est: Math.max(0, bal) };
          })
          .filter((h) => h.est > 0)
          .sort((a, b) => b.est - a.est)
          .slice(0, 50);

        const readProvider =
          provider ?? new ethers.JsonRpcProvider(getBscReadRpcUrl());
        const tokenReader = new ethers.Contract(
          token.tokenAddress,
          [
            "function balanceOf(address) view returns (uint256)",
            "function totalSupply() view returns (uint256)",
          ],
          readProvider,
        );

        // Prefer on-chain totalSupply; fallback to tokenInfo.totalSupply (already formatted).
        let totalSupplyWei = 0n;
        try {
          totalSupplyWei = (await tokenReader.totalSupply()) as bigint;
        } catch {
          // token.totalSupply is a decimal string like "1000000000.0"
          const n = safeNum(token.totalSupply);
          totalSupplyWei = n > 0 ? ethers.parseEther(String(n)) : 0n;
        }
        const totalSupplyNum = totalSupplyWei > 0n ? parseFloat(ethers.formatEther(totalSupplyWei)) : 0;

        const rows = await Promise.all(
          candidates.map(async (c) => {
            try {
              const balWei = (await tokenReader.balanceOf(c.address)) as bigint;
              const balNum = parseFloat(ethers.formatEther(balWei));
              return {
                address: c.address,
                balance: balNum.toString(),
                percentage: totalSupplyNum > 0 ? (balNum / totalSupplyNum) * 100 : 0,
              };
            } catch {
              return null;
            }
          }),
        );

        const finalList = rows
          .filter(Boolean)
          .filter((h: any) => safeNum(h.balance) > 0)
          .sort((a: any, b: any) => safeNum(b.balance) - safeNum(a.balance))
          .slice(0, 20);

        setHolders(finalList as Array<{ address: string; balance: string; percentage: number }>);
      } else {
        setHolders([]);
      }
    } finally {
      setLoadingHolders(false);
    }
  };

  useEffect(() => {
    if (activeTab === "holders" && token) void loadHolders();
  }, [activeTab, token, chartData]);

  // ---------- trade (inline) effects ----------
  // Atualiza o saldo ao trocar aba buy/sell
  useEffect(() => {
    const fetchBalance = async () => {
      if (!account || !token) return;
      try {
        if (tradeTab === "buy") {
          const ethBal = await getEthBalance(account);
          setBalance(ethBal);
        } else {
          const tokenBal = await getTokenBalance(token.tokenAddress, account);
          setBalance(tokenBal);
        }
      } catch {
        setBalance("0");
      }
    };
    fetchBalance();
  }, [tradeTab, account, token, getEthBalance, getTokenBalance]);

  // Estimativa debounced
  useEffect(() => {
    const calc = async () => {
      if (!amount || parseFloat(amount) <= 0 || !token) {
        setEstimatedOutput("0");
        return;
      }
      try {
        if (tradeTab === "buy") {
          const est = await getBuyAmount(token.tokenAddress, amount);
          setEstimatedOutput(est);
        } else {
          const est = await getSellAmount(token.tokenAddress, amount);
          setEstimatedOutput(est);
        }
      } catch {
        setEstimatedOutput("0");
      }
    };
    const t = setTimeout(calc, 300);
    return () => clearTimeout(t);
  }, [amount, tradeTab, token, getBuyAmount, getSellAmount]);

  const isBanned = token?.isBanned === true;

  const handlePercentage = (percent: number) => {
    const bal = parseFloat(balance);
    if (isNaN(bal) || bal <= 0) return;
    const value = (bal * percent).toFixed(6);
    setAmount(value);
  };

  const handleTrade = async () => {
    if (!amount || parseFloat(amount) <= 0 || !token) return;
    let ok = false;
    if (tradeTab === "buy") {
      ok = await buyToken(token.tokenAddress, amount);
    } else {
      ok = await sellToken(token.tokenAddress, amount);
    }
    if (ok) {
      setAmount("");
      setEstimatedOutput("0");
      void loadTokenData(true);
      toast.success(tradeTab === "buy" ? "Buy executed" : "Sell executed");
    }
  };

  const focusTrade = (tab: "buy" | "sell") => {
    setTradeTab(tab);
    requestAnimationFrame(() => {
      if (tradeBoxRef.current) {
        tradeBoxRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  };

  // ---------- loading / empty ----------
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#0B0F14]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
          <div className="flex items-center justify-center min-h-[320px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-vault-primary" />
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0B0F14]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
          <div className="py-12">
            <div className="flex flex-col items-center justify-center gap-6">
              <div className="relative">
                <div
                  className="h-14 w-14 rounded-full border-2 border-vault-primary/30 border-t-vault-primary animate-spin"
                  aria-hidden
                />
                <span className="sr-only">Loading token data…</span>
              </div>
              <p className="text-lg text-zinc-400">Loading data on-chain…</p>
              <div className="w-full max-w-3xl space-y-4 animate-pulse">
                <div className="h-10 rounded-xl bg-zinc-900/70 border border-white/5" />
                <div className="h-24 rounded-xl bg-zinc-900/70 border border-white/5" />
                <div className="h-80 rounded-xl bg-zinc-900/70 border border-white/5" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- main ----------
  return (
    <>
      <div className="pointer-events-auto w-full max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="relative overflow-hidden rounded-3xl border border-[#1F2937] bg-gradient-to-br from-[#11161D] via-[#0F141B] to-[#0B0F14] p-4 md:p-5">
            <div className="pointer-events-none absolute -top-12 -right-10 h-32 w-32 rounded-full bg-vault-primary/10 blur-2xl" />
            <button
              onClick={onBack}
              className="absolute top-4 left-4 p-2 rounded-xl hover:bg-white/5 transition-colors shrink-0"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
            <div className="ml-12 md:ml-14 flex items-start gap-4">
              <img
                src={token.imageUrl}
                alt={token.name}
                className="w-16 h-16 md:w-20 md:h-20 rounded-2xl border border-[#1F2937] object-cover shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=100";
                }}
              />
              <div className="min-w-0 w-full flex-1">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4 w-full">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight truncate">
                      {token.name} <span className="text-zinc-400">({token.symbol})</span>
                    </h1>
                    <p className="text-zinc-400 text-sm mt-1">Token details, trading and analytics in one view</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 md:ml-4">
                    <button
                      onClick={() => loadTokenData(true)}
                      className="p-2 rounded-xl border border-[#1F2937] bg-[#0B0F14]/80 hover:bg-[#0B0F14] transition-colors"
                      aria-label="Refresh"
                    >
                      <RefreshCw className={`h-4 w-4 text-vault-primary ${isRefreshing ? "animate-spin" : ""}`} />
                    </button>
                  <button
                    onClick={() => setShowRocketBoost(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-sm font-semibold transition-all bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                  >
                    <Rocket className="h-4 w-4" />
                    <span>Boost</span>
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400 w-full">
                <span className="font-mono truncate max-w-[160px] sm:max-w-[220px] text-white/90">
                  {token.tokenAddress.slice(0, 8)}...{token.tokenAddress.slice(-6)}
                </span>
                <button
                  onClick={() => copyToClipboard(token.tokenAddress)}
                  className="p-1 rounded hover:bg-white/5 flex-none"
                  aria-label="Copy contract"
                >
                  <Copy className="h-3.5 w-3.5 text-vault-primary" />
                </button>
                <a
                  href={`https://bscscan.com/address/${token.tokenAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-white/5 flex-none"
                  aria-label="Open in BSCscan"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-vault-primary" />
                </a>

                <div className="flex items-center gap-2 ml-auto">
                  {rocketScore > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] border border-amber-400/60 text-amber-300 bg-[#0B0F14]">
                      <span className="inline-flex items-center gap-1">
                        <Rocket className="h-3 w-3" />
                        {rocketScore >= 1_000_000
                          ? (rocketScore / 1_000_000).toFixed(1) + "M"
                          : rocketScore >= 1_000
                          ? (rocketScore / 1_000).toFixed(1) + "K"
                          : rocketScore}
                      </span>
                    </span>
                  )}
                  {token.isBanned && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] border border-red-400/60 text-red-300 bg-[#0B0F14]">
                      BANNED
                    </span>
                  )}
                  {token.graduated && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] border border-emerald-400/60 text-emerald-300 bg-[#0B0F14]">
                      GRADUATED
                    </span>
                  )}
                  {showCtoSeal && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-[#A855F7]/80 text-[#A855F7] bg-[#A855F7]/10">
                      <ShieldCheck className="h-3 w-3" />
                      CTO
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* Métricas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric
              label="BNB in curve"
              value={`${formatETH((realTimeStats?.realETH ?? token.realETH) || "0")} BNB`}
              Icon={Activity}
              title="BNB locked in the bonding curve (counts toward graduation)."
            />
            <Metric
              label="Graduation target"
              value={`${formatETH(graduationTargetBnB.toString())} BNB`}
              Icon={BarChart3}
              title="BNB needed in the curve before the token moves to DEX."
            />
            <Metric label="Progress" value={`${progressPct.toFixed(1)}%`} Icon={Rocket} />
            <Metric
              label="Created"
              value={new Date(parseInt(token.createdAt) * 1000).toLocaleDateString()}
              Icon={Clock}
            />
          </div>

          {/* Tabs: Chart / Trades / Holders */}
          <div className="rounded-3xl border border-[#1F2937] bg-[#11161D] overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
            <div className="flex border-b border-[#1F2937]">
              {(["chart", "trades", "holders"] as TabKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setActiveTab(k)}
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                    activeTab === k ? "bg-vault-primary text-[#0B0F14]" : "text-zinc-400 hover:text-white hover:bg-[#0D1219]"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {k === "chart" && <BarChart3 className="h-4 w-4" />}
                    {k === "trades" && <Activity className="h-4 w-4" />}
                    {k === "holders" && <Users className="h-4 w-4" />}
                    {k[0].toUpperCase() + k.slice(1)}
                  </span>
                </button>
              ))}
            </div>

            <div className="p-4 md:p-5">
              {activeTab === "chart" && (
                <div className="rounded-xl border border-[#1F2937] bg-[#0B0F14] p-2">
                  <PriceChart
                    tokenAddress={token.tokenAddress}
                    tokenSymbol={token.symbol}
                    readProvider={provider}
                    isGraduated={token.graduated}
                    dexPair={token.dexPair}
                    onStatsUpdate={setRealTimeStats}
                  />
                </div>
              )}

              {activeTab === "trades" && (
                <>
                  {factoryEventsLoading ? (
                    <div className="text-center py-10">
                      <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-vault-primary border-t-transparent" />
                      <p className="text-zinc-400">Loading trades…</p>
                    </div>
                  ) : chartData && chartData.trades.length > 0 ? (
                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                      {chartData.trades
                        .slice(-20)
                        .reverse()
                        .map((trade, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-3 rounded-lg border border-[#1F2937] bg-[#0B0F14]"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-3 h-3 rounded-full ${
                                  trade.side === "buy" ? "bg-emerald-400" : "bg-[#ff4d4f]"
                                }`}
                              />
                              <div>
                                <div
                                  className={`font-semibold text-sm ${
                                    trade.side === "buy" ? "text-emerald-400" : "text-[#ff4d4f]"
                                  }`}
                                >
                                  {trade.side.toUpperCase()}
                                </div>
                                <div className="text-xs text-zinc-400 font-mono">
                                  {trade.user.slice(0, 6)}...{trade.user.slice(-4)}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-white font-semibold text-sm">
                                {formatETH(trade.amountETH.toString())} BNB
                              </div>
                              <div className="text-xs text-zinc-400">
                                {formatNumber(trade.tokenAmount.toString())} {token.symbol}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-white text-sm">{formatETH(trade.price.toString())} BNB</div>
                              <div className="text-xs text-zinc-400">
                                {new Date(trade.timestamp * 1000).toLocaleTimeString("en-US", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="px-2 py-10 text-center">
                      <Activity className="mx-auto mb-3 h-8 w-8 text-zinc-500" />
                      {factoryEventsError ? (
                        <>
                          <p className="text-red-400 text-sm font-medium">Couldn't load trade history</p>
                          <p className="mt-2 text-xs leading-relaxed text-zinc-500 max-w-md mx-auto break-words font-mono">
                            {factoryEventsError}
                          </p>
                          <p className="mt-4 text-xs text-zinc-500 max-w-md mx-auto">
                            Fix: add <code className="text-zinc-400">VITE_ETHERSCAN_API_KEY</code> (Etherscan API V2 — works for BSC) or set{' '}
                            <code className="text-zinc-400">VITE_BSC_RPC_URL</code> to a dedicated BSC endpoint.
                          </p>
                        </>
                      ) : (
                        <p className="text-zinc-300">No trades yet</p>
                      )}
                    </div>
                  )}
                </>
              )}

              {activeTab === "holders" && (
                <>
                  {loadingHolders ? (
                    <div className="text-center py-10">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-vault-primary mx-auto mb-3" />
                      <p className="text-zinc-400">Loading holders...</p>
                    </div>
                  ) : holders.length > 0 ? (
                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                      {holders.map((h, i) => {
                        const isPlatformLockVault =
                          PLATFORM_LOCK_ADDRESS_LC.length > 0 &&
                          h.address.toLowerCase() === PLATFORM_LOCK_ADDRESS_LC;
                        return (
                        <div
                          key={h.address}
                          className="flex items-center justify-between p-3 rounded-lg border border-[#1F2937] bg-[#0B0F14]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-vault-primary rounded-full flex items-center justify-center text-[#0B0F14] font-bold text-sm">
                              #{i + 1}
                            </div>
                            <div>
                              <div className={`text-sm ${isPlatformLockVault ? "text-vault-primary font-semibold tracking-tight" : "text-white font-mono"}`}>
                                {isPlatformLockVault
                                  ? "TotaVault: TotaLocked"
                                  : `${h.address.slice(0, 6)}...${h.address.slice(-4)}`}
                              </div>
                              <div className="text-xs text-zinc-400">{h.percentage.toFixed(2)}% of supply</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-white font-semibold text-sm">
                              {formatNumber(h.balance)} {token.symbol}
                            </div>
                            <div className="text-xs text-zinc-400">
                              ~{formatETH((parseFloat(h.balance) * currentPrice).toString())} BNB
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10">
                      <Users className="h-8 w-8 text-zinc-500 mx-auto mb-3" />
                      <p className="text-zinc-400">No holders data available</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* GRID: Trade (inline) + Progress */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 w-full">
            <div className="space-y-6 xl:col-span-7">
              {/* TRADE INLINE */}
              <div ref={tradeBoxRef} className="w-full rounded-3xl border border-[#1F2937] bg-[#11161D] p-5 shadow-[0_14px_40px_rgba(0,0,0,0.28)]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold text-lg">Trade {token.symbol}</h3>
                  {account && (
                    <span className="text-xs text-zinc-400">
                      Balance: <span className="text-white">{formatNumber(tokenBalance)} {token.symbol}</span>
                    </span>
                  )}
                </div>

                {!account && (
                  <div className="mb-4 flex flex-col gap-3 rounded-xl border border-vault-primary/25 bg-[#0B0F14] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-zinc-300">
                      Charts and stats are public. <span className="font-medium text-vault-primary">Connect a wallet</span> to buy or sell.
                    </p>
                    <ConnectButton />
                  </div>
                )}

                {/* tabs buy/sell */}
                <div className="flex bg-[#0B0F14] rounded-xl p-1 mb-4 border border-[#1F2937]">
                  <button
                    onClick={() => setTradeTab("buy")}
                    disabled={!account || isBanned}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      tradeTab === "buy"
                        ? "bg-green-600 text-white"
                        : isBanned
                        ? "text-gray-500 cursor-not-allowed"
                        : "text-gray-300 hover:text-white hover:bg-[#1F2937]"
                    }`}
                  >
                    <TrendingUp className="h-4 w-4" />
                    <span>Buy</span>
                  </button>
                  <button
                    onClick={() => setTradeTab("sell")}
                    disabled={!account}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg transition-colors ${
                      tradeTab === "sell" ? "bg-red-600 text-white" : "text-gray-300 hover:text-white hover:bg-[#1F2937]"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <TrendingDown className="h-4 w-4" />
                    <span>Sell</span>
                  </button>
                </div>

                {/* aviso banned */}
                {isBanned && tradeTab === "buy" && (
                  <div className="mb-4 p-4 bg-red-900/20 border border-red-500/70 rounded-xl">
                    <p className="text-red-400 text-center">⚠️ Token banned — only sales allowed</p>
                  </div>
                )}

                {/* input + saldo */}
                <div className="space-y-4">
                  <div>
                    <label className="block font-semibold text-gray-300 mb-2">
                      {tradeTab === "buy" ? "BNB Amount" : `${token.symbol} Amount`}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.000001"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={!account || (isBanned && tradeTab === "buy")}
                        className="w-full px-4 py-3 bg-[#0B0F14] border border-[#1F2937] rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-vault-primary focus:border-vault-primary"
                        placeholder={tradeTab === "buy" ? "0.1" : "1000"}
                      />
                      <div className="absolute right-3 -top-7 flex items-center space-x-2 text-gray-400 text-xs">
                        <Wallet className="h-4 w-4" />
                        <span>
                          Balance: {formatNumber(balance)} {tradeTab === "buy" ? "BNB" : token.symbol}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between mt-2 space-x-2">
                      {[0.25, 0.5, 0.75, 1].map((p, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handlePercentage(p)}
                          disabled={!account}
                        className="flex-1 px-2 py-1 bg-[#1F2937] hover:bg-[#2C3A4B] text-gray-300 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {p === 1 ? "Max" : `${p * 100}%`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* estimate */}
                  {amount && parseFloat(amount) > 0 && (
                    <div className="bg-[#0B0F14] rounded-xl p-4 border border-[#1F2937]">
                      <div className="flex items-center gap-2 mb-3">
                        <Calculator className="h-5 w-5 text-vault-primary" />
                        <span className="text-gray-300">Estimated Output</span>
                      </div>
                      <p className="text-vault-primary font-bold text-xl">
                        {formatNumber(estimatedOutput)} {tradeTab === "buy" ? token.symbol : "BNB"}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleTrade}
                    disabled={!account || loading || !amount || parseFloat(amount) <= 0 || (isBanned && tradeTab === "buy")}
                    className={`w-full px-6 py-3 font-semibold rounded-xl transition-all disabled:cursor-not-allowed ${
                      tradeTab === "buy"
                        ? isBanned
                          ? "bg-zinc-700 cursor-not-allowed text-gray-400"
                          : "bg-green-600 hover:bg-green-700 disabled:bg-zinc-600 text-white hover:shadow-[0_0_15px_#00ff0040]"
                        : "bg-red-600 hover:bg-red-700 disabled:bg-zinc-600 text-white hover:shadow-[0_0_15px_#ff004040]"
                    }`}
                  >
                    {loading ? (tradeTab === "buy" ? "Buying..." : "Selling...") : tradeTab === "buy" ? (isBanned ? "Token Banned" : "Buy Tokens") : "Sell Tokens"}
                  </button>
                </div>
              </div>

              {/* PROGRESS */}
              <div className="rounded-3xl border border-[#1F2937] bg-[#11161D] p-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-semibold">Bonding Curve Progress</h3>
                  <span className="text-vault-primary font-semibold">
                    {token.graduated ? "100.0" : progressPct.toFixed(1)}%
                  </span>
                </div>

                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-2 bg-vault-primary shadow-vault-glow-sm"
                    style={{ width: token.graduated ? "100%" : `${progressPct}%` }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                  <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] px-2 py-1.5">
                    <div className="text-[#9CA3AF]">Current (realETH)</div>
                    <div className="text-vault-primary font-semibold mt-0.5">
                      {formatETH((realTimeStats?.realETH ?? token.realETH) || "0")} BNB
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#1F2937] bg-[#0B0F14] px-2 py-1.5">
                    <div className="text-[#9CA3AF]">Graduation target</div>
                    <div className="text-zinc-200 font-semibold mt-0.5">{formatETH(String(graduationTargetBnB))} BNB</div>
                  </div>
                </div>

                {!token.graduated && (
                  <p className="text-xs text-zinc-400 text-center mt-2 leading-relaxed">
                    Graduation when <span className="text-white font-medium">realETH</span> reaches{" "}
                    <span className="text-vault-primary font-medium">{formatETH(String(graduationTargetBnB))} BNB</span>
                    {tokensAvailableForSale != null ? (
                      <>
                        {" "}
                        · Tokens left on curve:{" "}
                        <span className="text-white font-medium">
                          {formatNumber(tokensAvailableForSale.toString())} {token.symbol}
                        </span>
                      </>
                    ) : null}
                  </p>
                )}

                {token.graduated ? (
                  <p className="text-sm text-emerald-400 text-center font-semibold mt-2">
                    Graduated — trading on PancakeSwap (LP minted at graduation).
                  </p>
                ) : (
                  <p className="text-sm text-zinc-400 text-center mt-2">
                    {formatETH(Math.max(0, remainingEth).toString())} BNB until graduation target
                  </p>
                )}
              </div>
            </div>

            {/* Info / Links / Creator */}
            <div className="space-y-6 xl:col-span-5">
              {/* ABOUT */}
              <div className="rounded-3xl border border-[#1F2937] bg-[#11161D] p-5">
                <h3 className="text-white font-semibold mb-2">About</h3>
                <p className="text-white/80 leading-relaxed">{token.description}</p>
              </div>

              {/* LINKS */}
              {(token.website || token.telegram || token.twitter || token.discord) && (
                <div className="rounded-3xl border border-[#1F2937] bg-[#11161D] p-5">
                  <h3 className="text-white font-semibold mb-3">Links</h3>
                  <div className="flex flex-wrap gap-2">
                    {token.website && (
                      <a
                        href={token.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1F2937] bg-[#0B0F14] text-vault-primary text-sm font-semibold hover:bg-[#131a22]"
                      >
                        <Globe className="h-4 w-4" />
                        <span>Website</span>
                      </a>
                    )}
                    {token.telegram && (
                      <a
                        href={`https://t.me/${token.telegram.replace("@", "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1F2937] bg-[#0B0F14] text-vault-primary text-sm font-semibold hover:bg-[#131a22]"
                      >
                        <MessageCircle className="h-4 w-4" />
                        <span>Telegram</span>
                      </a>
                    )}
                    {token.twitter && (
                      <a
                        href={`https://twitter.com/${token.twitter.replace("@", "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1F2937] bg-[#0B0F14] text-vault-primary text-sm font-semibold hover:bg-[#131a22]"
                      >
                        <Twitter className="h-4 w-4" />
                        <span>Twitter</span>
                      </a>
                    )}
                    {token.discord && (
                      <a
                        href={token.discord.startsWith("http") ? token.discord : `https://discord.gg/${token.discord}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1F2937] bg-[#0B0F14] text-vault-primary text-sm font-semibold hover:bg-[#131a22]"
                      >
                        <MessageSquare className="h-4 w-4" />
                        <span>Discord</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* TECH INFO */}
              <div className="rounded-3xl border border-[#1F2937] bg-[#11161D] p-5">
                <h3 className="text-white font-semibold mb-3">Technical Info</h3>
                <div className="grid gap-3">
                  <RowKV
                    k="Contract Address"
                    v={
                      <span className="flex items-center gap-2">
                        <span className="text-white font-mono text-sm">
                          {token.tokenAddress.slice(0, 10)}...{token.tokenAddress.slice(-8)}
                        </span>
                        <button onClick={() => copyToClipboard(token.tokenAddress)} className="p-1 rounded hover:bg-white/5">
                          <Copy className="h-3.5 w-3.5 text-vault-primary" />
                        </button>
                        <a
                          href={`https://bscscan.com/address/${token.tokenAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-white/5"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-vault-primary" />
                        </a>
                      </span>
                    }
                  />
                  <RowKV
                    k="Creator"
                    v={
                      <span className="flex items-center gap-2">
                        <span className="text-white font-mono text-sm">
                          {token.creator.slice(0, 8)}...{token.creator.slice(-6)}
                        </span>
                        <button onClick={() => copyToClipboard(token.creator)} className="p-1 rounded hover:bg-white/5">
                          <Copy className="h-3.5 w-3.5 text-vault-primary" />
                        </button>
                        <a
                          href={`https://bscscan.com/address/${token.creator}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-white/5"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-vault-primary" />
                        </a>
                      </span>
                    }
                  />
                  <RowKV
                    k="Created"
                    v={new Date(parseInt(token.createdAt) * 1000).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  />
                  <RowKV
                    k="BNB in curve"
                    v={
                      <span className="text-vault-primary font-semibold">
                        {formatETH((realTimeStats?.realETH ?? token.realETH) || "0")} BNB
                      </span>
                    }
                  />
                  <RowKV
                    k="Graduation target"
                    v={<span className="text-white font-semibold">{formatETH(graduationTargetBnB.toString())} BNB</span>}
                  />
                  <RowKV k="Total Supply" v={<span className="text-white font-semibold">{formatNumber(token.totalSupply)}</span>} />
                </div>
              </div>

              {/* FIRST BUY (CTO) — creator */}
              {isCreator && showCtoSeal && firstBuyStatus && (
                <div className="rounded-3xl border border-[#A855F7]/30 bg-[#11161D] p-5">
                  <h3 className="text-white font-semibold mb-3 inline-flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#A855F7]" />
                    First Buy (CTO)
                  </h3>
                  {firstBuyStatus.canClaim ? (
                    <div className="text-center">
                      <p className="text-[#9CA3AF] text-sm mb-3">
                        First buy tokens unlocked — claim to your wallet.
                      </p>
                      <button
                        onClick={async () => {
                          const ok = await claimFirstBuyTokens(token.tokenAddress);
                          if (ok) void loadTokenData(true);
                        }}
                        disabled={isRefreshing}
                        className="w-full px-6 py-3 rounded-xl font-semibold transition-all bg-[#A855F7] hover:bg-[#9333ea] text-white disabled:opacity-50"
                      >
                        {isRefreshing ? "Claiming..." : "Claim First Buy"}
                      </button>
                    </div>
                  ) : parseFloat(firstBuyStatus.lockedAmount) > 0 ? (
                    <div className="rounded-xl p-4 border border-[#A855F7]/20 bg-black/30">
                      <p className="text-[#A855F7] font-semibold text-center">
                        Locked — {getFirstBuyLockRemaining() ?? "unlocking"}
                      </p>
                      <p className="text-zinc-400 text-sm text-center mt-2">
                        Amount: {formatNumber(firstBuyStatus.lockedAmount)} {token.symbol}
                      </p>
                      {(token as any).firstBuyUnlockTime && parseInt(String((token as any).firstBuyUnlockTime), 10) > 0 && (
                        <p className="text-emerald-400 text-sm font-semibold text-center mt-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                          Unlock time: {new Date(parseInt(String((token as any).firstBuyUnlockTime), 10) * 1000).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-zinc-400 text-sm text-center">
                      CTO commitment active — first buy tokens already claimed or no locked balance.
                    </p>
                  )}
                </div>
              )}

            </div>
          </div>
      </div>

      {/* Modals */}
      {showRocketBoost && token && (
        <RocketBoostModal
          token={token}
          onClose={() => setShowRocketBoost(false)}
          onSuccess={() => {
            void loadTokenData(true);
            void getRocketScore(token.tokenAddress).then(setRocketScore).catch(() => {});
          }}
        />
      )}
    </>
  );
};

/** ------- UI helpers (flat + neon) ------- */
const Metric: React.FC<{ label: string; value: React.ReactNode; Icon: any; title?: string }> = ({
  label,
  value,
  Icon,
  title,
}) => (
  <div
    className="flex items-center justify-between rounded-2xl border border-[#1F2937] bg-[#11161D] px-4 py-3"
    title={title}
  >
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-sm font-semibold text-white truncate">{value}</div>
    </div>
    <div className="p-2 rounded-lg bg-black/40 shrink-0">
      <Icon className="w-4 h-4 text-vault-primary" />
    </div>
  </div>
);

const RowKV: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm text-zinc-400">{k}</span>
    <span className="text-sm text-white text-right">{v}</span>
  </div>
);
