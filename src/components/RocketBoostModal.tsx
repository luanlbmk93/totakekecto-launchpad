import React, { useState, useEffect } from 'react';
import { X, Rocket, Zap, Calculator, AlertTriangle, RefreshCw } from 'lucide-react';
import { useRocketBoost } from '../hooks/useRocketBoost';
import { TokenInfo } from '../hooks/useContracts';
import { ROCKET_BOOST_ADDRESS } from '../contracts/rocketBoostABI';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';

interface RocketBoostModalProps {
  token: TokenInfo;
  onClose: () => void;
  onSuccess: () => void;
}

export const RocketBoostModal: React.FC<RocketBoostModalProps> = ({ token, onClose, onSuccess }) => {
  const [points, setPoints] = useState('100');
  const [config, setConfig] = useState<any>(null);
  const [currentScore, setCurrentScore] = useState(0);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  const { buyRocketBoost, getRocketConfig, getRocketScore, loading } = useRocketBoost();

  // Error boundary effect
  useEffect(() => {
    const handleError = (error: any) => {
      console.error('🚀 [MODAL ERROR]:', error);
      setHasError(true);
      setError(error.message || 'Unknown error occurred');
      setLoadingConfig(false);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      if (hasError) return;
      
      console.log('🚀 [MODAL] Loading rocket data for token:', token.tokenAddress);
      setLoadingConfig(true);
      setError(null);
      
      try {
        if (!token || !token.tokenAddress || token.tokenAddress === '0x0000000000000000000000000000000000000000') {
          throw new Error('Invalid token address');
        }

        console.log('🚀 [MODAL] Loading config...');
        const configData = await getRocketConfig();
        
        if (!configData) {
          console.error('🚀 [MODAL] Failed to load config');
          setError('RocketBoost contract not available on this network');
          setLoadingConfig(false);
          return;
        }
        
        console.log('🚀 [MODAL] Config loaded:', configData);
        setConfig(configData);
        
        console.log('🚀 [MODAL] Loading current score...');
        const score = await getRocketScore(token.tokenAddress);
        console.log('🚀 [MODAL] Current score:', score);
        setCurrentScore(score);
        
      } catch (error: any) {
        console.error('🚀 [MODAL] Error loading data:', error);
        setError(error.message || 'Failed to load RocketBoost data');
        setHasError(true);
      } finally {
        setLoadingConfig(false);
      }
    };

    if (token && token.tokenAddress) {
      loadData();
    } else {
      setError('Invalid token data');
      setLoadingConfig(false);
    }
  }, [token?.tokenAddress, hasError]);

  const handlePurchase = async () => {
    if (hasError || !config) {
      toast.error('RocketBoost not available');
      return;
    }

    const pointsNum = parseInt(points);
    if (!pointsNum || pointsNum <= 0) {
      toast.error('Please enter a valid number of points');
      return;
    }
    
    if (config && pointsNum > config.maxPoints) {
      toast.error(`Maximum ${config.maxPoints} points per transaction`);
      return;
    }

    console.log('🚀 [MODAL] Starting purchase:', { tokenAddress: token.tokenAddress, points: pointsNum });
    
    try {
      const success = await buyRocketBoost(token.tokenAddress, pointsNum);
      if (success) {
        onSuccess();
        onClose();
      }
    } catch (error: any) {
      console.error('🚀 [MODAL] Purchase error:', error);
      toast.error(error.message || 'Failed to purchase rocket boost');
    }
  };

  const calculateCost = () => {
    if (!config || !points || hasError) return '0';
    const pointsNum = parseInt(points);
    if (!pointsNum || pointsNum <= 0) return '0';
    
    try {
      const costWei = BigInt(pointsNum) * ethers.parseEther(config.pricePerPoint);
      return ethers.formatEther(costWei);
    } catch (error) {
      console.error('🚀 [MODAL] Cost calculation error:', error);
      return '0';
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const retryLoad = async () => {
    setHasError(false);
    setLoadingConfig(true);
    setError(null);
    
    try {
      const configData = await getRocketConfig();
      if (configData) {
        setConfig(configData);
        const score = await getRocketScore(token.tokenAddress);
        setCurrentScore(score);
      } else {
        setError('RocketBoost contract not available');
        setHasError(true);
      }
    } catch (error) {
      setError('Failed to connect to RocketBoost');
      setHasError(true);
    } finally {
      setLoadingConfig(false);
    }
  };

  // Safety check
  if (!token || !token.tokenAddress) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700 max-w-md w-full">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-bold text-lg">Invalid Token</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X className="h-6 w-6" />
            </button>
          </div>
          <p className="text-red-400 text-center">Token data is invalid or missing</p>
          <button
            onClick={onClose}
            className="w-full mt-4 px-4 py-2 bg-zinc-700 text-white rounded-xl"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (loadingConfig) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-zinc-900 rounded-2xl p-8 border border-zinc-700 max-w-md w-full">
          <div className="text-center">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 p-4 rounded-2xl mb-4 inline-block">
              <Rocket className="h-8 w-8 text-white animate-pulse" />
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Loading Rocket Boost...</h3>
            <p className="text-gray-400 text-sm mb-4">Connecting to RocketBoost contract...</p>
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-vault-primary mx-auto"></div>
            <p className="text-gray-500 text-xs mt-3">Contract: {ROCKET_BOOST_ADDRESS.slice(0, 10)}...{ROCKET_BOOST_ADDRESS.slice(-8)}</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || hasError) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-700 max-w-md w-full">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-bold text-lg">RocketBoost Error</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors duration-200"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          
          <div className="text-center py-4">
            <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <p className="text-red-400 font-semibold mb-2">Connection Failed</p>
            <p className="text-gray-300 text-sm mb-4">{error || 'Unknown error occurred'}</p>
            <p className="text-gray-500 text-xs mb-6">
              Contract: {ROCKET_BOOST_ADDRESS}
            </p>
            
            <div className="flex space-x-3">
              <button
                onClick={retryLoad}
                className="flex-1 px-4 py-2 bg-vault-primary hover:bg-vault-primary-hover text-black font-semibold rounded-xl transition-colors duration-200"
              >
                <RefreshCw className="h-4 w-4 inline mr-2" />
                Retry
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-xl transition-colors duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main modal
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 rounded-2xl max-w-md w-full border border-zinc-700">
        <div className="flex justify-between items-center p-6 border-b border-zinc-700">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-orange-500 to-red-500 p-3 rounded-xl">
              <Rocket className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">🚀 Rocket Boost</h3>
              <p className="text-gray-400 text-sm">{token.name} (${token.symbol})</p>
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
          {config?.paused && (
            <div className="mb-4 p-4 bg-red-900/30 border border-red-600 rounded-xl">
              <div className="flex items-center space-x-2 text-red-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-semibold">Rocket Boost Paused</span>
              </div>
              <p className="text-gray-300 text-sm mt-1">
                Rocket boost is temporarily disabled
              </p>
            </div>
          )}

          {/* Current Score */}
          <div className="mb-6 bg-zinc-800 rounded-xl p-4 border border-zinc-600">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Current Rocket Score:</span>
              <div className="flex items-center space-x-2">
                <Rocket className="h-4 w-4 text-orange-400" />
                <span className="text-orange-400 font-bold text-lg">
                  {formatNumber(currentScore)}
                </span>
              </div>
            </div>
          </div>

          {/* Purchase Form */}
          <div className="space-y-4">
            <div>
              <label className="block font-semibold text-gray-300 mb-2">
                Rocket Points to Buy
              </label>
              <input
                type="number"
                min="1"
                max={config?.maxPoints || 1000}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                disabled={config?.paused}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="100"
              />
              <p className="text-gray-400 text-sm mt-1">
                Max: {formatNumber(config?.maxPoints || 0)} points per transaction
              </p>
            </div>

            {points && parseInt(points) > 0 && config && (
              <div className="bg-zinc-800 rounded-xl p-4 border border-zinc-600">
                <div className="flex items-center space-x-2 mb-3">
                  <Calculator className="h-5 w-5 text-vault-primary" />
                  <span className="text-gray-300">Cost Breakdown</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Points:</span>
                    <span className="text-white font-semibold">{formatNumber(parseInt(points))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Price per point:</span>
                    <span className="text-white font-semibold">{parseFloat(config.pricePerPoint).toFixed(8)} BNB</span>
                  </div>
                  <div className="border-t border-zinc-600 pt-2">
                    <div className="flex justify-between">
                      <span className="text-gray-300 font-semibold">Total Cost:</span>
                      <span className="text-orange-400 font-bold text-lg">{calculateCost()} BNB</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Info Box */}
            <div className="bg-gradient-to-r from-orange-900/30 to-red-900/30 rounded-xl p-4 border border-orange-600">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="h-4 w-4 text-orange-400" />
                <span className="text-orange-400 font-semibold">How Rocket Boost Works</span>
              </div>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>• Boost your token's visibility in rankings</li>
                <li>• Points last for 24h, then reset to zero</li>
                <li>• Higher scores = better positioning</li>
                <li>• Compete with other tokens for top spots</li>
              </ul>
            </div>

            <button
              onClick={handlePurchase}
              disabled={loading || !points || parseInt(points) <= 0 || config?.paused || !config}
              className="w-full px-6 py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-600 text-white font-bold rounded-xl transition-all duration-200 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <Rocket className="h-5 w-5" />
              <span>
                {loading 
                  ? 'Launching Rocket...' 
                  : config?.paused 
                    ? 'Rocket Boost Paused'
                    : !config
                      ? 'Loading...'
                      : `🚀 Buy ${formatNumber(parseInt(points || '0'))} Points`
                }
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
