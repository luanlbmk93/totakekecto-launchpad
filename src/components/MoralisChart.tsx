import React, { useEffect, useRef } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';

interface MoralisChartProps {
  tokenAddress: string;
  tokenSymbol: string;
  isGraduated?: boolean;
  dexPair?: string;
  onStatsUpdate?: (stats: { currentPrice: string; marketCap: string; realETH: string }) => void;
}

const PRICE_CHART_ID = 'moralis-price-chart-widget';

export const MoralisChart: React.FC<MoralisChartProps> = ({ tokenAddress, tokenSymbol }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const DEBUG = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;

  useEffect(() => {
    if (typeof window === 'undefined' || !tokenAddress) return;

    if (DEBUG) console.log('🔄 [MORALIS] Loading chart for token:', tokenAddress);
    setLoading(true);
    setError(null);

    const loadWidget = () => {
      try {
        // Limpar container anterior
        const container = document.getElementById(PRICE_CHART_ID);
        if (container) {
          container.innerHTML = '';
        }

        if (typeof (window as any).createMyWidget === 'function') {
          if (DEBUG) console.log('✅ [MORALIS] Creating widget...');
          (window as any).createMyWidget(PRICE_CHART_ID, {
            width: '100%',
            height: '500px',
            chainId: '0x2105', // BASE Mainnet
            tokenAddress: tokenAddress,
            showHoldersChart: true,
            defaultInterval: '1D',
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Etc/UTC',
            theme: 'dark',
            locale: 'en',
            showCurrencyToggle: true,
            hideLeftToolbar: false,
            hideTopToolbar: false,
            hideBottomToolbar: false
          });
          setLoading(false);
          if (DEBUG) console.log('✅ [MORALIS] Widget created successfully');
        } else {
          console.error('❌ [MORALIS] createMyWidget function is not defined');
          setError('Chart widget not available');
          setLoading(false);
        }
      } catch (err) {
        console.error('❌ [MORALIS] Error creating widget:', err);
        setError('Failed to load chart');
        setLoading(false);
      }
    };

    // Verificar se o script já foi carregado
    const existingScript = document.getElementById('moralis-chart-widget');
    
    if (!existingScript) {
      if (DEBUG) console.log('📥 [MORALIS] Loading chart script...');
      const script = document.createElement('script');
      script.id = 'moralis-chart-widget';
      script.src = 'https://moralis.com/static/embed/chart.js';
      script.type = 'text/javascript';
      script.async = true;
      script.onload = () => {
        if (DEBUG) console.log('✅ [MORALIS] Script loaded successfully');
        setTimeout(loadWidget, 100); // Pequeno delay para garantir que a função esteja disponível
      };
      script.onerror = () => {
        console.error('❌ [MORALIS] Failed to load chart script');
        setError('Failed to load chart script');
        setLoading(false);
      };
      document.head.appendChild(script);
    } else {
      if (DEBUG) console.log('♻️ [MORALIS] Script already loaded, creating widget...');
      setTimeout(loadWidget, 100);
    }

    // Error handling para mensagens do widget
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MORALIS_WIDGET_ERROR') {
        console.error('❌ [MORALIS] Widget Error:', event.data);
        setError('Chart widget error: ' + (event.data.message || 'Unknown error'));
        setLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);

    // Cleanup function
    return () => {
      window.removeEventListener('message', handleMessage);
      const container = document.getElementById(PRICE_CHART_ID);
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [tokenAddress]);

  if (error) {
    return (
      <div className="bg-zinc-900/10 rounded-2xl p-6 border border-zinc-700/20">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-vault-primary">Price Chart</h3>
          <BarChart3 className="h-6 w-6 text-vault-primary" />
        </div>
        <div className="h-80 flex items-center justify-center">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 text-red-500 mx-auto mb-3" />
            <p className="text-red-400 mb-2">Chart Error</p>
            <p className="text-gray-500 text-sm">{error}</p>
            <p className="text-gray-500 text-xs mt-2">Token: {tokenAddress}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/10 rounded-2xl p-6 border border-zinc-700/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-bold text-vault-primary mb-2">Price Chart</h3>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-400">
              Powered by Moralis & TradingView
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {loading && (
            <RefreshCw className="h-4 w-4 text-vault-primary animate-spin" />
          )}
          <BarChart3 className="h-6 w-6 text-vault-primary" />
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="h-80 flex items-center justify-center bg-zinc-800 rounded-xl">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-vault-primary mx-auto mb-2"></div>
            <p className="text-gray-400 text-sm">Loading Moralis Chart...</p>
            <p className="text-gray-500 text-xs mt-1">Connecting to TradingView...</p>
          </div>
        </div>
      )}

      {/* Chart Container */}
      <div 
        className={`w-full ${loading ? 'hidden' : 'block'}`}
        style={{ minHeight: '500px' }}
      >
        <div
          id={PRICE_CHART_ID}
          ref={containerRef}
          className="w-full rounded-xl overflow-hidden"
          style={{ height: '500px' }}
        />
      </div>

      {/* Info Footer */}
      <div className="mt-4 text-xs text-gray-500 text-center">
        <p>Real-time data from BASE blockchain • Token: {tokenSymbol}</p>
        <p className="mt-1">Chart powered by Moralis API & TradingView</p>
      </div>
    </div>
  );
};