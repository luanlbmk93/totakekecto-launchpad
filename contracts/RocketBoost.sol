// SPDX-License-Identifier: MIT

// /$$$$$$$$ /$$$$$$  /$$$$$$$$ /$$$$$$  /$$   /$$ /$$$$$$$$ /$$   /$$ /$$$$$$$$  /$$$$$$  /$$$$$$$$ /$$$$$$
//|__  $$__//$$__  $$|__  $$__//$$__  $$| $$  /$$/| $$_____/| $$  /$$/| $$_____/ /$$__  $$|__  $$__//$$__  $$
//   | $$  | $$  \ $$   | $$  | $$  \ $$| $$ /$$/ | $$      | $$ /$$/ | $$      | $$  \__/   | $$  | $$  \ $$
//   | $$  | $$  | $$   | $$  | $$$$$$$$| $$$$$/  | $$$$$   | $$$$$/  | $$$$$   | $$         | $$  | $$  | $$
//   | $$  | $$  | $$   | $$  | $$__  $$| $$  $$  | $$__/   | $$  $$  | $$__/   | $$         | $$  | $$  | $$
//   | $$  | $$  | $$   | $$  | $$  | $$| $$\  $$ | $$      | $$\  $$ | $$      | $$    $$   | $$  | $$  | $$
//   | $$  |  $$$$$$/   | $$  | $$  | $$| $$ \  $$| $$$$$$$$| $$ \  $$| $$$$$$$$|  $$$$$$/   | $$  |  $$$$$$/
//   |__/   \______/    |__/  |__/  |__/|__/  \__/|________/|__/  \__/|________/ \______/    |__/   \______/

pragma solidity ^0.8.20;

abstract contract OwnableLite {
    address private _owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() { require(msg.sender == _owner, "not owner"); _; }
    function owner() public view returns (address) { return _owner; }
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        _setOwner(newOwner);
    }
    function renounceOwnership() external onlyOwner { _setOwner(address(0)); }
    function _setOwner(address newOwner) internal {
        address old = _owner; _owner = newOwner; emit OwnershipTransferred(old, newOwner);
    }
}

abstract contract ReentrancyGuardLite {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status = _NOT_ENTERED;
    modifier nonReentrant() {
        require(_status != _ENTERED, "reentrant");
        _status = _ENTERED; _;
        _status = _NOT_ENTERED;
    }
}

interface IYourTokenFactorySlim {
    function tokenInfo(address token) external view returns (address tokenAddress);
    function bannedTokens(address token) external view returns (bool);
}

/// @title RocketBoost — score by independent 24h lots
/// @notice Each purchase enters a "lot" (the current hour's slot) that lives
/// exactly 24h. Lots do NOT pool together: a 100-point buy at 13h and a
/// 50-point buy at 5h tomorrow each expire on their own clock.
/// 24-slot ring buffer per token (one slot per hour-of-day).
contract RocketBoost is OwnableLite, ReentrancyGuardLite {
    uint256 public constant LIFETIME      = 24 hours;
    uint256 public constant SLOT_DURATION = 1 hours;
    uint256 public constant SLOT_COUNT    = 24;

    struct Lot { uint192 amount; uint64 boughtAt; }

    address public immutable factory;
    address public treasury;
    uint256 public pricePerPoint;
    uint256 public maxPointsPerTx;
    bool    public paused;

    mapping(address => Lot[24]) private lots;
    mapping(address => bool)    public rocketBanned;

    event RocketPurchased(address indexed token, address indexed buyer, uint256 points, uint256 paid);
    event RocketBanned(address indexed token, bool wiped);
    event RocketUnbanned(address indexed token);
    event ParamsUpdated(uint256 pricePerPoint, uint256 maxPointsPerTx);
    event TreasuryChanged(address indexed newTreasury);
    event Paused();
    event Unpaused();
    event StuckEthRescued(address indexed to, uint256 amount);

    /// @param _owner          Wallet that will own the contract (NOT msg.sender).
    /// @param _factory        Address of the TokenFactory.
    /// @param _treasury       Wallet that receives the BNB from purchases.
    /// @param _pricePerPoint  Price (wei) per 1 rocket point.
    /// @param _maxPointsPerTx Max points purchasable in a single tx.
    constructor(
        address _owner,
        address _factory,
        address _treasury,
        uint256 _pricePerPoint,
        uint256 _maxPointsPerTx
    ) {
        require(_owner != address(0), "owner=0");
        require(_factory != address(0), "factory=0");
        require(_treasury != address(0), "treasury=0");
        require(_pricePerPoint > 0, "price=0");
        require(_maxPointsPerTx > 0, "max=0");
        _setOwner(_owner);
        factory        = _factory;
        treasury       = _treasury;
        pricePerPoint  = _pricePerPoint;
        maxPointsPerTx = _maxPointsPerTx;
    }

    modifier notPaused() { require(!paused, "paused"); _; }

    /* -------- Factory checks (no try/catch — keeps stack tiny) -------- */
    function _exists(address token) internal view returns (bool) {
        return IYourTokenFactorySlim(factory).tokenInfo(token) != address(0);
    }

    function _factoryBanned(address token) internal view returns (bool) {
        return IYourTokenFactorySlim(factory).bannedTokens(token);
    }

    /* -------- buy -------- */
    function buyRocket(address token, uint256 points)
        external
        payable
        notPaused
        nonReentrant
    {
        _validate(token, points);

        uint256 cost = points * pricePerPoint;
        require(msg.value >= cost, "low ETH");

        _addLot(token, points);
        _payAndRefund(cost);

        emit RocketPurchased(token, msg.sender, points, cost);
    }

    function _validate(address token, uint256 points) internal view {
        require(token != address(0), "token=0");
        require(points > 0 && points <= maxPointsPerTx, "bad points");
        require(_exists(token), "not factory");
        require(!_factoryBanned(token), "factory banned");
        require(!rocketBanned[token], "rocket banned");
    }

    function _addLot(address token, uint256 points) internal {
        uint256 hourNow = block.timestamp / SLOT_DURATION;
        Lot storage l = lots[token][hourNow % SLOT_COUNT];

        if (l.amount != 0 && uint256(l.boughtAt) / SLOT_DURATION == hourNow) {
            uint256 sum = uint256(l.amount) + points;
            require(sum <= type(uint192).max, "overflow");
            l.amount = uint192(sum);
        } else {
            require(points <= type(uint192).max, "overflow");
            l.amount   = uint192(points);
            l.boughtAt = uint64(block.timestamp);
        }
    }

    function _payAndRefund(uint256 cost) internal {
        (bool ok, ) = payable(treasury).call{value: cost}("");
        require(ok, "treasury fail");
        uint256 extra = msg.value - cost;
        if (extra > 0) {
            (ok, ) = payable(msg.sender).call{value: extra}("");
            require(ok, "refund fail");
        }
    }

    /* -------- read -------- */
    function getScore(address token) external view returns (uint256 sum) {
        if (rocketBanned[token]) return 0;
        // Avoid revert on factory issues by skipping the factory ban check here:
        // if a token is factory-banned, banInRocket(token, true) should be called.
        uint256 nowTs = block.timestamp;
        for (uint256 i = 0; i < SLOT_COUNT; ) {
            Lot storage l = lots[token][i];
            uint192 amt = l.amount;
            if (amt != 0 && nowTs - uint256(l.boughtAt) < LIFETIME) {
                sum += uint256(amt);
            }
            unchecked { ++i; }
        }
    }

    /// @notice Timestamp at which the next active lot will expire. 0 if none.
    function nextLotExpiry(address token) external view returns (uint256 best) {
        uint256 nowTs = block.timestamp;
        for (uint256 i = 0; i < SLOT_COUNT; ) {
            uint64 ts = lots[token][i].boughtAt;
            uint192 amt = lots[token][i].amount;
            if (amt != 0) {
                uint256 exp = uint256(ts) + LIFETIME;
                if (exp > nowTs && (best == 0 || exp < best)) best = exp;
            }
            unchecked { ++i; }
        }
    }

    /* -------- Owner: ban -------- */
    function banInRocket(address token, bool wipeScore) external onlyOwner {
        rocketBanned[token] = true;
        if (wipeScore) {
            for (uint256 i = 0; i < SLOT_COUNT; ) {
                Lot storage l = lots[token][i];
                l.amount = 0;
                l.boughtAt = 0;
                unchecked { ++i; }
            }
        }
        emit RocketBanned(token, wipeScore);
    }

    function unbanInRocket(address token) external onlyOwner {
        rocketBanned[token] = false;
        emit RocketUnbanned(token);
    }

    /* -------- Owner: dashboard admin -------- */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "treasury=0");
        treasury = _treasury;
        emit TreasuryChanged(_treasury);
    }

    function setParams(uint256 _pricePerPoint, uint256 _maxPointsPerTx) external onlyOwner {
        if (_pricePerPoint > 0) pricePerPoint = _pricePerPoint;
        require(_maxPointsPerTx > 0, "max=0");
        maxPointsPerTx = _maxPointsPerTx;
        emit ParamsUpdated(pricePerPoint, maxPointsPerTx);
    }

    function pause()   external onlyOwner { paused = true;  emit Paused(); }
    function unpause() external onlyOwner { paused = false; emit Unpaused(); }

    function rescueStuckEth(address payable to) external onlyOwner {
        require(to != address(0), "to=0");
        uint256 bal = address(this).balance;
        require(bal > 0, "nothing");
        (bool ok, ) = to.call{value: bal}("");
        require(ok, "rescue fail");
        emit StuckEthRescued(to, bal);
    }

    receive() external payable {}
}
