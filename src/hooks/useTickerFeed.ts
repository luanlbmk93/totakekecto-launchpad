// src/hooks/useTickerFeed.ts
import { useMemo } from "react";
import { useGlobalTrades } from "./useGlobalTrades";

/**
 * Feed leve para o ticker superior.
 * Importante: evita varrer eventos por token (caríssimo) e evita chamar hooks dentro de loops.
 */
export const useTickerFeed = () => {
  const { trades } = useGlobalTrades();

  const feed = useMemo(() => {
    // normaliza para o formato que o TickerBar espera
    return (trades || [])
      .filter((t) => t.side === "buy" || t.side === "sell")
      .map((t) => ({
        side: t.side,
        user: t.user,
        tokenAddress: t.tokenAddress,
        symbol: t.tokenSymbol,
        name: t.tokenName,
        ethAmount: t.ethAmount ?? 0,
        tokenAmount: t.tokenAmount ?? 0,
        txHash: t.txHash,
        timestamp: t.timestamp,
      }))
      .slice(0, 10);
  }, [trades]);

  return { feed, loading: false };
};
