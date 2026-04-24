/**
 * Deploy completo: BurnAgent + TotaVaultLocked + TokenFactory + configuração
 *
 * Uso:
 *   npm run deploy:testnet   (BSC Testnet)
 *   npm run deploy:bsc       (BSC Mainnet)
 *
 * Variáveis em .env:
 *   PRIVATE_KEY          - obrigatório
 *   ETHERSCAN_API_KEY      - chave Etherscan API V2 (multichain; vale para BSC). Fallback: BSCSCAN_API_KEY
 *                            Crie em https://etherscan.io/apis — a API só da BscScan foi unificada ao V2.
 *   SKIP_VERIFY=1        - força pular verificação mesmo com API key
 *   PLATFORM_TOKEN       - token para burn (default: CAKE mainnet, ou PLATFORM_TOKEN testnet)
 */

require("dotenv").config();
const hre = require("hardhat");
const { getAddress } = require("ethers");
const { verifyDeployedContracts } = require("./verify-utils.cjs");

const ADDRESSES = {
  bsc: {
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    platformToken: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", // CAKE
  },
  bnb_testnet: {
    router: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1", // PancakeSwap v2 testnet
    platformToken: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd", // WBNB BSC testnet
  },
};

async function main() {
  const net = hre.network.name;
  const addrs = ADDRESSES[net] || ADDRESSES.bsc;
  console.log(`\n=== Deploying on ${net} ===\n`);

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "BNB\n");

  // 1. Deploy BurnAgent
  console.log("1. Deploying BurnAgent...");
  const BurnAgent = await hre.ethers.getContractFactory("BurnAgent");
  const burnAgent = await BurnAgent.deploy(addrs.router);
  await burnAgent.waitForDeployment();
  const burnAgentAddr = await burnAgent.getAddress();
  console.log("   BurnAgent deployed to:", burnAgentAddr);

  // 2. Deploy TotaVaultLocked (vault da plataforma — use o endereço em dividendExempt no launch / dapp)
  console.log("\n2. Deploying TotaVaultLocked...");
  const TotaVaultLocked = await hre.ethers.getContractFactory("TotaVaultLocked");
  const platformLock = await TotaVaultLocked.deploy();
  await platformLock.waitForDeployment();
  const platformLockAddr = await platformLock.getAddress();
  console.log("   TotaVaultLocked deployed to:", platformLockAddr);

  // 3. Deploy TokenDeployer (CREATE2 helper)
  console.log("\n3. Deploying TokenDeployer...");
  const TokenDeployer = await hre.ethers.getContractFactory("TokenDeployer");
  const tokenDeployer = await TokenDeployer.deploy();
  await tokenDeployer.waitForDeployment();
  const tokenDeployerAddr = await tokenDeployer.getAddress();
  console.log("   TokenDeployer deployed to:", tokenDeployerAddr);

  // 4. Deploy TokenFactory implementation + Transparent proxy (upgradeable)
  console.log("\n4. Deploying TokenFactory implementation...");
  const TokenFactory = await hre.ethers.getContractFactory("TokenFactory");
  const factoryImpl = await TokenFactory.deploy();
  await factoryImpl.waitForDeployment();
  const factoryImplAddr = await factoryImpl.getAddress();
  console.log("   TokenFactory impl:", factoryImplAddr);

  console.log("\n5. Deploying ProxyAdmin...");
  const ProxyAdmin = await hre.ethers.getContractFactory("ProxyAdmin");
  const proxyAdmin = await ProxyAdmin.deploy(deployer.address);
  await proxyAdmin.waitForDeployment();
  const proxyAdminAddr = await proxyAdmin.getAddress();
  console.log("   ProxyAdmin:", proxyAdminAddr);

  console.log("\n6. Deploying TransparentUpgradeableProxy...");
  const TransparentUpgradeableProxy = await hre.ethers.getContractFactory("TransparentUpgradeableProxy");
  const initData = factoryImpl.interface.encodeFunctionData("initialize", [tokenDeployerAddr]);
  const proxy = await TransparentUpgradeableProxy.deploy(factoryImplAddr, proxyAdminAddr, initData);
  await proxy.waitForDeployment();
  const factoryAddr = await proxy.getAddress();
  console.log("   TokenFactory proxy:", factoryAddr);

  const tokenFactory = await hre.ethers.getContractAt("TokenFactory", factoryAddr);

  // 7. Configurar burnAgent no TokenFactory (via proxy)
  console.log("\n7. Setting burnAgent on TokenFactory...");
  const tx = await tokenFactory.setBurnAgent(burnAgentAddr);
  await tx.wait();
  console.log("   Done.");

  // 8. Configurar platformToken no BurnAgent (normaliza checksum)
  let platformToken = process.env.PLATFORM_TOKEN || addrs.platformToken;
  platformToken = getAddress(platformToken.toLowerCase());
  console.log("\n8. Setting platform token on BurnAgent:", platformToken);
  const tx2 = await burnAgent.setPlatformToken(platformToken);
  await tx2.wait();
  console.log("   Done.");

  await verifyDeployedContracts(hre, [
    { address: burnAgentAddr, label: "BurnAgent", constructorArguments: [addrs.router] },
    { address: platformLockAddr, label: "TotaVaultLocked", constructorArguments: [] },
    { address: tokenDeployerAddr, label: "TokenDeployer", constructorArguments: [] },
    { address: factoryImplAddr, label: "TokenFactory (implementation)", constructorArguments: [] },
    // Proxy itself is not verifiable the same way as normal contracts here; optional.
  ]);

  console.log("=== Summary ===\n");
  console.log("TokenFactory(proxy):", factoryAddr);
  console.log("TokenFactory(impl): ", factoryImplAddr);
  console.log("ProxyAdmin:         ", proxyAdminAddr);
  console.log("TokenDeployer:      ", tokenDeployerAddr);
  console.log("BurnAgent:         ", burnAgentAddr);
  console.log("TotaVaultLocked:   ", platformLockAddr);
  console.log("\nUpdate src/contracts/contractAddresses.ts:");
  console.log(`  TOKEN_FACTORY: '${factoryAddr}',`);
  console.log(`  TOKEN_DEPLOYER: '${tokenDeployerAddr}',`);
  console.log(`  PLATFORM_TOKEN_LOCK: '${platformLockAddr}',`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
