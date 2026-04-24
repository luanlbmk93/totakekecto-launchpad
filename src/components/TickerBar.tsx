// src/components/TickerBar.tsx
import React from "react";
import { useTickerFeed } from "../hooks/useTickerFeed";

const Dot = () => <span className="mx-3 opacity-30">•</span>;

export default function TickerBar() {
  const { feed } = useTickerFeed();

  if (!feed.length) {
    return (
      <div className="w-full bg-black/90 border-b border-white/10 sticky top-0 z-50 text-center text-gray-500 text-xs py-1">
        Live trades sync shortly — browse tokens below.
      </div>
    );
  }

  return (
    <div className="w-full bg-black/90 border-b border-white/10 sticky top-0 z-50 overflow-hidden">
      <div className="relative whitespace-nowrap">
        <div
          className="inline-block animate-[marquee_25s_linear_infinite]"
          style={{ paddingRight: 40 }}
        >
          {feed.map((t) => (
            <span
              key={t.txHash + t.side}
              className="inline-flex items-center px-3 py-1 text-sm text-gray-200"
            >
              <span className="font-mono text-gray-400">
                {t.user.slice(0, 6)}...{t.user.slice(-4)}
              </span>
              <Dot />
              <span
                className={
                  t.side === "buy" ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"
                }
              >
                {t.side === "buy" ? "Bought" : "Sold"}
              </span>
              <span className="mx-1 text-white font-medium">{t.ethAmount.toFixed(3)} ETH</span>
              <span className="mx-1 text-gray-400">
                ≈ {t.tokenAmount.toFixed(2)} {t.symbol || "TOKEN"}
              </span>
              <Dot />
            </span>
          ))}
          {/* duplicate for infinite loop */}
          {feed.map((t) => (
            <span
              key={t.txHash + t.side + "-dup"}
              className="inline-flex items-center px-3 py-1 text-sm text-gray-200"
            >
              <span className="font-mono text-gray-400">
                {t.user.slice(0, 6)}...{t.user.slice(-4)}
              </span>
              <Dot />
              <span
                className={
                  t.side === "buy" ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"
                }
              >
                {t.side === "buy" ? "Bought" : "Sold"}
              </span>
              <span className="mx-1 text-white font-medium">{t.ethAmount.toFixed(3)} ETH</span>
              <span className="mx-1 text-gray-400">
                ≈ {t.tokenAmount.toFixed(2)} {t.symbol || "TOKEN"}
              </span>
              <Dot />
            </span>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
