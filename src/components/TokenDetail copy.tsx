/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Clock,
  Gift,
  RefreshCw,
  Globe,
  MessageCircle,
  Twitter,
  MessageSquare,
  Activity,
  Users,
  Rocket,
  BarChart3,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Flame,
} from "lucide-react";
import { TokenInfo, useContracts } from "../hooks/useContracts";
import { useWeb3 } from "../hooks/useWeb3";
import { TradingModal } from "./TradingModal";
import { PriceChart } from "./PriceChart";
import { useFactoryEvents } from "../hooks/useFactoryEvents";
import { RocketBoostModal } from "./RocketBoostModal";
import { useRocketBoost } from "../hooks/useRocketBoost";
import { RocketRanking } from "./RocketRanking";
import toast from "react-hot-toast";

/** ------------------------------------------------
 * TokenDetail (dark + flat + neon)
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

  const [showTrading, setShowTrading] = useState(false);
  const [showRocketBoost, setShowRocketBoost] = useState(false);

  const [tokenBalance, setTokenBalance] = useState("0");
  const [creatorTokenStatus, setCreatorTokenStatus] = useState<any>(null);
  const [rocketScore, setRocketScore] = useState(0);

  const [activeTab, setActiveTab] = useState<TabKey>("chart");
  const [loadingHolders, setLoadingHolders] = useState(false);
  const [holders, setHolders] = useState<Array<{ address: string; balance: string; percentage: number }>>([]);

  const [realTimeStats, setRealTimeStats] = useState<{ currentPrice: string; marketCap: string; realETH: string } | null>(null);

  // ---------- deps ----------
  const { getAllTokens, getTokenBalance, getCreatorTokenStatus, claimCreatorTokens } = useContracts();
  const { account } = useWeb3();
  const { chartData } = useFactoryEvents(tokenAddress);
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

  const graduationTarget = 1; // ETH
  const progressPct = useMemo(() => {
    if (!token) return 0;
    if (token.graduated) return 100;
    const current = parseFloat(realTimeStats?.realETH ?? token.realETH ?? "0");
    if (!Number.isFinite(current) || current <= 0) return 0;
    return Math.min((current / graduationTarget) * 100, 100);
  }, [token, realTimeStats]);

  const currentPrice = useMemo(
    () => parseFloat(realTimeStats?.currentPrice || token?.currentPrice || "0"),
    [realTimeStats?.currentPrice, token?.currentPrice]
  );

  const isCreator = useMemo(
    () => (account && token?.creator ? account.toLowerCase() === token.creator.toLowerCase() : false),
    [account, token?.creator]
  );

  const getLockRemaining = () => {
    const raw = (token as any)?.vestingEndTime ?? creatorTokenStatus?.vestingEndTime;
    const burned = (token as any)?.creatorTokensBurned === true || creatorTokenStatus?.burned === true;
    if (!raw || burned) return null;

    const vestingEnd = parseInt(String(raw));
    if (!Number.isFinite(vestingEnd) || vestingEnd <= 0) return null;

    const now = Math.floor(Date.now() / 1000);
    const left = vestingEnd - now;
    if (left <= 0) return null;

    const days = Math.floor(left / 86400);
    const hours = Math.floor((left % 86400) / 3600);
    const minutes = Math.floor((left % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // ===== NOVOS CÁLCULOS PARA O AVISO DO PROGRESSO =====
  const safeNum = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // ETH atual na curva (virtual liquidity) e quanto falta para graduar
  const raisedEth = useMemo(
    () => safeNum(realTimeStats?.realETH ?? token?.realETH ?? 0),
    [realTimeStats?.realETH, token?.realETH]
  );
  const remainingEth = useMemo(
    () => Math.max(0, graduationTarget - raisedEth),
    [graduationTarget, raisedEth]
  );

  // Estimativa de tokens ainda disponíveis na curva
  // Ajuste a alocação do criador se seu contrato usar outro valor:
  const CREATOR_ALLOCATION = 200_000_000;
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

  // Valor levantado cumulativo (soma de ETH de compras)
  const raisedCumulativeEth = useMemo(() => {
    if (!chartData?.trades?.length) return null;
    return chartData.trades
      .filter((t: any) => t.side === "buy")
      .reduce((acc: number, t: any) => acc + safeNum(t.amountETH), 0);
  }, [chartData]);
  // =====================================================

  // ---------- data loaders ----------
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
        void getCreatorTokenStatus(found.tokenAddress).then(setCreatorTokenStatus).catch(() => {});
        void getRocketScore(found.tokenAddress).then(setRocketScore).catch(() => {});
      }
    } finally {
      refreshingRef.current = false;
      if (bg) setIsRefreshing(false);
    }
  };

  // ---------- effects ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setInitialLoading(true);
      await loadTokenData(false);
      if (!cancelled) setInitialLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenAddress, account]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void loadTokenData(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Holders (estimativa simples pelos trades)
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

        const estimated = Object.entries(tradesByUser)
          .map(([address, ts]) => {
            const bal = ts.buys - ts.sells;
            return { address, balance: Math.max(0, bal).toString(), percentage: 0 };
          })
          .filter((h) => parseFloat(h.balance) > 0)
          .sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));

        const total = estimated.reduce((sum, h) => sum + parseFloat(h.balance), 0);
        const withPct = estimated.map((h) => ({
          ...h,
          percentage: total > 0 ? (parseFloat(h.balance) / total) * 100 : 0,
        }));
        setHolders(withPct.slice(0, 20));
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


  // ---------- actions ----------
  const handleClaimTokens = async () => {
    if (!token) return;
    const ok = await claimCreatorTokens(token.tokenAddress);
    if (ok) void loadTokenData(true);
  };

  // ---------- loading / empty ----------
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-black">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
          <div className="flex items-center justify-center min-h-[320px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00ff99]" />
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-black">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
          <div className="py-12">
            <div className="flex flex-col items-center justify-center gap-6">
              {/* Spinner */}
              <div className="relative">
                <div
                  className="h-14 w-14 rounded-full border-2 border-[#00ff99]/30 border-t-[#00ff99] animate-spin"
                  aria-hidden
                />
                <span className="sr-only">Loading token data…</span>
              </div>

              <p className="text-lg text-zinc-400">Loading data on-chain…</p>

              {/* Skeletons */}
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
    <RocketRanking tokens={[token!]} onTokenSelect={() => {}} />

      <div className="min-h-screen bg-black">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
          {/* HEADER (flat + modular) */}
          <div className="flex items-start md:items-center gap-4 md:gap-5 p-4 mb-6 rounded-2xl border border-white/5 bg-zinc-900/80">
            <button
              onClick={onBack}
              className="p-2 rounded-xl hover:bg-white/5 transition-colors shrink-0"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>

            <img
              src={token.imageUrl}
              alt={token.name}
              className="w-14 h-14 md:w-16 md:h-16 rounded-2xl border border-white/5 object-cover shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=100";
              }}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <h1 className="text-xl md:text-2xl font-semibold text-white tracking-tight truncate">
                  {token.name} <span className="text-zinc-400">({token.symbol})</span>
                </h1>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowRocketBoost(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-sm font-semibold transition-all bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                  >
                    <Rocket className="h-4 w-4" />
                    <span>Boost</span>
                  </button>
                  <button
                    onClick={() => loadTokenData(true)}
                    className="p-2 rounded-xl hover:bg-white/5 transition-colors"
                    aria-label="Refresh"
                  >
                    <RefreshCw className={`h-4 w-4 text-[#00ff99] ${isRefreshing ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>

              {/* info compacta + badges */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="font-mono truncate max-w-[160px] sm:max-w-[220px] text-white/90">
                  {token.tokenAddress.slice(0, 8)}...{token.tokenAddress.slice(-6)}
                </span>
                <button
                  onClick={() => copyToClipboard(token.tokenAddress)}
                  className="p-1 rounded hover:bg-white/5"
                  aria-label="Copy contract"
                >
                  <Copy className="h-3.5 w-3.5 text-[#00ff99]" />
                </button>
                <a
                  href={`https://bscscan.com/address/${token.tokenAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-white/5"
                  aria-label="Open in BSCscan"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-[#00ff99]" />
                </a>

                <div className="flex items-center gap-2 ml-auto">
                  {rocketScore > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] border border-amber-400/60 text-amber-300 bg-black/50">
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
                  {(token as any).isBanned && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] border border-red-400/60 text-red-300 bg-black/50">BANNED</span>
                  )}
                  {token.creatorTokensBurned === true && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] border border-red-400/60 text-red-300 bg-black/50">BURNED</span>
                  )}
                  {token.creatorTokensBurned === false &&
                    token.vestingEndTime &&
                    parseInt(token.vestingEndTime) > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] border border-[#00ff99]/60 text-[#00ff99] bg-black/50">
                        LOCKED {getLockRemaining() ? `• ${getLockRemaining()}` : ""}
                      </span>
                    )}
                  {token.graduated && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] border border-emerald-400/60 text-emerald-300 bg-black/50">
                      GRADUATED
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* MÉTRICAS enxutas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Metric
              label="Market Cap"
              value={`${formatETH((realTimeStats?.marketCap || token.marketCap) ?? "0")} ETH`}
              Icon={BarChart3}
            />
            <Metric label="Virtual Liquidity" value={`${formatETH(token.realETH)} ETH`} Icon={Activity} />
            <Metric
              label="Created"
              value={new Date(parseInt(token.createdAt) * 1000).toLocaleDateString()}
              Icon={Clock}
            />
            <Metric label="Progress" value={`${progressPct.toFixed(1)}%`} Icon={Rocket} />
          </div>

          {/* ABAS: Chart / Trades / Holders */}
          <div className="rounded-2xl border border-white/5 bg-zinc-900/80">
            <div className="flex">
              {(["chart", "trades", "holders"] as TabKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setActiveTab(k)}
                  className={`flex-1 py-3 text-sm font-semibold ${
                    activeTab === k
                      ? "bg-[#00ff99] text-black"
                      : "text-zinc-400 hover:text-white hover:bg-white/5"
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

            <div className="p-4 md:p-6">
              {activeTab === "chart" && (
                <div className="rounded-xl border border-white/5 bg-black/50 p-2">
                  <PriceChart
                    tokenAddress={token.tokenAddress}
                    tokenSymbol={token.symbol}
                    isGraduated={token.graduated}
                    dexPair={token.dexPair}
                    onStatsUpdate={setRealTimeStats}
                  />
                </div>
              )}

              {activeTab === "trades" && (
                <>
                  {chartData && chartData.trades.length > 0 ? (
                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                      {chartData.trades.slice(-20).reverse().map((trade, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-black/50"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-3 h-3 rounded-full ${
                                trade.side === "buy" ? "bg-[#00ff99]" : "bg-[#ff4d4f]"
                              }`}
                            />
                            <div>
                              <div
                                className={`font-semibold text-sm ${
                                  trade.side === "buy" ? "text-[#00ff99]" : "text-[#ff4d4f]"
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
                              {formatETH(trade.amountETH.toString())} ETH
                            </div>
                            <div className="text-xs text-zinc-400">
                              {formatNumber(trade.tokenAmount.toString())} {token.symbol}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-white text-sm">{formatETH(trade.price.toString())} ETH</div>
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
                    <div className="text-center py-10">
                      <Activity className="h-8 w-8 text-zinc-500 mx-auto mb-3" />
                      <p className="text-zinc-400">No trades yet</p>
                    </div>
                  )}
                </>
              )}

              {activeTab === "holders" && (
                <>
                  {loadingHolders ? (
                    <div className="text-center py-10">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#00ff99] mx-auto mb-3" />
                      <p className="text-zinc-400">Loading holders...</p>
                    </div>
                  ) : holders.length > 0 ? (
                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                      {holders.map((h, i) => (
                        <div
                          key={h.address}
                          className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-black/50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[#00ff99] rounded-full flex items-center justify-center text-black font-bold text-sm">
                              #{i + 1}
                            </div>
                            <div>
                              <div className="text-white font-mono text-sm">
                                {h.address.slice(0, 6)}...{h.address.slice(-4)}
                              </div>
                              <div className="text-xs text-zinc-400">{h.percentage.toFixed(2)}% of supply</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-white font-semibold text-sm">
                              {formatNumber(h.balance)} {token.symbol}
                            </div>
                            <div className="text-xs text-zinc-400">
                              ~{formatETH((parseFloat(h.balance) * currentPrice).toString())} ETH
                            </div>
                          </div>
                        </div>
                      ))}
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

          {/* COLUNAS → direita (cards empilhados) */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trading & Progress juntos */}
            <div className="space-y-6">
              {/* TRADE */}
              <div className="rounded-2xl border border-white/5 bg-zinc-900/80 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold">Trade {token.symbol}</h3>
                  {account && (
                    <span className="text-xs text-zinc-400">
                      Balance: <span className="text-white">{formatNumber(tokenBalance)} {token.symbol}</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowTrading(true)}
                    disabled={(token as any).isBanned}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                      (token as any).isBanned
                        ? "bg-white/10 text-white/40 cursor-not-allowed"
                        : "bg-[#00ff99] hover:bg-[#00cc77] text-black"
                    }`}
                  >
                    <TrendingUp className="h-4 w-4" />
                    <span>Buy</span>
                  </button>
                  <button
                    onClick={() => setShowTrading(true)}
                    disabled={(token as any).isBanned}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                      (token as any).isBanned
                        ? "bg-white/10 text-white/40 cursor-not-allowed"
                        : "bg-[#ff4d4f] hover:bg-[#e63946] text-white"
                    }`}
                  >
                    <TrendingDown className="h-4 w-4" />
                    <span>Sell</span>
                  </button>
                </div>
              </div>

              {/* PROGRESS */}
              <div className="rounded-2xl border border-white/5 bg-zinc-900/80 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white font-semibold">Bonding Curve Progress</h3>
                  <span className="text-[#00ff99] font-semibold">
                    {token.graduated ? "100.0" : progressPct.toFixed(1)}%
                  </span>
                </div>

                <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-2 bg-[#00ff99] shadow-[0_0_8px_#00ff99]"
                    style={{ width: token.graduated ? "100%" : `${progressPct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-[#00ff99] font-semibold">
                    {formatETH((realTimeStats?.realETH ?? token.realETH) || "0")} BNB
                  </span>
                  <span className="text-zinc-400">{graduationTarget} BNB</span>
                </div>

                {/* AVISO ABAIXO DA BARRA e ANTES do "remaining" */}
                {!token.graduated && (
                  <p className="text-xs text-zinc-400 text-center mt-2">
                    {tokensAvailableForSale !== null ? (
                      <>
                        There are{" "}
                        <span className="text-white font-semibold">
                          {formatNumber(tokensAvailableForSale.toString())} {token.symbol}
                        </span>{" "}
                        still available for sale in the bonding curve and there is{" "}
                        <span className="text-[#00ff99] font-semibold">
                          {formatETH(raisedEth.toString())} ETH
                        </span>
                        {typeof raisedCumulativeEth === "number" ? (
                          <> (Raised amount: {formatETH(raisedCumulativeEth.toString())} ETH)</>
                        ) : null}{" "}
                        in the bonding curve.
                      </>
                    ) : (
<>
  There are{" "}
  <span className="text-white font-semibold">
    {formatNumber(tokensAvailableForSale?.toString() || "0")} {token.symbol}
  </span>{" "}
  still available for sale in the bonding curve and there is{" "}
  <span className="text-[#00ff99] font-semibold">
    {formatETH(raisedEth.toString())} ETH
  </span>
  {typeof raisedCumulativeEth === "number" ? (
    <> (Raised amount: {formatETH(raisedCumulativeEth.toString())} ETH)</>
  ) : null}{" "}
  in the bonding curve.
</>
                    )}
                  </p>
                )}

                {token.graduated ? (
                  <p className="text-sm text-emerald-400 text-center font-semibold mt-2">🎓 Token graduated to PancakeSwap!</p>
                ) : (
                  <p className="text-sm text-zinc-400 text-center mt-2">
                    {formatETH(Math.max(0, remainingEth).toString())} ETH remaining to graduate
                  </p>
                )}
              </div>
            </div>

            {/* Info / Links / Creator */}
            <div className="space-y-6">
              {/* ABOUT */}
              <div className="rounded-2xl border border-white/5 bg-zinc-900/80 p-4">
                <h3 className="text-white font-semibold mb-2">About</h3>
                <p className="text-white/80 leading-relaxed">{token.description}</p>
              </div>

              {/* LINKS */}
              {(token.website || token.telegram || token.twitter || token.discord) && (
                <div className="rounded-2xl border border-white/5 bg-zinc-900/80 p-4">
                  <h3 className="text-white font-semibold mb-3">Links</h3>
                  <div className="flex flex-wrap gap-3">
                    {token.website && (
                      <a
                        href={token.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/5 bg-black/40 text-[#00ff99] text-sm font-semibold hover:bg-black/60"
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
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/5 bg-black/40 text-[#00ff99] text-sm font-semibold hover:bg-black/60"
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
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/5 bg-black/40 text-[#00ff99] text-sm font-semibold hover:bg-black/60"
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
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/5 bg-black/40 text-[#00ff99] text-sm font-semibold hover:bg-black/60"
                      >
                        <MessageSquare className="h-4 w-4" />
                        <span>Discord</span>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* TECH INFO */}
              <div className="rounded-2xl border border-white/5 bg-zinc-900/80 p-4">
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
                          <Copy className="h-3.5 w-3.5 text-[#00ff99]" />
                        </button>
                        <a
                          href={`https://bscscan.com/address/${token.tokenAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-white/5"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-[#00ff99]" />
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
                          <Copy className="h-3.5 w-3.5 text-[#00ff99]" />
                        </button>
                        <a
                          href={`https://bscscan.com/address/${token.creator}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 rounded hover:bg-white/5"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-[#00ff99]" />
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
                    k="Real ETH in Curve"
                    v={<span className="text-[#00ff99] font-semibold">{formatETH((realTimeStats?.realETH ?? token.realETH) || "0")} ETH</span>}
                  />
                  <RowKV
                    k="Total Supply"
                    v={<span className="text-white font-semibold">{formatNumber(token.totalSupply)}</span>}
                  />
                  <RowKV
                    k="Market Cap"
                    v={<span className="text-white font-semibold">{formatETH((realTimeStats?.marketCap || token.marketCap) ?? "0")} ETH</span>}
                  />
                </div>
              </div>

              {/* CREATOR TOKENS */}
              {isCreator && creatorTokenStatus && (
                <div className="rounded-2xl border border-white/5 bg-zinc-900/80 p-4">
                  <h3 className="text-white font-semibold mb-3">Creator Tokens</h3>

                  {creatorTokenStatus.burned ? (
                    <div className="text-center">
                      <div className="bg-red-500/10 p-4 rounded-xl mb-4 border border-red-500/40">
                        <Flame className="h-6 w-6 text-[#ff4d4f] mx-auto mb-2" />
                        <p className="text-red-300 font-semibold">Tokens Burned Forever</p>
                      </div>
                      <p className="text-zinc-400">200M creator tokens were permanently destroyed</p>
                    </div>
                  ) : creatorTokenStatus.canClaim ? (
                    <div className="text-center">
                      <div className="bg-emerald-500/10 p-4 rounded-xl mb-4 border border-emerald-500/40">
                        <Gift className="h-6 w-6 text-[#00ff99] mx-auto mb-2" />
                        <p className="text-emerald-300 font-semibold">Ready to Claim!</p>
                      </div>
                      <p className="text-white mb-4">Your 200M tokens are now unlocked</p>
                      <button
                        onClick={handleClaimTokens}
                        disabled={isRefreshing}
                        className="w-full px-6 py-3 rounded-xl text-black font-semibold transition-all bg-[#00ff99] hover:bg-[#00cc77] disabled:bg_white/20 disabled:text-white/40"
                      >
                        {isRefreshing ? "Claiming..." : "Claim 200M Tokens"}
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="bg-white/5 p-4 rounded-xl mb-4 border border-white/10">
                        <Clock className="h-6 w-6 text-[#00ff99] mx-auto mb-2" />
                        <p className="text-[#00ff99] font-semibold">Tokens Locked</p>
                      </div>
                      <p className="text-white mb-4">200M tokens locked for 1 year</p>
                      <div className="rounded-xl p-4 border border-white/10 bg-white/5">
                        <p className="text-[#00ff99] font-semibold">⏰ {getLockRemaining() ?? "-"}</p>
                        {creatorTokenStatus?.vestingEndTime && (
                          <p className="text-zinc-400 text-sm">
                            Unlock: {new Date(parseInt(creatorTokenStatus.vestingEndTime) * 1000).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Action Bar (MOBILE) */}
      <div className="fixed bottom-3 left-0 right-0 px-3 md:hidden pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-white/5 bg-black/80 backdrop-blur supports-[backdrop-filter]:bg-black/60 p-2">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setShowTrading(true)}
              disabled={(token as any).isBanned}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm ${
                (token as any).isBanned
                  ? "bg-white/10 text_white/40 cursor-not-allowed"
                  : "bg-[#00ff99] text-black hover:bg-[#00cc77]"
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              Buy
            </button>
            <button
              onClick={() => setShowTrading(true)}
              disabled={(token as any).isBanned}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm ${
                (token as any).isBanned
                  ? "bg_white/10 text_white/40 cursor-not-allowed"
                  : "bg-[#ff4d4f] text-white hover:bg-[#e63946]"
              }`}
            >
              <TrendingDown className="h-4 w-4" />
              Sell
            </button>
            <button
              onClick={() => setShowRocketBoost(true)}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm bg-gradient-to-r from-orange-500 to-red-500 text-white"
            >
              <Rocket className="h-4 w-4" />
              Boost
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showTrading && token && (
        <TradingModal
          token={token}
          onClose={() => setShowTrading(false)}
          onSuccess={() => void loadTokenData(true)}
        />
      )}
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
const Metric: React.FC<{ label: string; value: React.ReactNode; Icon: any }> = ({ label, value, Icon }) => (
  <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-zinc-900/80 px-4 py-3">
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="text-sm font-semibold text-white truncate">{value}</div>
    </div>
    <div className="p-2 rounded-lg bg-black/40 shrink-0">
      <Icon className="w-4 h-4 text-[#00ff99]" />
    </div>
  </div>
);

const RowKV: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm text-zinc-400">{k}</span>
    <span className="text-sm text-white text-right">{v}</span>
  </div>
);
