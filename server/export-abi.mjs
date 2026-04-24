/**
 * After `npx hardhat compile`, run: npm run export:abi
 * Refreshes server/tokenFactory.abi.json for Render deploys.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifact = JSON.parse(
  readFileSync(join(root, 'artifacts/contracts/TokenFactory.sol/TokenFactory.json'), 'utf8'),
);
if (!Array.isArray(artifact.abi)) throw new Error('artifact.abi missing');
const out = join(root, 'server/tokenFactory.abi.json');
writeFileSync(out, JSON.stringify(artifact.abi));
console.log(`[export-abi] wrote ${artifact.abi.length} entries → ${out}`);
