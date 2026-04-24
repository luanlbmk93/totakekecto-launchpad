require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY = process.env.PRIVATE_KEY || "bbea3f8aaf38c7591a24a0516dd84564086d25d024f7260fb790fed6053e032c";

/** Etherscan API V2 (multichain): https://etherscan.io/apis — mesma chave para BSC (chainid 56). */
const ETHERSCAN_V2_KEY =
  process.env.ETHERSCAN_API_KEY?.trim() || process.env.BSCSCAN_API_KEY?.trim() || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 80
      }
    }
  },
  networks: {
    bnb_testnet: {
      url: process.env.BSC_TESTNET_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      gasPrice: 20000000000,
      accounts: [PRIVATE_KEY]
    },
    bsc: {
      url: process.env.BSC_MAINNET_URL || "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: [PRIVATE_KEY]
    }
  },
  // String única → Hardhat usa Etherscan API V2 por chainId (evita Invalid API Key com chave só V2).
  etherscan: {
    apiKey: ETHERSCAN_V2_KEY,
  },
};