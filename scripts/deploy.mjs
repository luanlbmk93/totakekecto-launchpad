// scripts/deploy.mjs
import hre from "hardhat";

async function main() {
  const { ethers, run, network } = hre;

  console.log(`Deploying TokenFactory to ${network.name}...`);

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(bal), "ETH");

  const Factory = await ethers.getContractFactory("TokenFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const factoryAddr = await factory.getAddress();
  console.log("TokenFactory deployed at:", factoryAddr);

  // (opcional)
  // await run("verify:verify", { address: factoryAddr, constructorArguments: [] });

  console.log("\nVerification command:");
  console.log(`npx hardhat verify --network ${network.name} ${factoryAddr}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
