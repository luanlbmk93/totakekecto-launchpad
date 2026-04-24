import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

/** RainbowKit — modal completo (MetaMask, WalletConnect, etc.). */
export default function VaultConnectButton() {
  return (
    <ConnectButton
      showBalance={false}
      chainStatus="icon"
    />
  );
}
