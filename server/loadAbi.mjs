import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Prefer committed `server/tokenFactory.abi.json` (works on Render without Hardhat artifacts).
 * Fallback: local `artifacts/` after `npx hardhat compile`.
 */
export function loadTokenFactoryAbi() {
  const bundled = join(__dirname, 'tokenFactory.abi.json');
  if (existsSync(bundled)) {
    const abi = JSON.parse(readFileSync(bundled, 'utf8'));
    if (Array.isArray(abi)) return abi;
  }

  const root = join(__dirname, '..');
  const p = join(root, 'artifacts/contracts/TokenFactory.sol/TokenFactory.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  if (!Array.isArray(j.abi)) throw new Error(`Missing ABI at ${p} — run: npx hardhat compile`);
  return j.abi;
}
