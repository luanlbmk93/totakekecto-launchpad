import { ethers } from 'ethers';

const DEFAULT_ROCKET = '0x70D2a5f66Ce2eB20D1B960D82F8e2E8308f5956B';

const ROCKET_ABI = [
  'function getScore(address token) external view returns (uint256)',
  'function pricePerPoint() external view returns (uint256)',
  'function maxPointsPerTx() external view returns (uint256)',
  'function paused() external view returns (bool)',
];

function rocketAddress() {
  return (process.env.ROCKET_BOOST_ADDRESS || DEFAULT_ROCKET).trim();
}

function rpcUrl() {
  return (process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/').trim();
}

export async function getRocketConfig() {
  const provider = new ethers.JsonRpcProvider(rpcUrl());
  const c = new ethers.Contract(rocketAddress(), ROCKET_ABI, provider);
  const code = await provider.getCode(rocketAddress());
  if (code === '0x') return null;
  const [pricePerPoint, maxPoints, paused] = await Promise.all([
    c.pricePerPoint(),
    c.maxPointsPerTx(),
    c.paused(),
  ]);
  return {
    pricePerPoint: ethers.formatEther(pricePerPoint),
    maxPoints: parseInt(maxPoints.toString(), 10),
    paused,
  };
}

export async function getRocketScore(tokenAddress) {
  const provider = new ethers.JsonRpcProvider(rpcUrl());
  const c = new ethers.Contract(rocketAddress(), ROCKET_ABI, provider);
  const code = await provider.getCode(rocketAddress());
  if (code === '0x') return 0;
  const score = await c.getScore(tokenAddress);
  return parseInt(score.toString(), 10);
}
