import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi';
import { bsc } from 'wagmi/chains';
import { useConnectModal } from '@rainbow-me/rainbowkit';

export interface Web3State {
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  account: string | null;
  chainId: number | null;
  isConnected: boolean;
}

export type Web3ContextValue = Web3State & {
  /** Abre o modal RainbowKit (várias wallets + QR / mobile). */
  connectWallet: () => Promise<void>;
  openWalletModal: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  switchToBscMainnet: () => Promise<void>;
};

const BSC_CHAIN_ID = 56;

const emptyState: Web3State = {
  provider: null,
  signer: null,
  account: null,
  chainId: null,
  isConnected: false,
};

const Web3Context = createContext<Web3ContextValue | null>(null);

export const Web3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const wrongChainWarnedRef = useRef(false);
  const [web3State, setWeb3State] = useState<Web3State>(emptyState);

  const { address, isConnected, connector, chainId: wagmiChainId } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isConnected || !address || !connector) {
        wrongChainWarnedRef.current = false;
        setWeb3State(emptyState);
        return;
      }

      try {
        const raw = await connector.getProvider();
        const bp = new ethers.BrowserProvider(raw as ethers.Eip1193Provider);
        const signer = await bp.getSigner();
        const net = await bp.getNetwork();
        const cid = Number(net.chainId);

        if (cancelled) return;

        setWeb3State({
          provider: bp,
          signer,
          account: address,
          chainId: cid,
          isConnected: true,
        });

        if (cid !== BSC_CHAIN_ID) {
          if (!wrongChainWarnedRef.current) {
            wrongChainWarnedRef.current = true;
            toast.error('Use BNB Chain (BSC) for this dapp. Switch network in your wallet.', {
              id: 'wrong-chain',
              duration: 6000,
            });
          }
        } else {
          wrongChainWarnedRef.current = false;
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setWeb3State(emptyState);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, address, connector, wagmiChainId]);

  const connectWallet = useCallback(async () => {
    openConnectModal?.();
  }, [openConnectModal]);

  const openWalletModal = useCallback(async () => {
    openConnectModal?.();
  }, [openConnectModal]);

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnectAsync();
    } catch (e) {
      console.error(e);
    }
    wrongChainWarnedRef.current = false;
    setWeb3State(emptyState);
    toast.success('Wallet disconnected');
  }, [disconnectAsync]);

  const switchToBscMainnet = useCallback(async () => {
    if (!connector) {
      toast.error('No active wallet connection.');
      return;
    }
    try {
      await switchChainAsync({ chainId: bsc.id });
    } catch (e: unknown) {
      console.error(e);
      toast.error('Could not switch to BNB Chain.');
    }
  }, [connector, switchChainAsync]);

  const value = useMemo<Web3ContextValue>(
    () => ({
      ...web3State,
      connectWallet,
      openWalletModal,
      disconnectWallet,
      switchToBscMainnet,
    }),
    [web3State, connectWallet, openWalletModal, disconnectWallet, switchToBscMainnet]
  );

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};

export function useWeb3(): Web3ContextValue {
  const ctx = useContext(Web3Context);
  if (!ctx) {
    throw new Error('useWeb3 must be used within Web3Provider');
  }
  return ctx;
}
