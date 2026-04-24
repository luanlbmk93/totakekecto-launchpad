import { ethers } from 'ethers';

/** Matches TokenFactory presale fees (ECOSYSTEM + CREATOR + BURNAGENT) in bps. */
export const PRESALE_TOTAL_FEE_BPS = 200n;

export function presaleNetEthFromGrossWei(grossWei: bigint): bigint {
  const fee = (grossWei * PRESALE_TOTAL_FEE_BPS) / 10000n;
  return grossWei - fee;
}

export function spotPriceWei(virtualETH: bigint, virtualToken: bigint): bigint {
  if (virtualToken === 0n) return 0n;
  return (virtualETH * ethers.WeiPerEther) / virtualToken;
}

/** `ethAmount` is net ETH (after presale fees), same as on-chain `getBuyAmount`. */
export function getBuyAmountWei(virtualETH: bigint, virtualToken: bigint, netEthWei: bigint): bigint {
  const newVETH = virtualETH + netEthWei;
  const newVToken = (virtualETH * virtualToken) / newVETH;
  return virtualToken - newVToken;
}

export function getSellAmountWei(virtualETH: bigint, virtualToken: bigint, tokenWei: bigint): bigint {
  const newVToken = virtualToken + tokenWei;
  const newVETH = (virtualETH * virtualToken) / newVToken;
  return virtualETH - newVETH;
}

export function calculateMarketCapWei(
  virtualETH: bigint,
  virtualToken: bigint,
  totalSupplyWei: bigint
): bigint {
  const p = spotPriceWei(virtualETH, virtualToken);
  return (p * totalSupplyWei) / ethers.WeiPerEther;
}
