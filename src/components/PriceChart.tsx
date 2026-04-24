/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from 'lightweight-charts';
import type { Time } from 'lightweight-charts';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { ethers } from 'ethers';
import { getBscReadRpcUrl } from '../config/bscReadRpc';
import { CONTRACT_ADDRESSES, TOKEN_FACTORY_ABI } from '../contracts/contractAddresses';
import { fetchFactoryTrades, invalidateFactoryTradesCache } from '../utils/factoryTrades';

const getPublicReadProvider = () => new ethers.JsonRpcProvider(getBscReadRpcUrl());

/** BNB actually locked in the bonding curve (`bondingCurves.realETH`), not 24h volume. */
async function fetchBondingRealEth(provider: ethers.Provider, tokenAddress: string): Promise<string> {
  const factory = new ethers.Contract(
    CONTRACT_ADDRESSES.TOKEN_FACTORY,
    TOKEN_FACTORY_ABI,
    provider,
  );
  const bc = await factory.bondingCurves(tokenAddress);
  return ethers.formatEther(bc.realETH);
}

// =============================
// Tipos
// =============================
interface Trade {
  side: 'buy' | 'sell';
  amountETH: number; 
  amountToken: number;
  price: number; 
  timestamp: number; 
  txHash: string;
}

interface Candle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface PriceChartProps {
  tokenAddress: string;
  tokenSymbol: string;
  /** Com wallet na BSC: leituras de trades e bonding via RPC da extensão. */
  readProvider?: ethers.Provider | null;
  isGraduated?: boolean;
  dexPair?: string;
  tokenDecimals?: number; // default 18
  onStatsUpdate?: (stats: {
    currentPrice: string;
    /** Chart FDV estimate: last trade price × 1B supply. */
    marketCap: string;
    /** BNB in bonding curve — from `bondingCurves(token).realETH`. */
    realETH: string;
  }) => void;
}

// =============================
// Utils
// =============================
const formatBNB = (value: number | string): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || num === 0) return '0.00';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K';
  if (num >= 1) return num.toFixed(4);
  // Avoid scientific notation for UI; show more decimals for small prices.
  if (num >= 0.01) return num.toFixed(6);
  if (num >= 0.0001) return num.toFixed(8);
  if (num >= 0.00000001) return num.toFixed(10);
  // Extremely tiny: last resort, still readable.
  return num.toFixed(12);
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function toNumber(val: any, decimalsHint = 18): number {
  try {
    if (typeof val === 'bigint') return parseFloat(ethers.formatUnits(val, decimalsHint));
    if (typeof val === 'string') {
      if (/^\d+$/.test(val)) return parseFloat(ethers.formatUnits(BigInt(val), decimalsHint));
      return parseFloat(val);
    }
    if (typeof val === 'number') return val;
    return Number(val ?? 0);
  } catch (_) {
    return Number(val ?? 0);
  }
}

function buildCandles(trades: Trade[], intervalSec: number): Candle[] {
  if (!trades.length) return [];
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  const buckets = new Map<number, { o: number; h: number; l: number; c: number; v: number }>();

  for (const t of sorted) {
    const bucketTs = Math.floor(t.timestamp / intervalSec) * intervalSec;
    const b = buckets.get(bucketTs);
    if (!b) {
      buckets.set(bucketTs, { o: t.price, h: t.price, l: t.price, c: t.price, v: t.amountETH });
    } else {
      b.h = Math.max(b.h, t.price);
      b.l = Math.min(b.l, t.price);
      b.c = t.price;
      b.v += t.amountETH;
    }
  }

  const out: Candle[] = [];
  for (const [ts, { o, h, l, c, v }] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    out.push({ time: ts as UTCTimestamp, open: o, high: h, low: l, close: c });
  }
  return out;
}

type VolumeBar = { time: UTCTimestamp; value: number };

function buildVolumeBars(
  trades: Trade[],
  intervalSec: number,
): VolumeBar[] {
  if (!trades.length) return [];
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);
  const buckets = new Map<number, number>();

  for (const t of sorted) {
    const bucketTs = Math.floor(t.timestamp / intervalSec) * intervalSec;
    const prev = buckets.get(bucketTs) ?? 0;
    // Buy = +vol, Sell = -vol (so sells are always red regardless of candle direction).
    const signed = t.side === 'sell' ? -t.amountETH : t.amountETH;
    buckets.set(bucketTs, prev + signed);
  }

  const out: VolumeBar[] = [];
  for (const [ts, v] of Array.from(buckets.entries()).sort((a, b) => a[0] - b[0])) {
    out.push({ time: ts as UTCTimestamp, value: v });
  }
  return out;
}

async function fetchTradesFromFactory(
  tokenAddress: string,
  opts?: { refresh?: boolean; readProvider?: ethers.Provider | null },
): Promise<Trade[]> {
  const rows = await fetchFactoryTrades(tokenAddress, {
    refresh: opts?.refresh,
    readProvider: opts?.readProvider ?? undefined,
  });
  const mapped = rows.map((r) => {
    let price = r.price;
    const amtTok = r.tokenAmount;
    const amtEth = r.amountETH;
    if (!Number.isFinite(price) || price <= 0) {
      price = amtTok > 0 ? amtEth / amtTok : 0;
    }
    return {
      side: r.side,
      amountETH: clamp(amtEth, 0, 1e12),
      amountToken: clamp(amtTok, 0, 1e30),
      price: clamp(price, 0, 1e12),
      timestamp: Number.isFinite(r.timestamp) ? r.timestamp : 0,
      txHash: r.txHash,
    };
  });

  // Normalize (prevents "bagunça" from duplicated/out-of-order rows)
  const cleaned = mapped
    .filter((t) => t.timestamp > 0 && Number.isFinite(t.price) && t.price > 0)
    .sort((a, b) => a.timestamp - b.timestamp || a.txHash.localeCompare(b.txHash));

  const seen = new Set<string>();
  const out: Trade[] = [];
  for (const t of cleaned) {
    const k = `${t.txHash}:${t.side}:${t.timestamp}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function calc24hStats(trades: Trade[]) {
  if (!trades.length) return { volume24h: 0, priceChange24h: 0, currentPrice: 0 };
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 24 * 3600;
  const last24h = trades.filter((t) => t.timestamp >= dayAgo);
  const volume24h = last24h.reduce((acc, t) => acc + t.amountETH, 0);
  const currentPrice = trades[trades.length - 1].price;
  const first24 = last24h[0]?.price ?? trades[0].price;
  const priceChange24h = ((currentPrice - first24) / (first24 || 1)) * 100;
  return { volume24h, priceChange24h, currentPrice };
}

// =============================
// Component
// =============================
export const PriceChart: React.FC<PriceChartProps> = ({
  tokenAddress,
  tokenSymbol,
  readProvider = null,
  isGraduated,
  dexPair,
  tokenDecimals = 18,
  onStatsUpdate,
}) => {
  const chartReadProvider = useMemo(
    () => readProvider ?? getPublicReadProvider(),
    [readProvider],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Default `all` so trades from days ago still appear (5m/1h windows hide old history). */
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '1h' | 'all'>('all');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [volume24h, setVolume24h] = useState(0);
  const [priceChange24h, setPriceChange24h] = useState(0);
  const [currentPrice, setCurrentPrice] = useState(0);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick', Time> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram', Time> | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  // Cria chart uma vez
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f1419' },
        textColor: '#e2e8f0',
      },
      grid: {
        vertLines: { color: 'rgba(148,163,184,0.12)' },
        horzLines: { color: 'rgba(148,163,184,0.12)' },
      },
      crosshair: { mode: 1, vertLine: { color: 'rgba(34,197,94,0.35)' }, horzLine: { color: 'rgba(34,197,94,0.25)' } },
      rightPriceScale: {
        borderColor: 'rgba(34,197,94,0.35)',
        scaleMargins: { top: 0.08, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(34,197,94,0.25)',
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#4ade80',
      borderDownColor: '#f87171',
      wickUpColor: '#86efac',
      wickDownColor: '#fca5a5',
      priceLineVisible: true,
      lastValueVisible: true,
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      scaleMargins: { top: 0.82, bottom: 0 },
      color: 'rgba(34,197,94,0.45)',
    });

    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candle;
    volumeSeriesRef.current = volume;

    const tooltip = document.createElement('div');
    tooltip.className = 'tw-tooltip absolute pointer-events-none bg-black/80 text-white text-xs rounded-md px-2 py-1 border border-white/10';
    tooltip.style.left = '8px';
    tooltip.style.top = '8px';
    tooltip.style.zIndex = '10';
    tooltip.style.display = 'none';
    chartContainerRef.current.appendChild(tooltip);
    tooltipRef.current = tooltip;

    chart.subscribeCrosshairMove((param) => {
      if (!tooltipRef.current) return;
      const p = param.seriesPrices?.get(candle);
      if (!param.point || p === undefined) {
        tooltipRef.current.style.display = 'none';
        return;
      }
      const price = p as any;
      const { time } = param;
      const date = time ? new Date((time as number) * 1000).toLocaleString() : '';
      tooltipRef.current.innerHTML = `<div>${date}</div><div>O: ${price.open?.toFixed?.(8) ?? ''} H: ${price.high?.toFixed?.(8) ?? ''} L: ${price.low?.toFixed?.(8) ?? ''} C: ${price.close?.toFixed?.(8) ?? ''}</div>`;
      tooltipRef.current.style.display = 'block';
    });

    const ro = new ResizeObserver(() => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      if (tooltipRef.current && tooltipRef.current.parentElement) {
        tooltipRef.current.parentElement.removeChild(tooltipRef.current);
      }
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (!tokenAddress) return;
        setLoading(true);
        setError(null);

        const tradesAll = await fetchTradesFromFactory(tokenAddress, { readProvider });
        if (cancelled) return;
        setTrades(tradesAll);

        const s = calc24hStats(tradesAll);
        setVolume24h(s.volume24h);
        setPriceChange24h(s.priceChange24h);
        setCurrentPrice(s.currentPrice);

        if (onStatsUpdate) {
          const totalSupply = 1_000_000_000;
          const mc = s.currentPrice * totalSupply;
          let realEthStr = '0';
          try {
            realEthStr = await fetchBondingRealEth(chartReadProvider, tokenAddress);
          } catch {
            /* keep 0 */
          }
          onStatsUpdate({
            currentPrice: s.currentPrice.toString(),
            marketCap: mc.toString(),
            realETH: realEthStr,
          });
        }
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load events.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [tokenAddress, tokenDecimals, readProvider, chartReadProvider]);

  const updateSeriesWithTrades = (allTrades: Trade[]) => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !chartRef.current) return;
    if (!allTrades.length) return;

    let intervalSec = 300; // 5m
    if (timeframe === '1m') intervalSec = 60;
    else if (timeframe === '1h') intervalSec = 3600;

    let filtered = allTrades;
    if (timeframe !== 'all') {
      const now = Math.floor(Date.now() / 1000);
      const cutoff =
        timeframe === '1m' ? now - 3600 :
        timeframe === '5m' ? now - 4 * 3600 :
        now - 24 * 3600;
      filtered = allTrades.filter((t) => t.timestamp >= cutoff);
    }

    const candles = buildCandles(filtered, intervalSec);
    candleSeriesRef.current.setData(
      candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    const volumes = buildVolumeBars(filtered, intervalSec);
    volumeSeriesRef.current.setData(
      volumes.map((v) => ({
        time: v.time,
        value: Math.abs(v.value),
        color: v.value < 0 ? 'rgba(239,68,68,0.55)' : 'rgba(34,197,94,0.55)',
      })),
    );

    // Trade markers: buys below candle, sells above candle (always red for sells).
    const markerTrades = filtered.slice(-200);
    const markers = markerTrades.map((t) => ({
      time: t.timestamp as UTCTimestamp,
      position: t.side === 'sell' ? 'aboveBar' : 'belowBar',
      color: t.side === 'sell' ? '#ef4444' : '#22c55e',
      shape: t.side === 'sell' ? 'arrowDown' : 'arrowUp',
      text: t.side === 'sell' ? 'S' : 'B',
    }));
    try {
      (candleSeriesRef.current as any).setMarkers(markers);
    } catch {
      /* ignore if this lightweight-charts build doesn't support markers */
    }

    chartRef.current.timeScale().fitContent();
  };

  useEffect(() => {
    updateSeriesWithTrades(trades);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, trades]);

  const formatVolume = (volume: number) => {
    if (volume === 0) return '0.0000 BNB';
    if (volume >= 1) return volume.toFixed(4) + ' BNB';
    return volume.toFixed(8) + ' BNB';
  };

  const refreshData = async () => {
    if (!tokenAddress) return;
    try {
      setLoading(true);
      invalidateFactoryTradesCache(tokenAddress);
      const tradesAll = await fetchTradesFromFactory(tokenAddress, { refresh: true, readProvider });
      setTrades(tradesAll);
      const s = calc24hStats(tradesAll);
      setVolume24h(s.volume24h);
      setPriceChange24h(s.priceChange24h);
      setCurrentPrice(s.currentPrice);
      if (onStatsUpdate) {
        const totalSupply = 1_000_000_000;
        const mc = s.currentPrice * totalSupply;
        let realEthStr = '0';
        try {
          realEthStr = await fetchBondingRealEth(chartReadProvider, tokenAddress);
        } catch {
          /* ignore */
        }
        onStatsUpdate({
          currentPrice: s.currentPrice.toString(),
          marketCap: mc.toString(),
          realETH: realEthStr,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================= UI =============================
  if (isGraduated && dexPair) {
    return (
      <div className="bg-zinc-900/10 rounded-2xl p-6 border border-zinc-700/20">
        <div className="text-center py-12">
          <div className="bg-green-600 rounded-full p-6 w-20 h-20 mx-auto mb-6">
            <BarChart3 className="h-8 w-8 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-4">🎓 Token Graduated!</h3>
          <p className="text-gray-300 mb-6">This token has graduated to PancakeSwap with permanent liquidity. View advanced charts on DEXTools.</p>
          <a
           href={`https://www.dextools.io/app/en/bsc/pair-explorer/${dexPair}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200"
          >
            <span>📊</span>
            <span>View on DEXTools</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  const isPositive = priceChange24h >= 0;
  const hasTrades = trades.length > 0;

  return (
    <div
      className={`rounded-2xl p-6 border ${
        error ? 'bg-gray-900 border-red-800/60' : 'bg-zinc-900/10 border-zinc-700/20'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className={`text-xl font-bold mb-1 ${error ? 'text-red-400' : 'text-emerald-400'}`}>
            {error ? 'Chart error' : 'Price Chart'}
          </h3>
          {hasTrades && !loading && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <div className="text-[11px] text-zinc-500">Last trade price</div>
                  <div className="text-xl font-bold text-white tabular-nums">{formatBNB(currentPrice)} BNB</div>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-500">Volume 24h</div>
                  <div className="text-xl font-bold text-white tabular-nums">{formatBNB(volume24h)} BNB</div>
                </div>
                <div className={`flex items-center gap-1 pb-0.5 ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                  {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  <span className="font-semibold">
                    {isPositive ? '+' : ''}
                    {priceChange24h.toFixed(2)}%
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-zinc-500 max-w-xl leading-snug">
                From on-chain trades only — not BNB in the bonding curve or graduation target.
              </p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={refreshData}
          className="p-2 hover:bg-zinc-700 rounded-lg transition-colors duration-200"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${error ? 'text-red-300' : 'text-vault-primary'}`} />
        </button>
      </div>

      {error && <p className="text-red-300 text-sm mb-4">{error}</p>}

      {hasTrades && !loading && (
        <div className="flex gap-2 mb-4">
          {(['1m', '5m', '1h', 'all'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors duration-200 ${
                timeframe === tf ? 'bg-vault-primary text-[#0B0F14]' : 'bg-zinc-800 text-gray-300 hover:bg-zinc-700'
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      <div className="mb-2 relative min-h-[400px] h-[420px] w-full rounded-xl border border-emerald-500/25 bg-[#0a0f14] shadow-[0_0_40px_rgba(34,197,94,0.06)] overflow-hidden">
        <div ref={chartContainerRef} className="absolute inset-0 w-full h-full" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/75 z-[2]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-vault-primary mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Loading on-chain events…</p>
            </div>
          </div>
        )}
        {!loading && !error && !hasTrades && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80 z-[2]">
            <div className="text-center px-4">
              <BarChart3 className="h-12 w-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400 mb-2">No trades yet</p>
              <p className="text-gray-500 text-sm max-w-sm mx-auto">
                Buy/sell trades on the Factory appear here. Check contract address and network (BSC).
              </p>
              <button
                type="button"
                onClick={refreshData}
                className="mt-4 px-4 py-2 bg-vault-primary hover:bg-vault-primary-hover text-[#0B0F14] rounded-lg text-sm font-semibold"
              >
                Reload
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
