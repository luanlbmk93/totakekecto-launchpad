import React, { useState } from 'react';
import { Home, HelpCircle, FileText, Menu, X, Plus, Lock, User } from 'lucide-react';
import ConnectButton from './ConnectButton';
import type { AppView } from '../App';

interface HeaderProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onNavigate }) => {
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  return (
    <header className="bg-[#0B0F14]/95 backdrop-blur-xl sticky top-0 z-40 border-b border-[#1F2937]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 min-h-[3.75rem] py-2 md:min-h-[4rem]">
          {/* Logo */}
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="col-start-1 row-start-1 text-left text-white hover:text-neon-blue transition-colors duration-200 min-w-0 pr-2"
          >
            <span className="inline-flex items-center gap-1.5 sm:gap-2 min-w-0 text-base sm:text-lg md:text-xl lg:text-2xl font-[FugazOne] font-bold text-[#DCC5A0] tracking-tight">
              <span className="truncate">Tota</span>
              <img
                src="/assets/logo.png"
                alt=""
                className="h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 shrink-0 object-contain"
                width={36}
                height={36}
              />
              <span className="truncate">Vault</span>
            </span>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex col-start-2 row-start-1 items-center justify-center gap-x-1 lg:gap-x-2 min-w-0 mx-1 overflow-x-auto [scrollbar-width:thin] py-1">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className={`flex shrink-0 items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs lg:text-sm transition-colors duration-200 ${
                currentView === 'home'
                  ? 'bg-vault-primary text-[#0B0F14]'
                  : 'text-white hover:text-vault-primary hover:bg-[#11161D]'
              }`}
            >
              <Home className="h-4 w-4 shrink-0" />
              Home
            </button>

            <button
              type="button"
              onClick={() => onNavigate('create')}
              className={`flex shrink-0 items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs lg:text-sm transition-colors duration-200 ${
                currentView === 'create'
                  ? 'bg-[#A855F7] text-white'
                  : 'text-white hover:text-vault-primary hover:bg-[#11161D]'
              }`}
            >
              <Plus className="h-4 w-4 shrink-0" />
              Launch
            </button>

            <button
              type="button"
              onClick={() => onNavigate('lock')}
              className={`flex shrink-0 items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs lg:text-sm transition-colors duration-200 ${
                currentView === 'lock'
                  ? 'bg-vault-primary text-[#0B0F14]'
                  : 'text-white hover:text-vault-primary hover:bg-[#11161D]'
              }`}
            >
              <Lock className="h-4 w-4 shrink-0" />
              Lock
            </button>

            <button
              type="button"
              onClick={() => onNavigate('creator')}
              className={`flex shrink-0 items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs lg:text-sm transition-colors duration-200 ${
                currentView === 'creator'
                  ? 'bg-vault-primary text-[#0B0F14]'
                  : 'text-white hover:text-vault-primary hover:bg-[#11161D]'
              }`}
            >
              <User className="h-4 w-4 shrink-0" />
              My coins
            </button>

            <button
              type="button"
              onClick={() => onNavigate('faq')}
              className={`flex shrink-0 items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs lg:text-sm transition-colors duration-200 ${
                currentView === 'faq'
                  ? 'bg-neon-blue text-absolute-black'
                  : 'text-white hover:text-vault-primary hover:bg-[#11161D]'
              }`}
            >
              <HelpCircle className="h-4 w-4 shrink-0" />
              FAQ
            </button>

            <button
              type="button"
              onClick={() => onNavigate('terms')}
              className={`flex shrink-0 items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs lg:text-sm transition-colors duration-200 ${
                currentView === 'terms'
                  ? 'bg-neon-blue text-absolute-black'
                  : 'text-white hover:text-neon-blue hover:bg-dark-gray'
              }`}
            >
              <FileText className="h-4 w-4 shrink-0" />
              Terms
            </button>
          </nav>

          {/* Wallet + socials + mobile menu — always right-aligned */}
          <div className="col-start-2 row-start-1 justify-self-end md:col-start-3 flex items-center gap-2 shrink-0">
            {/* Socials — hidden on smallest screens to keep header compact */}
            <div className="hidden sm:flex items-center gap-1.5">
              <a
                href="https://x.com/Totavault"
                target="_blank"
                rel="noopener noreferrer"
                title="Tota Vault on X"
                aria-label="Tota Vault on X"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#DEBF95]/40 bg-[#11161D] text-[#F5E6C8] transition-colors hover:border-[#DEBF95] hover:bg-[#DEBF95] hover:text-[#0B0F14]"
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#DEBF95]/40 bg-[#11161D] text-[#F5E6C8] transition-colors hover:border-[#DEBF95] hover:bg-[#DEBF95] hover:text-[#0B0F14]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                </svg>
              </a>
            </div>

            <div className="[&_button]:!rounded-xl [&_button]:!border-[#DEBF95]/80 [&_button]:!bg-[#11161D] [&_button]:!text-[#F5E6C8] [&_button]:hover:!bg-[#DEBF95] [&_button]:hover:!text-[#0B0F14]">
              <ConnectButton />
            </div>

            <button
              type="button"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden p-2 text-white hover:text-vault-primary hover:bg-[#11161D] rounded-xl transition-colors shrink-0"
              aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
            >
              {showMobileMenu ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {showMobileMenu && (
          <div className="md:hidden bg-absolute-black border-t border-[#1F2937] py-4">
            <div className="space-y-2">
              <button
                onClick={() => {
                  onNavigate('home');
                  setShowMobileMenu(false);
                }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
                  currentView === 'home'
                    ? 'bg-neon-blue text-absolute-black'
                    : 'text-white hover:text-neon-blue hover:bg-dark-gray'
                }`}
              >
                <Home className="h-5 w-5" />
                <span>Home</span>
              </button>

              <button
                onClick={() => {
                  onNavigate('create');
                  setShowMobileMenu(false);
                }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
                  currentView === 'create'
                    ? 'bg-vault-secondary text-white'
                    : 'text-white hover:text-vault-secondary hover:bg-dark-gray'
                }`}
              >
                <Plus className="h-5 w-5" />
                <span>Launch</span>
              </button>

              <button
                onClick={() => {
                  onNavigate('lock');
                  setShowMobileMenu(false);
                }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
                  currentView === 'lock'
                    ? 'bg-vault-primary text-[#0B0F14]'
                    : 'text-white hover:text-vault-primary hover:bg-dark-gray'
                }`}
              >
                <Lock className="h-5 w-5" />
                <span>Lock</span>
              </button>

              <button
                onClick={() => {
                  onNavigate('creator');
                  setShowMobileMenu(false);
                }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
                  currentView === 'creator'
                    ? 'bg-vault-primary text-[#0B0F14]'
                    : 'text-white hover:text-vault-primary hover:bg-dark-gray'
                }`}
              >
                <User className="h-5 w-5" />
                <span>My coins</span>
              </button>

              <div className="border-t border-neon-blue/30 pt-2 mt-2">
                <button
                  onClick={() => {
                    onNavigate('faq');
                    setShowMobileMenu(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
                    currentView === 'faq' ? 'text-neon-blue' : 'text-white hover:text-neon-blue hover:bg-dark-gray'
                  }`}
                >
                  <HelpCircle className="h-5 w-5" />
                  <span>FAQ</span>
                </button>

                <button
                  onClick={() => {
                    onNavigate('terms');
                    setShowMobileMenu(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors duration-200 ${
                    currentView === 'terms' ? 'text-neon-blue' : 'text-white hover:text-neon-blue hover:bg-dark-gray'
                  }`}
                >
                  <FileText className="h-5 w-5" />
                  <span>Terms of Use</span>
                </button>
              </div>

              {/* Socials */}
              <div className="border-t border-[#1F2937] pt-3 mt-3 flex items-center justify-center gap-3">
                <a
                  href="https://x.com/Totavault"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Tota Vault on X"
                  aria-label="Tota Vault on X"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#DEBF95]/40 bg-[#11161D] text-[#F5E6C8] transition-colors hover:border-[#DEBF95] hover:bg-[#DEBF95] hover:text-[#0B0F14] text-sm"
                  onClick={() => setShowMobileMenu(false)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M18.244 2H21.5l-7.51 8.59L22.5 22h-6.844l-5.36-7.01L4.2 22H.94l8.06-9.22L1.5 2h7.02l4.84 6.39L18.244 2z" />
                  </svg>
                  <span>X (Twitter)</span>
                </a>

                <a
                  href="https://t.me/TOTAVAULT_Official"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Tota Vault on Telegram"
                  aria-label="Tota Vault on Telegram"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#DEBF95]/40 bg-[#11161D] text-[#F5E6C8] transition-colors hover:border-[#DEBF95] hover:bg-[#DEBF95] hover:text-[#0B0F14] text-sm"
                  onClick={() => setShowMobileMenu(false)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                  </svg>
                  <span>Telegram</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
