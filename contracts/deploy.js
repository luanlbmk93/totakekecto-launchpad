require("dotenv").config();
const hre = require("hardhat");
const { verifyDeployedContracts } = require("./verify-utils.cjs");

async function main() {
  const net = hre.network.name;
  console.log(`Deploying TokenFactory on network: ${net}`);

  const TokenFactory = await hre.ethers.getContractFactory("TokenFactory");
  const tokenFactory = await TokenFactory.deploy();

  await tokenFactory.waitForDeployment();
  const tokenFactoryAddress = await tokenFactory.getAddress();

  console.log("TokenFactory deployed to:", tokenFactoryAddress);

  await verifyDeployedContracts(hre, [
    { address: tokenFactoryAddress, label: "TokenFactory", constructorArguments: [] },
  ]);

  console.log("Atualize src/contracts/contractAddresses.ts:");
  console.log(`  TOKEN_FACTORY: '${tokenFactoryAddress}',`);
  console.log("");
  console.log("O factory exige burnAgent configurado antes de criar tokens (primeira compra na criação chama o agent).");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
