import {
  ContractFactory,
  keccak256,
  solidityPacked,
  getAddress,
  toBeHex,
} from 'ethers';

// Must match TokenFactory.VAULT_TOKEN_ADDRESS_SUFFIX (0x8888, 16 bits).
const VAULT_SUFFIX = 0x8888n;
const MASK = 0xffffn;
const MAX_ITERATIONS = 1_000_000;

export async function mineVanitySalt(
  name: string,
  symbol: string,
  factoryAddress: string,
  tokenDeployerAddress: string,
  onProgressOrOpts?: ((iterations: number) => void) | { startAt?: number; maxIterations?: number; onProgress?: (iterations: number) => void }
): Promise<{ salt: string; predictedAddress: string; iterations: number; index: number }> {
  const MemeCoinArtifact = await import(
    /* @vite-ignore */ '../../artifacts/contracts/MemeCoin.sol/MemeCoin.json'
  ).catch(() => null);

  if (!MemeCoinArtifact?.abi || !MemeCoinArtifact?.bytecode) {
    throw new Error('MemeCoin artifact not found. Run "npm run compile" first.');
  }

  const opts =
    typeof onProgressOrOpts === 'function'
      ? { onProgress: onProgressOrOpts, startAt: 0, maxIterations: MAX_ITERATIONS }
      : {
          onProgress: onProgressOrOpts?.onProgress,
          startAt: Math.max(0, Math.floor(onProgressOrOpts?.startAt ?? 0)),
          maxIterations: Math.max(1, Math.floor(onProgressOrOpts?.maxIterations ?? MAX_ITERATIONS)),
        };

  const cf = new ContractFactory(MemeCoinArtifact.abi, MemeCoinArtifact.bytecode);
  const deployTx = await cf.getDeployTransaction(name, symbol, factoryAddress);
  const initCodeHash = keccak256(deployTx.data!);

  for (let step = 0; step < opts.maxIterations; step++) {
    const i = opts.startAt + step;

    if (step > 0 && step % 50_000 === 0 && opts.onProgress) {
      opts.onProgress(i);
      await new Promise((r) => setTimeout(r, 0));
    }

    const salt = toBeHex(BigInt(i), 32);
    const addr = predictCreate2(tokenDeployerAddress, salt, initCodeHash);
    const addrBn = BigInt(addr);

    if ((addrBn & MASK) === VAULT_SUFFIX) {
      return { salt, predictedAddress: addr, iterations: step + 1, index: i };
    }
  }

  throw new Error('Vanity mining timed out. Try again.');
}

function predictCreate2(deployer: string, salt: string, initCodeHash: string): string {
  const h = keccak256(
    solidityPacked(
      ['bytes1', 'address', 'bytes32', 'bytes32'],
      ['0xff', deployer, salt, initCodeHash]
    )
  );
  return getAddress('0x' + h.slice(-40));
}
