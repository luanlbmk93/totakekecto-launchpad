// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IERC20.sol";

interface IPancakeRouter {
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;

}

/// @notice DEX tax: max 10% total; split 100% across funds / burn / dividends / LP (LP share burned to DEAD = deflationary supply cut). Anti-bot optional.
contract MemeCoin {
    uint16 public constant MAX_TOTAL_TAX_BPS = 1000; // 10%
    uint16 public constant ALLOC_SUM_BPS = 10000;

    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    error Reentrancy();
    error OnlyFactory();
    error AlreadyActive();
    error ZeroAddr();
    error RewardCfg();
    error NoDiv();
    error InsufficientBalance();
    error TaxCap();
    error AllocSum();
    error InsufficientAllowance();
    error Nothing();
    error Liquidity();
    error PayFail();
    error AntiBotTx();
    error AntiBotWallet();
    uint256 private _locked = 1;

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;

    address public factory;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public lpPair;
    address public creator;
    address public fundsWallet;
    bool public dexFeesActive;

    /// @notice Total buy/sell tax on DEX (bps), max 10%.
    uint16 public totalTaxBps;
    /// @notice How the tax is split (must sum to 10000).
    uint16 public allocFundsBps;
    uint16 public allocBurnBps;
    uint16 public allocDividendBps;
    uint16 public allocLpBps;

    bool public taxEnabled;

    bool public paysDividendsEnabled;
    address public swapRouter;
    address public WETH;
    address public rewardToken;

    /// @notice Lock vault / contract excluded from dividend rewards (and anti-bot wallet cap).
    address public dividendExempt;

    uint256 public antiBotUntil;
    uint16 public antiBotMaxTxBps;
    uint16 public antiBotMaxWalletBps;

    uint256 public pendingDividendTokens;

    uint256 public accRewardPerShare;
    mapping(address => uint256) public rewardDebt;
    mapping(address => uint256) public rewards;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    constructor(string memory _name, string memory _symbol, address _factory) {
        name = _name;
        symbol = _symbol;
        factory = _factory;
    }

    struct DexFeeConfig {
        address creator;
        address lpPair;
        address fundsWallet;
        uint16 totalTaxBps;
        uint16 allocFundsBps;
        uint16 allocBurnBps;
        uint16 allocDividendBps;
        uint16 allocLpBps;
        bool taxEnabled;
        bool paysDividends;
        address swapRouter;
        address WETH;
        address rewardToken;
        uint256 antiBotUntil;
        uint16 antiBotMaxTxBps;
        uint16 antiBotMaxWalletBps;
        address dividendExempt;
    }

    function activateDexFees(DexFeeConfig calldata c) external onlyFactory {
        if (dexFeesActive) revert AlreadyActive();
        if (c.lpPair == address(0) || c.creator == address(0)) revert ZeroAddr();
        if (uint256(c.totalTaxBps) > uint256(MAX_TOTAL_TAX_BPS)) revert TaxCap();
        uint256 asum = uint256(c.allocFundsBps) +
            uint256(c.allocBurnBps) +
            uint256(c.allocDividendBps) +
            uint256(c.allocLpBps);
        // Allow tax-free tokens: totalTaxBps == 0 => allocs may all be 0.
        if (c.totalTaxBps > 0) {
            if (asum != uint256(ALLOC_SUM_BPS)) revert AllocSum();
        } else {
            if (asum != 0) revert AllocSum();
        }
        if (c.allocFundsBps > 0 && c.fundsWallet == address(0)) revert ZeroAddr();
        if (c.allocDividendBps > 0) {
            if (c.swapRouter == address(0) || c.WETH == address(0)) revert RewardCfg();
        }
        if (c.allocDividendBps > 0) {
            if (!c.paysDividends || c.rewardToken == address(0)) revert RewardCfg();
        }

        creator = c.creator;
        lpPair = c.lpPair;
        fundsWallet = c.fundsWallet;
        totalTaxBps = c.totalTaxBps;
        allocFundsBps = c.allocFundsBps;
        allocBurnBps = c.allocBurnBps;
        allocDividendBps = c.allocDividendBps;
        allocLpBps = c.allocLpBps;
        taxEnabled = c.taxEnabled;
        paysDividendsEnabled = c.paysDividends;
        swapRouter = c.swapRouter;
        WETH = c.WETH;
        rewardToken = c.rewardToken;
        antiBotUntil = c.antiBotUntil;
        antiBotMaxTxBps = c.antiBotMaxTxBps;
        antiBotMaxWalletBps = c.antiBotMaxWalletBps;
        dividendExempt = c.dividendExempt;
        dexFeesActive = true;
    }

    function mint(address to, uint256 amount) external onlyFactory {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _presaleOrFactoryExempt(address from, address to) internal view returns (bool) {
        if (!dexFeesActive) return true;
        if (from == factory || to == factory) return true;
        return false;
    }

    function _isExcludedFromRewards(address account) internal view returns (bool) {
        if (account == address(0)) return true;
        if (account == factory) return true;
        if (account == lpPair) return true;
        if (account == address(this)) return true;
        if (account == dividendExempt) return true;
        return false;
    }

    function _isAntiBotExempt(address a) internal view returns (bool) {
        if (a == address(0) || a == factory || a == lpPair || a == address(this)) return true;
        if (a == DEAD) return true;
        if (a == fundsWallet) return true;
        if (a == dividendExempt) return true;
        if (a == creator) return true;
        return false;
    }

    function _antiBotOn() internal view returns (bool) {
        return dexFeesActive && antiBotUntil != 0 && block.timestamp < antiBotUntil;
    }

    function _checkAntiBot(address from, address to, uint256 amount) internal view {
        if (!_antiBotOn()) return;
        uint256 maxTx = (totalSupply * uint256(antiBotMaxTxBps)) / 10000;
        uint256 maxWallet = (totalSupply * uint256(antiBotMaxWalletBps)) / 10000;
        if (antiBotMaxTxBps > 0) {
            if (from == lpPair && amount > maxTx) revert AntiBotTx();
            if (to == lpPair && amount > maxTx) revert AntiBotTx();
        }
        if (from == lpPair && antiBotMaxWalletBps > 0 && !_isAntiBotExempt(to)) {
            if (balanceOf[to] + amount > maxWallet) revert AntiBotWallet();
        }
    }

    function _eligibleSupply() internal view returns (uint256) {
        uint256 s = totalSupply;
        if (lpPair != address(0)) {
            uint256 p = balanceOf[lpPair];
            if (p <= s) s -= p;
        }
        uint256 f = balanceOf[factory];
        if (f <= s) s -= f;
        uint256 c = balanceOf[address(this)];
        if (c <= s) s -= c;
        uint256 b = balanceOf[address(0)];
        if (b <= s) s -= b;
        if (dividendExempt != address(0)) {
            uint256 e = balanceOf[dividendExempt];
            if (e <= s) s -= e;
        }
        return s;
    }

    function _update(address account) internal {
        if (account == address(0)) return;
        if (!paysDividendsEnabled || !dexFeesActive || rewardToken == address(0) || allocDividendBps == 0) return;

        if (_isExcludedFromRewards(account)) {
            rewardDebt[account] = (balanceOf[account] * accRewardPerShare) / 1e12;
            return;
        }

        uint256 bal = balanceOf[account];
        uint256 acc = (bal * accRewardPerShare) / 1e12;
        uint256 debt = rewardDebt[account];
        if (acc > debt) {
            rewards[account] += acc - debt;
        }
        rewardDebt[account] = (bal * accRewardPerShare) / 1e12;
    }

    function processDividends() external nonReentrant {
        if (!paysDividendsEnabled || !dexFeesActive || swapRouter == address(0) || allocDividendBps == 0) revert NoDiv();
        uint256 mcIn = pendingDividendTokens;
        if (mcIn == 0) return;
        uint256 bal = balanceOf[address(this)];
        if (bal < mcIn) mcIn = bal;
        if (mcIn == 0) return;

        IERC20(address(this)).approve(swapRouter, mcIn);
        uint256 rbBefore = IERC20(rewardToken).balanceOf(address(this));

        address[] memory path;
        if (rewardToken == WETH) {
            path = new address[](2);
            path[0] = address(this);
            path[1] = WETH;
        } else {
            path = new address[](3);
            path[0] = address(this);
            path[1] = WETH;
            path[2] = rewardToken;
        }

        IPancakeRouter(swapRouter).swapExactTokensForTokensSupportingFeeOnTransferTokens(
            mcIn,
            0,
            path,
            address(this),
            block.timestamp + 600
        );

        pendingDividendTokens -= mcIn;

        uint256 received = IERC20(rewardToken).balanceOf(address(this)) - rbBefore;
        if (received == 0) return;

        uint256 sup = _eligibleSupply();
        if (sup > 0) {
            accRewardPerShare += (received * 1e12) / sup;
        }
    }

    function claimDividend() external nonReentrant {
        if (!paysDividendsEnabled || !dexFeesActive || rewardToken == address(0) || allocDividendBps == 0) revert NoDiv();
        _update(msg.sender);
        uint256 amt = rewards[msg.sender];
        if (amt == 0) revert Nothing();
        rewards[msg.sender] = 0;
        if (IERC20(rewardToken).balanceOf(address(this)) < amt) revert Liquidity();
        if (!IERC20(rewardToken).transfer(msg.sender, amt)) revert PayFail();
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (balanceOf[from] < amount) revert InsufficientBalance();

        if (_presaleOrFactoryExempt(from, to) || amount == 0) {
            unchecked {
                balanceOf[from] -= amount;
            }
            balanceOf[to] += amount;
            emit Transfer(from, to, amount);
            if (paysDividendsEnabled && dexFeesActive && allocDividendBps > 0) {
                _update(from);
                _update(to);
            }
            return;
        }

        _checkAntiBot(from, to, amount);

        uint256 fee;
        if (taxEnabled && totalTaxBps > 0) {
            fee = (amount * uint256(totalTaxBps)) / 10000;
        }
        uint256 net = amount - fee;

        if (paysDividendsEnabled && dexFeesActive && allocDividendBps > 0) {
            _update(from);
            _update(to);
        }

        unchecked {
            balanceOf[from] -= amount;
        }

        if (fee > 0) {
            uint256 fFund = (fee * uint256(allocFundsBps)) / ALLOC_SUM_BPS;
            uint256 fBurn = (fee * uint256(allocBurnBps)) / ALLOC_SUM_BPS;
            uint256 fDiv = (fee * uint256(allocDividendBps)) / ALLOC_SUM_BPS;
            uint256 fLp = fee - fFund - fBurn - fDiv;

            if (fFund > 0) {
                balanceOf[fundsWallet] += fFund;
                emit Transfer(from, fundsWallet, fFund);
            }
            if (fBurn > 0 || fLp > 0) {
                uint256 toDead = fBurn + fLp;
                balanceOf[DEAD] += toDead;
                emit Transfer(from, DEAD, toDead);
            }
            if (fDiv > 0) {
                balanceOf[address(this)] += fDiv;
                emit Transfer(from, address(this), fDiv);
                pendingDividendTokens += fDiv;
            }
        }

        balanceOf[to] += net;
        emit Transfer(from, to, net);

        if (paysDividendsEnabled && dexFeesActive && allocDividendBps > 0) {
            _update(from);
            _update(to);
        }
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance();
        allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}
