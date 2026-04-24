/**
 * BscScan’s legacy HTTP API (`api.bscscan.com`) was retired in favour of Etherscan API V2.
 * One key from https://etherscan.io/apis — pass `chainid=56` for BNB Smart Chain.
 */
export const ETHERSCAN_V2_API = 'https://api.etherscan.io/v2/api';
export const BSC_CHAIN_ID = '56';

/** Prefer `VITE_ETHERSCAN_API_KEY`; `VITE_BSCSCAN_API_KEY` still accepted for older .env files. */
export function getEtherscanV2ApiKey(): string | undefined {
  const v2 = import.meta.env.VITE_ETHERSCAN_API_KEY?.trim();
  if (v2 && v2.length > 8) return v2;
  const legacy = import.meta.env.VITE_BSCSCAN_API_KEY?.trim();
  if (legacy && legacy.length > 8) return legacy;
  return undefined;
}
