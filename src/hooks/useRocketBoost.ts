import { useState } from 'react';
import { ethers, isAddress, getAddress, parseEther } from 'ethers';
import { useWeb3 } from './useWeb3';
import { ROCKET_BOOST_ADDRESS, ROCKET_BOOST_ABI } from '../contracts/rocketBoostABI';
import { TOKEN_FACTORY_ABI } from '../contracts/contractAddresses';
import { getBackendApiUrl } from '../config/apiBackend';
import { getBscReadRpcUrl } from '../config/bscReadRpc';
import toast from 'react-hot-toast';

export interface RocketData {
  tokenAddress: string;
  score: number;
  pricePerPoint: string;
  maxPoints: number;
  paused: boolean;
}

// ---------- Fallback RPC para leitura sem wallet ----------
let publicReadProvider: ethers.JsonRpcProvider | null = null;
function getReadProvider(): ethers.JsonRpcProvider {
  if (!publicReadProvider) publicReadProvider = new ethers.JsonRpcProvider(getBscReadRpcUrl());
  return publicReadProvider;
}
// ----------------------------------------------------------

export const useRocketBoost = () => {
  const [loading, setLoading] = useState(false);
  const { signer, isConnected, account } = useWeb3();

  const getRocketOwner = async (): Promise<string | null> => {
    const activeProvider = signer?.provider || getReadProvider();
    try {
      const contract = new ethers.Contract(ROCKET_BOOST_ADDRESS, ROCKET_BOOST_ABI, activeProvider);
      const code = await activeProvider.getCode(ROCKET_BOOST_ADDRESS);
      if (code === '0x') return null;
      const owner = String(await contract.owner());
      return owner;
    } catch {
      return null;
    }
  };

  const isRocketOwner = async (): Promise<boolean> => {
    if (!account) return false;
    const o = await getRocketOwner();
    return !!o && o.toLowerCase() === account.toLowerCase();
  };

  const getRocketScore = async (tokenAddress: string): Promise<number> => {
    const api = getBackendApiUrl();
    if (api) {
      try {
        const res = await fetch(`${api}/api/rocket/score/${encodeURIComponent(tokenAddress)}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const j = (await res.json()) as { score?: number };
          if (typeof j.score === 'number' && Number.isFinite(j.score)) return j.score;
        }
      } catch {
        /* fall through */
      }
    }

    const activeProvider = getReadProvider();

    try {
      console.log('🚀 [ROCKET] Getting score for:', tokenAddress);
      console.log('🚀 [ROCKET] Contract address:', ROCKET_BOOST_ADDRESS);
      
      const contract = new ethers.Contract(ROCKET_BOOST_ADDRESS, ROCKET_BOOST_ABI, activeProvider);
      
      // Verificar se o contrato existe
      const code = await activeProvider.getCode(ROCKET_BOOST_ADDRESS);
      if (code === '0x') {
        console.error('🚀 [ROCKET] Contract not found at address:', ROCKET_BOOST_ADDRESS);
        return 0;
      }
      
      console.log('🚀 [ROCKET] Contract exists, calling getScore...');
      const score = await contract.getScore(tokenAddress);
      const scoreNumber = parseInt(score.toString());
      console.log('🚀 [ROCKET] Score result:', scoreNumber);
      return scoreNumber;
    } catch (error) {
      console.error('🚀 [ROCKET] Error getting rocket score:', error);
      return 0;
    }
  };

  const getRocketConfig = async () => {
    const api = getBackendApiUrl();
    if (api) {
      try {
        const res = await fetch(`${api}/api/rocket/config`, { cache: 'no-store' });
        if (res.ok) {
          const j = (await res.json()) as {
            pricePerPoint?: string;
            maxPoints?: number;
            paused?: boolean;
          };
          if (j.pricePerPoint != null && j.maxPoints != null && typeof j.paused === 'boolean') {
            return {
              pricePerPoint: j.pricePerPoint,
              maxPoints: j.maxPoints,
              paused: j.paused,
            };
          }
        }
      } catch {
        /* fall through */
      }
    }

    const activeProvider = getReadProvider();

    try {
      console.log('🚀 [ROCKET] Getting config...');
      const contract = new ethers.Contract(ROCKET_BOOST_ADDRESS, ROCKET_BOOST_ABI, activeProvider);
      
      // Verificar se o contrato existe
      const code = await activeProvider.getCode(ROCKET_BOOST_ADDRESS);
      if (code === '0x') {
        console.error('🚀 [ROCKET] Contract not found for config');
        return null;
      }
      
      console.log('🚀 [ROCKET] Calling config functions...');
      
      const [pricePerPoint, maxPoints, paused] = await Promise.all([
        contract.pricePerPoint(),
        contract.maxPointsPerTx(),
        contract.paused()
      ]);

      const configResult = {
        pricePerPoint: ethers.formatEther(pricePerPoint),
        maxPoints: parseInt(maxPoints.toString()),
        paused
      };
      
      console.log('🚀 [ROCKET] Config loaded successfully:', configResult);
      return configResult;
    } catch (error: any) {
      console.error('🚀 [ROCKET] Error getting rocket config:', error);
      console.error('🚀 [ROCKET] Error details:', {
        message: error.message,
        code: error.code,
        data: error.data
      });
      return null;
    }
  };

  const ownerWrite = async (
    fn: (c: ethers.Contract) => Promise<ethers.TransactionResponse>,
    successMsg: string
  ): Promise<boolean> => {
    if (!signer || !isConnected) {
      toast.error('Please connect your wallet');
      return false;
    }
    const ok = await isRocketOwner();
    if (!ok) {
      toast.error('Only RocketBoost owner can perform this action');
      return false;
    }
    try {
      setLoading(true);
      const c = new ethers.Contract(ROCKET_BOOST_ADDRESS, ROCKET_BOOST_ABI, signer);
      const tx = await fn(c);
      await tx.wait();
      toast.success(successMsg);
      return true;
    } catch (e: any) {
      console.error(e);
      toast.error(e?.reason || 'Transaction failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const setRocketParams = async (pricePerPointBnb: string, maxPoints: number) => {
    const max = Number(maxPoints);
    if (!Number.isFinite(max) || max <= 0) {
      toast.error('Invalid max points');
      return false;
    }
    let pppWei: bigint;
    try {
      pppWei = parseEther(String(pricePerPointBnb || '0'));
    } catch {
      toast.error('Invalid pricePerPoint');
      return false;
    }
    return ownerWrite((c) => c.setParams(pppWei, BigInt(max)), 'Rocket params updated');
  };

  const setRocketTreasury = async (treasury: string) => {
    if (!isAddress(treasury)) {
      toast.error('Invalid treasury address');
      return false;
    }
    return ownerWrite((c) => c.setTreasury(getAddress(treasury)), 'Rocket treasury updated');
  };

  const pauseRocket = async () => ownerWrite((c) => c.pause(), 'Rocket paused');
  const unpauseRocket = async () => ownerWrite((c) => c.unpause(), 'Rocket unpaused');

  const buyRocketBoost = async (tokenAddress: string, points: number) => {
    if (!signer) {
      toast.error('Please connect your wallet');
      return false;
    }

    if (!isConnected) {
      toast.error('Wallet not connected');
      return false;
    }

    try {
      setLoading(true);
      console.log('🚀 [ROCKET] Starting purchase:', { tokenAddress, points });
      console.log('🚀 [ROCKET] Contract address:', ROCKET_BOOST_ADDRESS);
      toast.loading('Buying rocket boost...', { id: 'rocket-boost' });

      const contract = new ethers.Contract(ROCKET_BOOST_ADDRESS, ROCKET_BOOST_ABI, signer);
      
      // Verificar se o contrato existe
      const code = await signer.provider.getCode(ROCKET_BOOST_ADDRESS);
      if (code === '0x') {
        console.error('🚀 [ROCKET] Contract not deployed at:', ROCKET_BOOST_ADDRESS);
        toast.error('RocketBoost contract not found', { id: 'rocket-boost' });
        return false;
      }
      
      // Get price per point
      console.log('🚀 [ROCKET] Getting price per point...');
      const pricePerPoint = await contract.pricePerPoint();
      console.log('🚀 [ROCKET] Price per point:', ethers.formatEther(pricePerPoint), 'BNB');
      
      const totalCost = pricePerPoint * BigInt(points);
      console.log('🚀 [ROCKET] Total cost:', ethers.formatEther(totalCost), 'BNB');
      
      // Check balance
      const userAddress = await signer.getAddress();
      const balance = await signer.provider.getBalance(userAddress);
      console.log('🚀 [ROCKET] User balance:', ethers.formatEther(balance), 'BNB');
      
      if (balance < totalCost) {
        toast.error('Insufficient ETH balance', { id: 'rocket-boost' });
        return false;
      }

      // Verificar se o token existe no factory
      console.log('🚀 [ROCKET] Checking if token exists in factory...');
      try {
        const factoryAddress = await contract.factory();
        console.log('🚀 [ROCKET] Factory address from contract:', factoryAddress);
        
        const factoryContract = new ethers.Contract(factoryAddress, TOKEN_FACTORY_ABI, signer);
        
        const tokenInfo = await factoryContract.tokenInfo(tokenAddress);
        console.log('🚀 [ROCKET] Token info from factory:', tokenInfo[0]);
        
        if (tokenInfo[0] === ethers.ZeroAddress) {
          toast.error('Token not found in factory', { id: 'rocket-boost' });
          return false;
        }
      } catch (factoryError) {
        console.error('🚀 [ROCKET] Error checking factory:', factoryError);
        toast.error('Error validating token', { id: 'rocket-boost' });
        return false;
      }

      console.log('🚀 [ROCKET] Sending transaction...');
      const tx = await contract.buyRocket(tokenAddress, points, {
        value: totalCost,
        gasLimit: 300000
      });

      console.log('🚀 [ROCKET] Transaction sent:', tx.hash);
      await tx.wait();
      console.log('🚀 [ROCKET] Transaction confirmed!');
      toast.success('Rocket boost purchased successfully!', { id: 'rocket-boost' });
      return true;
    } catch (error: any) {
      console.error('🚀 [ROCKET] Error buying rocket boost:', error);
      console.log('🚀 [ROCKET] Error details:', {
        reason: error.reason,
        code: error.code,
        data: error.data,
        message: error.message
      });
      
      let errorMessage = 'Failed to buy rocket boost';
      if (error.reason) {
        errorMessage = error.reason;
      } else if (error.message && error.message.includes('user rejected')) {
        errorMessage = 'Transaction rejected by user';
      } else if (error.message && error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient ETH balance';
      }
      
      toast.error(errorMessage, { id: 'rocket-boost' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    getRocketScore,
    getRocketConfig,
    buyRocketBoost,
    getRocketOwner,
    isRocketOwner,
    setRocketParams,
    setRocketTreasury,
    pauseRocket,
    unpauseRocket,
    loading
  };
};
