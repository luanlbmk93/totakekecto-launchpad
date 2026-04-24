import { useState, useEffect } from 'react';

const MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImY5NzEzNDc4LTk2MjktNDRlOS1hNjU0LWIxMjQ5ZDA2Y2Q0OCIsIm9yZ0lkIjoiMzM0NjgwIiwidXNlcklkIjoiMzQ0MTEyIiwidHlwZSI6IlBST0pFQ1QiLCJ0eXBlSWQiOiJlMTU3ZGJkOC0zYWRlLTQxOGEtYmU5Yy1lNzYwZjIwZDZiM2EiLCJpYXQiOjE3Mzc3NTg3NTksImV4cCI6NDg5MzUxODc1OX0.PBboIkIDSNXmmBdStrQyBbpeQb1fAuoLPCvMAmvMjro';
const BASE_CHAIN_ID = '0x2105'; // BASE Mainnet

export interface TokenPrice {
  tokenAddress: string;
  price: string;
  priceUsd: string;
  timestamp: number;
}

export interface TokenStats {
  tokenAddress: string;
  price: string;
  marketCap: string;
  volume24h: string;
  priceChange24h: number;
  holders: number;
}

export const useMoralisAPI = () => {
  const [loading, setLoading] = useState(false);

  const getTokenPrice = async (tokenAddress: string): Promise<TokenPrice | null> => {
    try {
      setLoading(true);
      console.log('🔍 [MORALIS] Getting token price for:', tokenAddress);

      const response = await fetch(
        `https://deep-index.moralis.io/api/v2.2/erc20/${tokenAddress}/price?chain=${BASE_CHAIN_ID}`,
        {
          headers: {
            'X-API-Key': MORALIS_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error('❌ [MORALIS] API Error:', response.status, response.statusText);
        return null;
      }

      const data = await response.json();
      console.log('✅ [MORALIS] Price data:', data);

      return {
        tokenAddress,
        price: data.nativePrice?.value || '0',
        priceUsd: data.usdPrice || '0',
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('❌ [MORALIS] Error fetching token price:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getTokenStats = async (tokenAddress: string): Promise<TokenStats | null> => {
    try {
      setLoading(true);
      console.log('📊 [MORALIS] Getting token stats for:', tokenAddress);

      // Get token price
      const priceResponse = await fetch(
        `https://deep-index.moralis.io/api/v2.2/erc20/${tokenAddress}/price?chain=${BASE_CHAIN_ID}`,
        {
          headers: {
            'X-API-Key': MORALIS_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      // Get token metadata
      const metadataResponse = await fetch(
        `https://deep-index.moralis.io/api/v2.2/erc20/metadata?chain=${BASE_CHAIN_ID}&addresses%5B0%5D=${tokenAddress}`,
        {
          headers: {
            'X-API-Key': MORALIS_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!priceResponse.ok || !metadataResponse.ok) {
        console.error('❌ [MORALIS] API Error');
        return null;
      }

      const priceData = await priceResponse.json();
      const metadataData = await metadataResponse.json();

      console.log('✅ [MORALIS] Stats data:', { priceData, metadataData });

      const tokenInfo = metadataData[0];
      const totalSupply = tokenInfo?.total_supply || '1000000000000000000000000000'; // 1B tokens default

      // Calculate market cap (price * total supply)
      const price = parseFloat(priceData.nativePrice?.value || '0');
      const supply = parseFloat(totalSupply) / Math.pow(10, tokenInfo?.decimals || 18);
      const marketCap = price * supply;

      return {
        tokenAddress,
        price: priceData.nativePrice?.value || '0',
        marketCap: marketCap.toString(),
        volume24h: '0', // Moralis doesn't provide 24h volume in basic plan
        priceChange24h: 0, // Would need historical data
        holders: 0, // Would need separate API call
      };
    } catch (error) {
      console.error('❌ [MORALIS] Error fetching token stats:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getTokenHolders = async (tokenAddress: string, limit: number = 20) => {
    try {
      setLoading(true);
      console.log('👥 [MORALIS] Getting token holders for:', tokenAddress);

      const response = await fetch(
        `https://deep-index.moralis.io/api/v2.2/erc20/${tokenAddress}/owners?chain=${BASE_CHAIN_ID}&limit=${limit}&order=DESC`,
        {
          headers: {
            'X-API-Key': MORALIS_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error('❌ [MORALIS] Holders API Error:', response.status);
        return [];
      }

      const data = await response.json();
      console.log('✅ [MORALIS] Holders data:', data);

      return data.result || [];
    } catch (error) {
      console.error('❌ [MORALIS] Error fetching holders:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  return {
    getTokenPrice,
    getTokenStats,
    getTokenHolders,
    loading,
  };
};