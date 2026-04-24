// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20Lock {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice TotaVault: users lock ERC20 tokens for a limited time; this address is usually `dividendExempt` in MemeCoins to avoid accumulating rewards on the vault balance.
contract TotaVaultLocked {
    struct LockRow {
        uint256 amount;
        uint256 unlockAt;
        bool withdrawn;
    }

    mapping(address => mapping(address => LockRow[])) private _locks;

    event Locked(address indexed user, address indexed token, uint256 indexed lockId, uint256 amount, uint256 unlockAt);
    event Withdrawn(address indexed user, address indexed token, uint256 indexed lockId, uint256 amount);

    function lockCount(address user, address token) external view returns (uint256) {
        return _locks[user][token].length;
    }

    function lockInfo(address user, address token, uint256 lockId)
        external
        view
        returns (uint256 amount, uint256 unlockAt, bool withdrawn)
    {
        LockRow storage r = _locks[user][token][lockId];
        return (r.amount, r.unlockAt, r.withdrawn);
    }

    function deposit(address token, uint256 amount, uint256 durationSeconds) external {
        require(token != address(0), "token");
        require(amount > 0, "amt");
        require(durationSeconds > 0, "dur");
        require(IERC20Lock(token).transferFrom(msg.sender, address(this), amount), "tf");
        uint256 unlockAt = block.timestamp + durationSeconds;
        LockRow[] storage arr = _locks[msg.sender][token];
        arr.push(LockRow({amount: amount, unlockAt: unlockAt, withdrawn: false}));
        uint256 id = arr.length - 1;
        emit Locked(msg.sender, token, id, amount, unlockAt);
    }

    function withdraw(address token, uint256 lockId) external {
        LockRow storage r = _locks[msg.sender][token][lockId];
        require(!r.withdrawn, "done");
        require(r.amount > 0, "none");
        require(block.timestamp >= r.unlockAt, "locked");
        uint256 a = r.amount;
        r.withdrawn = true;
        r.amount = 0;
        require(IERC20Lock(token).transfer(msg.sender, a), "xfer");
        emit Withdrawn(msg.sender, token, lockId, a);
    }
}
