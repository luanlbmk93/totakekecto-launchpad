// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./MemeCoin.sol";

/**
 * @dev External CREATE2 deployer to keep TokenFactory bytecode under EIP-170.
 * TokenFactory passes itself as `_factory` so only the factory can mint/activate fees.
 */
contract TokenDeployer {
    error InvalidSalt();

    uint256 private constant _ADDRESS_SUFFIX_MASK = 0xFFFF;

    function deployMemeCoin(
        string memory name_,
        string memory symbol_,
        address factory_,
        bytes32 salt,
        uint256 requiredSuffix
    ) external returns (address tokenAddress) {
        MemeCoin t = new MemeCoin{salt: salt}(name_, symbol_, factory_);
        tokenAddress = address(t);
        if ((uint160(tokenAddress) & uint160(_ADDRESS_SUFFIX_MASK)) != uint160(requiredSuffix)) {
            revert InvalidSalt();
        }
        return tokenAddress;
    }
}

