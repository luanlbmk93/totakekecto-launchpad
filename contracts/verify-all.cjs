/**
 * Só verificação (BscScan via Etherscan API V2) — mesmos contratos que deploy-full.cjs.
 *
 * 1) No .env (mesmo da raiz do projeto):
 *    ETHERSCAN_API_KEY=...   ← https://etherscan.io/apis (V2 multichain; vale para BSC)
 *    Opcional: BSCSCAN_API_KEY como fallback se ainda tiveres chave legada
 *
 * 2) Endereços do teu deploy (copia do summary do deploy ou BscScan):
 *    BURN_AGENT_ADDRESS=0x...
 *    PLATFORM_TOKEN_LOCK_ADDRESS=0x...
 *    TOKEN_DEPLOYER_ADDRESS=0x...
 *    TOKEN_FACTORY_IMPL_ADDRESS=0x...
 *
 * 3) Router do Pancake (só precisa se for diferente do default da rede):
 *    PCS_ROUTER_ADDRESS=0x...   (opcional)
 *
 * 4) Correr:
 *    npm run verify:bsc
 *    npm run verify:testnet
 */

require("dotenv").config();
const hre = require("hardhat");
const { verifyDeployedContracts } = require("./verify-utils.cjs");

const DEFAULT_ROUTERS = {
  bsc: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  bnb_testnet: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
};

async function main() {
  const net = hre.network.name;
  const burn = process.env.BURN_AGENT_ADDRESS?.trim();
  const lock = process.env.PLATFORM_TOKEN_LOCK_ADDRESS?.trim();
  const deployer = process.env.TOKEN_DEPLOYER_ADDRESS?.trim();
  const impl = process.env.TOKEN_FACTORY_IMPL_ADDRESS?.trim();

  if (!burn || !lock || !deployer || !impl) {
    console.error(`
Faltam endereços no .env. Define:

  BURN_AGENT_ADDRESS=0x...
  PLATFORM_TOKEN_LOCK_ADDRESS=0x...
  TOKEN_DEPLOYER_ADDRESS=0x...
  TOKEN_FACTORY_IMPL_ADDRESS=0x...

(São os 4 contratos que o deploy-full verifica — não inclui proxy/admin.)
`);
    process.exit(1);
  }

  const router =
    process.env.PCS_ROUTER_ADDRESS?.trim() || DEFAULT_ROUTERS[net] || DEFAULT_ROUTERS.bsc;

  console.log(`\n=== Verify only on ${net} ===\n`);
  console.log("BurnAgent:           ", burn);
  console.log("TotaVaultLocked:     ", lock);
  console.log("TokenDeployer:       ", deployer);
  console.log("TokenFactory (impl):", impl);
  console.log("Pancake router (ctor args):", router, "\n");

  await verifyDeployedContracts(hre, [
    { address: burn, label: "BurnAgent", constructorArguments: [router] },
    { address: lock, label: "TotaVaultLocked", constructorArguments: [] },
    { address: deployer, label: "TokenDeployer", constructorArguments: [] },
    { address: impl, label: "TokenFactory (implementation)", constructorArguments: [] },
  ]);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
