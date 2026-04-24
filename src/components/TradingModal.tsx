import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Calculator } from 'lucide-react';
import { TokenInfo, useContracts } from '../hooks/useContracts';
import { useWeb3 } from '../hooks/useWeb3';

interface TradingModalProps {
  token: TokenInfo;
  onClose: () => void;
  onSuccess: () => void;
}

export const TradingModal: React.FC<TradingModalProps> = ({ token, onClose, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [estimatedOutput, setEstimatedOutput] = useState('0');

  const { buyToken, sellToken, getBuyAmount, getSellAmount, loading } = useContracts();
  const { account } = useWeb3();

  const isBanned = (token as any).isBanned;

  useEffect(() => {
    const calculateEstimate = async () => {
      if (!amount || parseFloat(amount) <= 0) {
        setEstimatedOutput('0');
        return;
      }

      try {
        if (activeTab === 'buy') {
          const estimate = await getBuyAmount(token.tokenAddress, amount);
          setEstimatedOutput(estimate);
        } else {
          const estimate = await getSellAmount(token.tokenAddress, amount);
          setEstimatedOutput(estimate);
        }
      } catch (error) {
        setEstimatedOutput('0');
      }
    };

    const debounceTimer = setTimeout(calculateEstimate, 300);
    return () => clearTimeout(debounceTimer);
  }, [amount, activeTab, token.tokenAddress, getBuyAmount, getSellAmount]);

  const handleTrade = async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    let result;
    if (activeTab === 'buy') {
      result = await buyToken(token.tokenAddress, amount);
    } else {
      result = await sellToken(token.tokenAddress, amount);
    }

    if (result) {
      setAmount('');
      setEstimatedOutput('0');
      onSuccess();
      onClose();
    }
  };

  const formatNumber = (num: string) => {
    const n = parseFloat(num);
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(2) + 'K';
    return n.toFixed(6);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 rounded-2xl max-w-md w-full border border-zinc-700">
        <div className="flex justify-between items-center p-6 border-b border-zinc-700">
          <div className="flex items-center space-x-3">
            <img
              src={token.imageUrl}
              alt={token.name}
              className="w-10 h-10 rounded-full border-2 border-zinc-600"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'https://images.pexels.com/photos/844124/pexels-photo-844124.jpeg?auto=compress&cs=tinysrgb&w=100';
              }}
            />
            <div>
              <h3 className="text-white font-semibold">{token.name}</h3>
              <p className="text-vault-primary font-semibold">${token.symbol}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors duration-200 p-2 hover:bg-zinc-700 rounded-lg"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {/* Tabs */}
          <div className="flex bg-zinc-800 rounded-xl p-1 mb-6 border border-zinc-600">
            <button
              onClick={() => setActiveTab('buy')}
              disabled={isBanned}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg transition-colors duration-200 ${
                activeTab === 'buy' 
                  ? 'bg-green-600 text-white' 
                  : isBanned 
                    ? 'text-gray-500 cursor-not-allowed'
                    : 'text-gray-300 hover:text-white hover:bg-zinc-700'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              <span>Buy</span>
            </button>
            <button
              onClick={() => setActiveTab('sell')}
              className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg transition-colors duration-200 ${
                activeTab === 'sell' 
                  ? 'bg-red-500 text-white' 
                  : 'text-gray-300 hover:text-white hover:bg-zinc-700'
              }`}
            >
              <TrendingDown className="h-4 w-4" />
              <span>Sell</span>
            </button>
          </div>

          {isBanned && activeTab === 'buy' && (
            <div className="mb-4 p-4 bg-red-900/30 border border-red-600 rounded-xl">
              <p className="text-red-400 text-center">
                ⚠️ Token banned — only sells allowed
              </p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block font-semibold text-gray-300 mb-2">
                {activeTab === 'buy' ? 'BNB Amount' : `${token.symbol} Amount`}
              </label>
              <input
                type="number"
                step="0.000001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isBanned && activeTab === 'buy'}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-vault-primary focus:border-vault-primary"
                placeholder={activeTab === 'buy' ? '0.1' : '1000'}
              />
            </div>

            {amount && parseFloat(amount) > 0 && (
              <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-600">
                <div className="flex items-center space-x-2 mb-3">
                  <Calculator className="h-5 w-5 text-vault-primary" />
                  <span className="text-gray-300">Estimated Output</span>
                </div>
                <p className="text-vault-primary font-bold text-xl">
                  {formatNumber(estimatedOutput)} {activeTab === 'buy' ? token.symbol : 'ETH'}
                </p>
              </div>
            )}

            <button
              onClick={handleTrade}
              disabled={loading || !amount || parseFloat(amount) <= 0 || (isBanned && activeTab === 'buy')}
              className={`w-full px-6 py-3 font-semibold rounded-xl transition-all duration-200 disabled:cursor-not-allowed ${
                activeTab === 'buy'
                  ? isBanned
                    ? 'bg-zinc-700 cursor-not-allowed text-gray-400'
                    : 'bg-green-600 hover:bg-green-700 disabled:bg-zinc-600 text-white hover:shadow-[0_0_15px_#00ff0040]'
                  : 'bg-red-600 hover:bg-red-700 disabled:bg-zinc-600 text-white hover:shadow-[0_0_15px_#ff004040]'
              }`}
            >
              {loading 
                ? (activeTab === 'buy' ? 'Buying...' : 'Selling...') 
                : (activeTab === 'buy' 
                    ? (isBanned ? 'Token Banned' : 'Buy Tokens') 
                    : 'Sell Tokens'
                  )
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};