import React from "react";
import { useGlobalTrades } from "../hooks/useGlobalTrades";

interface EventTickerProps {
  limit?: number;
}

export const EventTicker: React.FC<EventTickerProps> = ({ limit = 5 }) => {
  const { trades } = useGlobalTrades(); // 🔑 puxa trades globais com janela de blocos

  const buySell = (trades || []).filter((t) => t.side === "buy" || t.side === "sell");
  if (buySell.length === 0) return null;

  const latest = buySell.slice(0, limit);

  return (
    <div className="w-full flex gap-2 overflow-x-auto no-scrollbar px-4 py-2">
      {latest.map((t, i) => (
        <div
          key={t.txHash + "-" + i}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
            t.side === "buy"
              ? "bg-emerald-500/20 border border-emerald-500 text-emerald-300"
              : "bg-red-500/20 border border-red-500 text-red-300"
          }`}
        >
          <span className="font-mono">
            {t.user.slice(0, 6)}...{t.user.slice(-4)}
          </span>{" "}
          {t.side === "buy" ? "comprou" : "vendeu"}{" "}
          <span className="text-white">{t.tokenSymbol || "TOKEN"}</span>
        </div>
      ))}
    </div>
  );
};
