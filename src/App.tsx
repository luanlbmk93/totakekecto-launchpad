import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Toaster } from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { TokenList } from './components/TokenList';
import { TokenDetail } from './components/TokenDetail';
import { CreateTokenForm } from './components/CreateTokenForm';
import { FAQ } from './components/FAQ';
import { Terms } from './components/Terms';
import { PlatformLock } from './components/PlatformLock';
import { CreatorPanel } from './components/CreatorPanel';
import { AdminDashboard } from './components/AdminDashboard';
import { useWeb3 } from './hooks/useWeb3';
import { CONTRACT_ADDRESSES, TOKEN_FACTORY_ABI } from './contracts/contractAddresses';
import { getBscReadRpcUrl } from './config/bscReadRpc';

export type AppView =
  | 'home'
  | 'create'
  | 'detail'
  | 'faq'
  | 'terms'
  | 'lock'
  | 'creator'
  | 'admin';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [tokens, setTokens] = useState<any[]>([]);
  const [showRocketBoost, setShowRocketBoost] = useState(false);
  const [selectedTokenForRocket, setSelectedTokenForRocket] = useState<any>(null);
  const [factoryOwner, setFactoryOwner] = useState<string | null>(null);

  const { account } = useWeb3();

  // Read factory owner once on mount (public RPC, no wallet needed) so we can decide
  // whether to show the hidden admin icon at the bottom of the page.
  useEffect(() => {
    let cancelled = false;
    const readOwner = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(getBscReadRpcUrl());
        const factory = new ethers.Contract(
          CONTRACT_ADDRESSES.TOKEN_FACTORY,
          TOKEN_FACTORY_ABI,
          provider,
        );
        const o = String(await factory.owner());
        if (!cancelled) setFactoryOwner(o);
      } catch (e) {
        if (!cancelled) setFactoryOwner(null);
      }
    };
    void readOwner();
    return () => {
      cancelled = true;
    };
  }, []);

  const isPlatformOwner =
    !!account &&
    !!factoryOwner &&
    account.toLowerCase() === factoryOwner.toLowerCase();

  const updateURL = (view: string, tokenAddress?: string) => {
    let newPath = '/';

    switch (view) {
      case 'create':
        newPath = '/create';
        break;
      case 'faq':
        newPath = '/faq';
        break;
      case 'terms':
        newPath = '/terms';
        break;
      case 'lock':
        newPath = '/lock';
        break;
      case 'creator':
        newPath = '/creator';
        break;
      case 'admin':
        newPath = '/admin';
        break;
      case 'detail':
        if (tokenAddress) {
          newPath = `/token/${tokenAddress}`;
        }
        break;
      default:
        newPath = '/';
    }

    window.history.pushState({}, '', newPath);
  };

  const navigateWithURL = (view: AppView, tokenAddress?: string) => {
    setCurrentView(view);
    if (view === 'detail' && tokenAddress) {
      setSelectedToken(tokenAddress);
    }
    updateURL(view, tokenAddress);
  };

  const resolveViewFromPath = (path: string): AppView | { view: 'detail'; token: string } | null => {
    if (path === '/whitepaper' || path === '/' || path === '') return 'home';
    if (path === '/create') return 'create';
    if (path === '/faq') return 'faq';
    if (path === '/terms') return 'terms';
    if (path === '/lock') return 'lock';
    // Keep '/factory' as a backward-compatible alias for the new creator page.
    if (path === '/creator' || path === '/factory') return 'creator';
    if (path === '/admin') return 'admin';
    if (path.startsWith('/token/')) {
      const tokenAddress = path.replace('/token/', '');
      if (tokenAddress && tokenAddress.length === 42) {
        return { view: 'detail', token: tokenAddress };
      }
      return 'home';
    }
    return 'home';
  };

  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/whitepaper') {
      window.history.replaceState({}, '', '/');
      setCurrentView('home');
      return;
    }
    const resolved = resolveViewFromPath(path);
    if (!resolved) return;
    if (typeof resolved === 'string') {
      setCurrentView(resolved);
    } else {
      setCurrentView(resolved.view);
      setSelectedToken(resolved.token);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/whitepaper') {
        window.history.replaceState({}, '', '/');
        setCurrentView('home');
        return;
      }
      const resolved = resolveViewFromPath(path);
      if (!resolved) return;
      if (typeof resolved === 'string') {
        setCurrentView(resolved);
      } else {
        setCurrentView(resolved.view);
        setSelectedToken(resolved.token);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTokenSelect = (tokenAddress: string) => {
    navigateWithURL('detail', tokenAddress);
  };

  const handleCreateSuccess = () => {
    navigateWithURL('home');
  };

  const handleTokenCreated = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleRocketBoost = (token: any) => {
    setSelectedTokenForRocket(token);
    setShowRocketBoost(true);
  };

  // Keep the unused setters/state referenced (avoid TS unused warnings without changing behavior).
  void showRocketBoost;
  void selectedTokenForRocket;

  const renderContent = () => {
    switch (currentView) {
      case 'create':
        return (
          <section aria-label="Create token" className="max-w-2xl mx-auto">
            <CreateTokenForm onSuccess={handleCreateSuccess} onTokenCreated={handleTokenCreated} />
          </section>
        );
      case 'detail':
        return <TokenDetail tokenAddress={selectedToken} onBack={() => navigateWithURL('home')} />;
      case 'faq':
        return <FAQ />;
      case 'terms':
        return <Terms />;
      case 'lock':
        return (
          <section aria-label="Platform lock" className="max-w-4xl mx-auto">
            <PlatformLock />
          </section>
        );
      case 'creator':
        return (
          <section aria-label="My coins" className="max-w-6xl mx-auto">
            <CreatorPanel />
          </section>
        );
      case 'admin':
        if (!isPlatformOwner) {
          return (
            <section aria-label="Admin" className="max-w-xl mx-auto rounded-2xl p-8 border border-red-500/30 bg-[#11161D] text-center">
              <h1 className="text-xl font-bold text-white mb-2">Restricted area</h1>
              <p className="text-[#9CA3AF] text-sm">
                This page is only available to the platform owner.
              </p>
            </section>
          );
        }
        return (
          <section aria-label="Admin dashboard" className="max-w-6xl mx-auto">
            <AdminDashboard />
          </section>
        );
      default:
        return (
          <>
            <section aria-label="Hero">
              <Hero
                onNavigate={navigateWithURL}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                tokens={tokens}
                onTokenSelect={handleTokenSelect}
                onRocketBoost={handleRocketBoost}
              />
            </section>
            <section aria-label="Tokens and activity" className="mt-8 pt-2">
              <TokenList
                onTokenSelect={handleTokenSelect}
                refreshTrigger={refreshTrigger}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                onTokensLoaded={setTokens}
              />
            </section>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F14] text-white flex flex-col">
      <Header currentView={currentView} onNavigate={navigateWithURL} />

      <main className="w-[90%] max-w-[1600px] mx-auto px-4 py-6 flex-1">{renderContent()}</main>

      <footer className="mt-auto border-t border-[#1F2937] bg-[#0B0F14]/80">
        <div className="w-[90%] max-w-[1600px] mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[#6B7280]">© Tota Vault</p>

          <div className="flex items-center gap-2">
            <a
              href="https://x.com/Totavault"
              target="_blank"
              rel="noopener noreferrer"
              title="Tota Vault on X"
              aria-label="Tota Vault on X"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#2A3442] bg-[#11161D] text-[#9CA3AF] transition-colors hover:border-vault-primary/60 hover:text-vault-primary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M18.244 2H21.5l-7.51 8.59L22.5 22h-6.844l-5.36-7.01L4.2 22H.94l8.06-9.22L1.5 2h7.02l4.84 6.39L18.244 2zm-1.2 18h1.86L7.06 4H5.1l11.944 16z" />
              </svg>
            </a>

            <a
              href="https://t.me/TOTAVAULT_Official"
              target="_blank"
              rel="noopener noreferrer"
              title="Tota Vault on Telegram"
              aria-label="Tota Vault on Telegram"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#2A3442] bg-[#11161D] text-[#9CA3AF] transition-colors hover:border-vault-primary/60 hover:text-vault-primary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.146.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.022c.242-.213-.054-.334-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.658-.643.135-.953l11.566-4.458c.538-.196 1.006.128.832.938z" />
              </svg>
            </a>

            {isPlatformOwner && (
              <button
                type="button"
                onClick={() => navigateWithURL('admin')}
                title="Platform admin"
                aria-label="Platform admin"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/5 text-red-300 hover:bg-red-500/10 transition-colors text-xs"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin
              </button>
            )}
          </div>
        </div>
      </footer>

      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#11161D',
            color: '#fff',
            border: '1px solid #1F2937',
            boxShadow: '0 0 0 1px rgba(222, 191, 149, 0.25)',
          },
        }}
      />
    </div>
  );
}
