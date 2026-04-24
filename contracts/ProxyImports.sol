// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Force Hardhat to compile OpenZeppelin proxy contracts so `getContractFactory`
// can deploy them from scripts.
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract ProxyImports {}

