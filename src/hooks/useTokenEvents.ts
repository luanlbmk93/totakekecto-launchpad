import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES, TOKEN_FACTORY_ABI } from '../contracts/contractAddresses';

const DEBUG = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;
const debugLog = (...args: any[]) => {
  if (DEBUG) console.log(...args);
};

function getEventScanConfig() {
  const envBlockRaw =
    typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FACTORY_DEPLOY_BLOCK;
  const envBlock = envBlockRaw ? Number(envBlockRaw) : NaN;
  return {
    deployBlock: Number.isFinite(envBlock) && envBlock > 0 ? envBlock : null,
    fallbackWindow: 50_000,
  } as const;
}

export interface Trade {
  side: 'buy' | 'sell';
  amountETH: number;
  price: number;
  timestamp: number;
  txHash: string;
  user: string;
  tokenAmount: number;
}

export interface Candle {
  time: number;  // timestamp em segundos
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

// Função para agregar trades em candles OHLC
export function buildCandles(trades: Trade[], intervalSec: number): Candle[] {
  if (trades.length === 0) return [];

  const buckets: { [key: number]: Trade[] } = {};

  // Agrupar trades por intervalo de tempo
  for (const trade of trades) {
    const bucketTime = Math.floor(trade.timestamp / intervalSec) * intervalSec;
    if (!buckets[bucketTime]) buckets[bucketTime] = [];
    buckets[bucketTime].push(trade);
  }

  // Converter buckets em candles
  return Object.entries(buckets).map(([time, bucket]) => {
    const sorted = bucket.sort((a, b) => a.timestamp - b.timestamp);
    const volume = bucket.reduce((sum, t) => sum + t.amountETH, 0);
    
    return {
      time: parseInt(time),
      open: sorted[0].price,
      close: sorted[sorted.length - 1].price,
      high: Math.max(...sorted.map(t => t.price)),
      low: Math.min(...sorted.map(t => t.price)),
      volume
    };
  }).sort((a, b) => a.time - b.time);
}

const BSC_RPC_READ = 'https://bsc-dataseed.binance.org/';
const PUBLIC_READ_PROVIDER = new ethers.JsonRpcProvider(BSC_RPC_READ);

export const useTokenEvents = (tokenAddress?: string) => {
  const [chartData, setChartData] = useState<TokenChartData | null>(null);
  const [loading, setLoading] = useState(false);

  const cacheRef = useRef<Map<string, TokenChartData>>(new Map());

  const fetchTokenEvents = async (tokenAddr: string): Promise<Trade[]> => {
    const provider = PUBLIC_READ_PROVIDER;

    debugLog('🔍 [EVENTS] Buscando eventos para token:', tokenAddr);
    
    try {
      const factory = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN_FACTORY, TOKEN_FACTORY_ABI, provider);

      const { deployBlock, fallbackWindow } = getEventScanConfig();
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = deployBlock ?? Math.max(0, latestBlock - fallbackWindow);
      
      debugLog('💰 [EVENTS] Buscando eventos TokenPurchased...');
      const purchaseFilter = factory.filters.TokenPurchased(tokenAddr);
      const purchaseEvents = await factory.queryFilter(purchaseFilter, fromBlock, latestBlock);
      
      debugLog('💰 [EVENTS] TokenPurchased encontrados:', purchaseEvents.length);
      
      debugLog('💸 [EVENTS] Buscando eventos TokenSold...');
      const sellFilter = factory.filters.TokenSold(tokenAddr);
      const sellEvents = await factory.queryFilter(sellFilter, fromBlock, latestBlock);
      
      debugLog('💸 [EVENTS] TokenSold encontrados:', sellEvents.length);
      
      const trades: Trade[] = [];
      const blockTsCache = new Map<number, number>();
      const getBlockTs = async (blockNumber: number) => {
        const cached = blockTsCache.get(blockNumber);
        if (cached) return cached;
        const b = await provider.getBlock(blockNumber);
        const ts = b?.timestamp ?? 0;
        blockTsCache.set(blockNumber, ts);
        return ts;
      };
      
      for (const event of purchaseEvents) {
        try {
          const timestamp = await getBlockTs(event.blockNumber);
          const args = event.args;
          
          if (args && args.length >= 5) {
            const buyer = args[1];
            const ethAmount = parseFloat(ethers.formatEther(args[2]));
            const tokenAmount = parseFloat(ethers.formatEther(args[3]));
            const newPrice = parseFloat(ethers.formatEther(args[4]));
            
            trades.push({
              side: 'buy',
              amountETH: ethAmount,
              price: newPrice,
              timestamp,
              txHash: event.transactionHash,
              user: buyer,
              tokenAmount
            });
            
            debugLog('✅ [EVENTS] Buy processado:', {
              price: newPrice,
              volume: ethAmount,
              timestamp
            });
          }
        } catch (error) {
          console.error('❌ [EVENTS] Erro processando buy event:', error);
        }
      }
      
      for (const event of sellEvents) {
        try {
          const timestamp = await getBlockTs(event.blockNumber);
          const args = event.args;
          
          if (args && args.length >= 5) {
            const seller = args[1];
            const tokenAmount = parseFloat(ethers.formatEther(args[2]));
            const ethAmount = parseFloat(ethers.formatEther(args[3]));
            const newPrice = parseFloat(ethers.formatEther(args[4]));
            
            trades.push({
              side: 'sell',
              amountETH: ethAmount,
              price: newPrice,
              timestamp,
              txHash: event.transactionHash,
              user: seller,
              tokenAmount
            });
            
            debugLog('✅ [EVENTS] Sell processado:', {
              price: newPrice,
              volume: ethAmount,
              timestamp
            });
          }
        } catch (error) {
          console.error('❌ [EVENTS] Erro processando sell event:', error);
        }
      }
      
      trades.sort((a, b) => a.timestamp - b.timestamp);
      
      debugLog('✅ [EVENTS] Total de trades encontrados:', trades.length);
      debugLog('📊 [EVENTS] Primeiro trade:', trades[0]);
      debugLog('📊 [EVENTS] Last trade:', trades[trades.length - 1]);
      
      return trades;
      
    } catch (error) {
      console.error('❌ [EVENTS] Erro geral:', error);
      return [];
    }
  };

  const loadTokenHistory = async (tokenAddr: string) => {
    const cached = cacheRef.current.get(tokenAddr);
    if (cached && Date.now() - cached.lastUpdate < 30000) { 
      debugLog('✅ [CACHE] Using cached data');
      setChartData(cached);
      return;
    }

    try {
      setLoading(true);
      debugLog('🚀 [MAIN] Loading history for token:', tokenAddr);

      const trades = await fetchTokenEvents(tokenAddr);

      if (trades.length === 0) {
        debugLog('❌ [MAIN] No trading events found');
        setChartData(null);
        return;
      }

      const now = Date.now();
      const volume24h = trades
        .filter(t => now - (t.timestamp * 1000) <= 24 * 60 * 60 * 1000)
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

      const candles1m = buildCandles(trades, 60);      
      const candles5m = buildCandles(trades, 300);    
      const candles1h = buildCandles(trades, 3600);   

      debugLog('📊 [CANDLES] Gerados:', {
        '1m': candles1m.length,
        '5m': candles5m.length,
        '1h': candles1h.length
      });

      const data: TokenChartData = {
        tokenAddress: tokenAddr,
        trades,
        candles: candles5m, 
        currentPrice,
        volume24h,
        priceChange24h,
        lastUpdate: Date.now()
      };

      cacheRef.current.set(tokenAddr, data);
      
      setChartData(data);
      debugLog('✅ [MAIN] Chart data loaded successfully:', {
        trades: trades.length,
        candles: candles5m.length,
        currentPrice,
        volume24h,
        priceChange24h
      });

    } catch (error) {
      console.error('❌ [MAIN] Error loading history:', error);
      setChartData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tokenAddress) {
      debugLog('🔄 [EFFECT] Token address changed, loading history for:', tokenAddress);
      loadTokenHistory(tokenAddress);
    } else {
      debugLog('🔄 [EFFECT] No token address, clearing chart data');
      setChartData(null);
    }
  }, [tokenAddress]);

  return {
    chartData,
    loading,
    refreshData: () => {
      if (tokenAddress) {
        cacheRef.current.delete(tokenAddress);
        loadTokenHistory(tokenAddress);
      }
    }
  };
};