import type { ethers } from 'ethers';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchFactoryTrades,
  invalidateFactoryTradesCache,
  type FactoryTradeRow,
} from '../utils/factoryTrades';

const DEBUG = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;
const debugLog = (...args: any[]) => {
  if (DEBUG) console.log(...args);
};

export type Trade = FactoryTradeRow;

export interface Candle {
  time: number; // timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TokenChartData {
  tokenAddress: string;
  trades: Trade[];
  candles: Candle[];
  currentPrice: number;
  volume24h: number;
  priceChange24h: number;
  lastUpdate: number;
}

// Function to aggregate trades into OHLC candles
export function buildCandles(trades: Trade[], intervalSec: number): Candle[] {
  if (trades.length === 0) return [];

  const buckets: { [key: number]: Trade[] } = {};

  // Group trades by time interval
  for (const trade of trades) {
    const bucketTime = Math.floor(trade.timestamp / intervalSec) * intervalSec;
    if (!buckets[bucketTime]) buckets[bucketTime] = [];
    buckets[bucketTime].push(trade);
  }

  // Convert buckets into candles
  return Object.entries(buckets)
    .map(([time, bucket]) => {
      const sorted = bucket.sort((a, b) => a.timestamp - b.timestamp);
      const volume = bucket.reduce((sum, t) => sum + t.amountETH, 0);

      return {
        time: parseInt(time),
        open: sorted[0].price,
        close: sorted[sorted.length - 1].price,
        high: Math.max(...sorted.map(t => t.price)),
        low: Math.min(...sorted.map(t => t.price)),
        volume,
      };
    })
    .sort((a, b) => a.time - b.time);
}

export const useFactoryEvents = (
  tokenAddress?: string,
  /** Com wallet na BSC: lê eventos via RPC da extensão (MetaMask, etc.). Sem wallet: API → Etherscan → RPC público. */
  walletReadProvider?: ethers.Provider | null,
) => {
  const [chartData, setChartData] = useState<TokenChartData | null>(null);
  const [loading, setLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  // Cache to avoid refetching the same data
  const cacheRef = useRef<Map<string, TokenChartData>>(new Map());

  const fetchTokenEventsFromFactory = async (
    tokenAddr: string,
    opts?: { refresh?: boolean },
  ): Promise<Trade[]> => {
    debugLog('🔍 [FACTORY EVENTS] Fetching events for token:', tokenAddr);
    const readProvider = walletReadProvider ?? undefined;
    const trades = await fetchFactoryTrades(tokenAddr, {
      refresh: opts?.refresh,
      readProvider,
    });
    debugLog('✅ [FACTORY EVENTS] Total trades found:', trades.length);
    return trades;
  };

  const loadTokenHistory = useCallback(async (tokenAddr: string, opts?: { refresh?: boolean }) => {
    const cacheKey = `${tokenAddr}:${walletReadProvider ? 'w' : 'p'}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached && Date.now() - cached.lastUpdate < 50000 && !opts?.refresh) {
      console.log('✅ [FACTORY CACHE] Using cached data');
      setEventsError(null);
      setChartData(cached);
      return;
    }

    try {
      setLoading(true);
      setEventsError(null);
      debugLog('🚀 [FACTORY MAIN] Loading history for token:', tokenAddr);

      const trades = await fetchTokenEventsFromFactory(tokenAddr, opts);

      if (trades.length === 0) {
        console.log('❌ [FACTORY MAIN] No trading events found');
        setChartData(null);
        return;
      }

      // Metrics
      const now = Date.now();
      const volume24h = trades
        .filter(t => now - t.timestamp * 1000 <= 24 * 60 * 60 * 1000)
        .reduce((sum, t) => sum + t.amountETH, 0);

      const currentPrice = trades[trades.length - 1].price;

      let priceChange24h = 0;
      if (trades.length >= 2) {
        const firstPrice = trades[0].price;
        const lastPrice = trades[trades.length - 1].price;
        if (firstPrice > 0) {
          priceChange24h = ((lastPrice - firstPrice) / firstPrice) * 100;
        }
      }

      // Candles
      const candles1m = buildCandles(trades, 60);
      const candles5m = buildCandles(trades, 300);
      const candles1h = buildCandles(trades, 3600);

      debugLog('📊 [FACTORY CANDLES] Generated:', {
        '1m': candles1m.length,
        '5m': candles5m.length,
        '1h': candles1h.length,
      });

      const data: TokenChartData = {
        tokenAddress: tokenAddr,
        trades,
        candles: candles5m,
        currentPrice,
        volume24h,
        priceChange24h,
        lastUpdate: Date.now(),
      };

      cacheRef.current.set(cacheKey, data);

      setChartData(data);
      debugLog('✅ [FACTORY MAIN] Chart data loaded successfully:', {
        trades: trades.length,
        candles: candles5m.length,
        currentPrice,
        volume24h,
        priceChange24h,
      });
    } catch (error) {
      console.error('❌ [FACTORY MAIN] Error loading history:', error);
      setChartData(null);
      setEventsError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [walletReadProvider]);

  // Reload when token or wallet RPC mode changes
  useEffect(() => {
    if (tokenAddress) {
      debugLog(
        '🔄 [FACTORY EFFECT] Token address changed, loading history for:',
        tokenAddress
      );
      void loadTokenHistory(tokenAddress);
    } else {
      debugLog('🔄 [FACTORY EFFECT] No token address, clearing chart data');
      setChartData(null);
      setEventsError(null);
    }
  }, [tokenAddress, walletReadProvider, loadTokenHistory]);

  return {
    chartData,
    loading,
    eventsError,
    refreshData: () => {
      if (tokenAddress) {
        const ck = `${tokenAddress}:${walletReadProvider ? 'w' : 'p'}`;
        cacheRef.current.delete(ck);
        invalidateFactoryTradesCache(tokenAddress);
        void loadTokenHistory(tokenAddress, { refresh: true });
      }
    },
  };
};
