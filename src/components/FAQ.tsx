import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: "What is Tota Vault?",
    answer: "Tota Vault is a decentralized platform to create and trade memecoins on the BNB Chain. We use automated bonding curves to ensure fair launches and instant liquidity."
  },
  {
    question: "How does the bonding curve work?",
    answer: "The bonding curve is a mathematical algorithm that determines the token price based on supply and demand. The more tokens are bought, the higher the price. When tokens are sold, the price decreases automatically."
  },
  {
    question: "How much does it cost to create a token?",
    answer: "It costs 0.0032 BNB to create a token. This fee covers gas costs and helps prevent spam on the platform."
  },
  {
    question: "What happens when a token 'graduates'?",
    answer: "When a token reaches the on-chain graduation target in the bonding curve, it automatically 'graduates' to PancakeSwap, gaining permanent liquidity and greater exposure."
  },
  {
    question: "What are the trading fees?",
    answer:
      "During the bonding-curve phase, fees are intentionally minimal: 0.01% goes to the protocol and 0.01% goes to the token creator (0.02% total). Fees are applied automatically on each buy/sell."
  },
  {
    question: "How do creator tokens work?",
    answer:
      "All 1B tokens start on the bonding curve (no separate creator allocation). When the token graduates to PancakeSwap, any leftover tokens that weren’t needed are automatically burned."
  },
  {
    question: "Is it safe to use the platform?",
    answer: "Yes! Our contracts are audited and follow industry security standards. All code is open-source and verified on the blockchain."
  },
  {
    question: "Can banned tokens still be traded?",
    answer: "Banned tokens only allow selling. This protects new investors while allowing existing holders to exit their positions."
  },
  {
    question: "How do I connect my wallet?",
    answer: "Click 'Connect Wallet' and make sure you are on BNB Chain. The platform will automatically prompt you to switch networks if necessary."
  },
  {
    question: "Can I create as many tokens as I want?",
    answer: "Yes! There is no limit to the number of tokens you can create — you just pay the creation fee each time."
  }
];

export const FAQ: React.FC = () => {
  const [openItems, setOpenItems] = useState<number[]>([]);

  const toggleItem = (index: number) => {
    setOpenItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <div className="flex justify-center mb-6">
          <div className="bg-vault-primary p-4 rounded-2xl">
            <HelpCircle className="h-8 w-8 text-black" />
          </div>
        </div>
        <h1 className="text-4xl font-magistral font-bold text-white mb-4">
          Frequently Asked Questions
        </h1>
        <p className="text-xl text-gray-400">
          Everything you need to know about Tota Vault
        </p>
      </div>

      <div className="space-y-4">
        {faqData.map((item, index) => (
          <div
            key={index}
            className="bg-zinc-900 rounded-2xl border border-zinc-700 overflow-hidden"
          >
            <button
              onClick={() => toggleItem(index)}
              className="w-full px-6 py-5 text-left flex items-center justify-between hover:bg-zinc-800 transition-colors duration-200"
            >
              <h3 className="text-white font-semibold text-lg pr-4">
                {item.question}
              </h3>
              {openItems.includes(index) ? (
                <ChevronUp className="h-5 w-5 text-vault-primary flex-shrink-0" />
              ) : (
                <ChevronDown className="h-5 w-5 text-vault-primary flex-shrink-0" />
              )}
            </button>
            
            {openItems.includes(index) && (
              <div className="px-6 pb-5 border-t border-zinc-700">
                <p className="text-gray-300 leading-relaxed pt-4">
                  {item.answer}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-12 bg-zinc-900 rounded-2xl p-8 border border-zinc-700">
        <h3 className="text-2xl font-bold text-vault-primary mb-4">
          Still have questions?
        </h3>
        <p className="text-gray-300 mb-6">
          Our community is always ready to help! Reach out to us anytime.
        </p>
        <div className="flex flex-wrap gap-4">
          <a
            href="https://t.me/vaulttotakeke"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-vault-primary hover:bg-vault-primary-hover text-black font-semibold rounded-xl transition-colors duration-200"
          >
            Telegram
          </a>
          <a
            href="https://twitter.com/vaulttotakeke"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-white font-semibold rounded-xl transition-colors duration-200"
          >
            Twitter
          </a>
        </div>
      </div>
    </div>
  );
};
