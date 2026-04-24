import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { bsc } from 'wagmi/chains';

/**
 * RainbowKit + wagmi — modal completo (injected + WalletConnect + etc.).
 * `projectId` vem do WalletConnect Cloud (https://cloud.walletconnect.com) — não é o SDK Reown/AppKit.
 */
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() ?? '';

if (!projectId) {
  console.error(
    '[wagmi] Defina VITE_WALLETCONNECT_PROJECT_ID (Wallet Connect Cloud — https://cloud.walletconnect.com). Sem isso, o modal mobile/QR não funciona; extensão pode ainda assim conectar.'
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: 'Tota Vault',
  appDescription: 'BNB Chain launchpad',
  appUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
  // RainbowKit exige string; com projectId vazio o WC falha — mantém build/local sem .env.
  projectId: projectId || '00000000000000000000000000000000',
  chains: [bsc],
  ssr: false,
});
