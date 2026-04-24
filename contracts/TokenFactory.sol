// SPDX-License-Identifier: MIT



// /$$$$$$$$ /$$$$$$  /$$$$$$$$ /$$$$$$  /$$   /$$ /$$$$$$$$ /$$   /$$ /$$$$$$$$  /$$$$$$  /$$$$$$$$ /$$$$$$ 
//|__  $$__//$$__  $$|__  $$__//$$__  $$| $$  /$$/| $$_____/| $$  /$$/| $$_____/ /$$__  $$|__  $$__//$$__  $$
//   | $$  | $$  \ $$   | $$  | $$  \ $$| $$ /$$/ | $$      | $$ /$$/ | $$      | $$  \__/   | $$  | $$  \ $$
//   | $$  | $$  | $$   | $$  | $$$$$$$$| $$$$$/  | $$$$$   | $$$$$/  | $$$$$   | $$         | $$  | $$  | $$
//   | $$  | $$  | $$   | $$  | $$__  $$| $$  $$  | $$__/   | $$  $$  | $$__/   | $$         | $$  | $$  | $$
//   | $$  | $$  | $$   | $$  | $$  | $$| $$\  $$ | $$      | $$\  $$ | $$      | $$    $$   | $$  | $$  | $$
//   | $$  |  $$$$$$/   | $$  | $$  | $$| $$ \  $$| $$$$$$$$| $$ \  $$| $$$$$$$$|  $$$$$$/   | $$  |  $$$$$$/
//   |__/   \______/    |__/  |__/  |__/|__/  \__/|________/|__/  \__/|________/ \______/    |__/   \______/ 
                                                                                                           
                                                                                                           
                                                                                                                                                                                        

pragma solidity ^0.8.19;

import "./MemeCoin.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IERC20.sol";

interface ITokenDeployer {
    function deployMemeCoin(
        string memory name_,
        string memory symbol_,
        address factory_,
        bytes32 salt,
        uint256 requiredSuffix
    ) external returns (address tokenAddress);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IUniswapV2Router02 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
}

interface IBurnAgent {
    function handle() external payable;
}

contract TokenFactory is Initializable, OwnableUpgradeable {
    error Reentrancy();
    error OnlyOwner();
    error InvalidBurnAgent();
    error InvalidTreasury();
    error InsufficientValue();
    error FirstBuyTooSmall();
    error InvalidLockTier();
    error DexFeeCap();
    error AllocSum();
    error RewardKindInvalid();
    error InvalidSalt();
    error AlreadyGraduated();
    error TokenBanned_();
    error NetEthZero();
    error BurnAgentNotSet();
    error EcoFeeFail();
    error CreationFeeFail();
    error NoLiquidity();
    error MustSendEth();
    error TokenAlreadyGraduated();
    error AmountZero();
    error NoBalance();
    error InsufficientEthFactory();
    error SellerPayFail();
    error NothingToAddLP();
    error ApproveFail();
    error PairNotCreated();
    error OnlyCreator();
    error CreatorTokensBurned_();
    error TokensLocked();
    error NothingToClaim();
    error NoLockedFirstBuy();
    error FirstBuyLocked();
    error TokenMissing();
    error WithdrawFail();
    error CreatorFeeFail();
    error CtoMaxBuy();
    error CtoMaxWallet();
    error AntiBotCfg();
    error NotInitialized();
    uint256 private _locked = 1;
    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    ITokenDeployer public tokenDeployer;

    address private constant UNIV2_FACTORY_BASE = 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73;
    address private constant UNIV2_ROUTER_BASE  = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address private constant WETH_BASE          = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    /// @notice BSC mainnet USDT (BEP-20) — dividend reward option.
    address private constant USDT_BASE          = 0x55d398326f99059fF775485246999027B3197955;



    IUniswapV2Router02 public router = IUniswapV2Router02(UNIV2_ROUTER_BASE);
    IUniswapV2Factory  public dexFactory = IUniswapV2Factory(UNIV2_FACTORY_BASE);
    address public WETH = WETH_BASE;

    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;


    /// @notice Pre-sale (bonding curve in dapp only) — TEST CONFIG: very small fees (1 bps each).
    uint256 public constant ECOSYSTEM_FEE = 1;
    uint256 public constant CREATOR_FEE   = 1;
    uint256 public constant BURNAGENT_FEE = 0;

    /// @notice Mainnet config — creation fee + first buy minimums.
    uint256 public constant CREATION_MIN_FEE = 0.0032 ether;
    uint256 public constant MIN_CREATOR_FIRST_BUY = 0.0001 ether;
    uint256 public constant GRADUATION_TARGET = 13 ether;
    /// @notice All 1B supply is available on the bonding curve.
    /// Any unused tokens (e.g., router leftovers when seeding LP) are burned on graduation.
    uint256 public constant CREATOR_ALLOCATION = 0;
    uint256 public constant TRADING_SUPPLY     = 1_000_000_000 * 1e18;
    uint256 public constant VESTING_PERIOD     = 0;
    /** CTO seal (creator first buy locked) — TEST CONFIG: effectively no cap (100%). */
    uint16 public constant CTO_MAX_BPS = 10000;
    /** Anti-bot config: OFF (0) or 1 day only. */
    uint32 public constant ANTIBOT_MAX_DURATION_SEC = 1 days;

    /// @notice Max total DEX tax after graduation (marketing+burn+div+LP combined), in bps.
    uint16 public constant MAX_TOTAL_TAX_BPS = 1000;

    uint256 private constant _ADDRESS_SUFFIX_MASK = 0xFFFF;
    /// @notice All tokens deployed via createToken must end with these 4 hex digits (CREATE2 vanity).
    uint256 public constant VAULT_TOKEN_ADDRESS_SUFFIX = 0x8888;

    /// @notice 0 = no lock on creator first buy; 1 = 90d; 2 = 180d; 3 = 365d
    uint8 public constant FIRST_BUY_LOCK_NONE = 0;
    uint8 public constant FIRST_BUY_LOCK_3M   = 1;
    uint8 public constant FIRST_BUY_LOCK_6M   = 2;
    uint8 public constant FIRST_BUY_LOCK_12M  = 3;

    address public ecosystemTreasury; 
    address public burnAgent;         

    uint256 public totalFeesCollected;     
    uint256 public creationFeesCollected;  

    /// @notice Minimum first-buy (in wei) required when CTO mode is used (firstBuyLockTier != NONE).
    /// If set below MIN_CREATOR_FIRST_BUY, MIN_CREATOR_FIRST_BUY acts as the floor.
    uint256 public minCtoFirstBuyWei;

    struct LaunchConfig {
        uint8 rewardKind;
        uint16 totalTaxBps;
        uint16 allocFundsBps;
        uint16 allocBurnBps;
        uint16 allocDividendBps;
        uint16 allocLpBps;
        address fundsWallet;
        uint32 antiBotDurationSec;
        uint16 antiBotMaxTxBps;
        uint16 antiBotMaxWalletBps;
        address dividendExempt;
    }

    struct TokenInfo {
        address tokenAddress;
        string  name;
        string  symbol;
        string  description;
        string  imageUrl;

        string  website;
        string  telegram;
        string  twitter;
        string  discord;

        address creator;
        uint256 totalSupply;
        uint256 currentPrice;
        uint256 marketCap;
        uint256 createdAt;
        bool    graduated;
        bool    creatorTokensBurned;
        uint256 vestingEndTime;
        address dexPair;
        uint8   firstBuyLockTier;
        uint256 firstBuyUnlockTime;
        bool    paysDividends;
        uint8   rewardKind;
        uint16  totalTaxBps;
        uint16  allocFundsBps;
        uint16  allocBurnBps;
        uint16  allocDividendBps;
        uint16  allocLpBps;
        address fundsWallet;
        uint32  antiBotDurationSec;
        uint16  antiBotMaxTxBps;
        uint16  antiBotMaxWalletBps;
        address dividendExempt;
    }

    struct BondingCurve {
        uint256 virtualETH;
        uint256 virtualToken;
        uint256 realETH;
        uint256 realToken;
        uint256 targetETH;
    }

    mapping(address => TokenInfo) public tokenInfo;
    mapping(address => BondingCurve) public bondingCurves;
    mapping(address => uint256) public creatorTokensLocked;
    mapping(address => uint256) public creatorFirstBuyLocked;
    mapping(address => bool)    public bannedTokens;

    address[] public allTokens;

    function _spotPrice(BondingCurve storage c) private view returns (uint256) {
        if (c.virtualToken == 0) revert NoLiquidity();
        return (c.virtualETH * 1e18) / c.virtualToken;
    }

    function _getBuyAmount(BondingCurve storage c, uint256 ethAmount) private view returns (uint256) {
        uint256 newVETH = c.virtualETH + ethAmount;
        uint256 newVToken = (c.virtualETH * c.virtualToken) / newVETH;
        return c.virtualToken - newVToken;
    }

    function _getSellAmount(BondingCurve storage c, uint256 tokenAmount) private view returns (uint256) {
        uint256 newVToken = c.virtualToken + tokenAmount;
        uint256 newVETH = (c.virtualETH * c.virtualToken) / newVToken;
        return c.virtualETH - newVETH;
    }

    function _syncBondingView(address tokenAddress, BondingCurve storage c) private {
        uint256 p = _spotPrice(c);
        uint256 ts = tokenInfo[tokenAddress].totalSupply;
        tokenInfo[tokenAddress].currentPrice = p;
        tokenInfo[tokenAddress].marketCap = (p * ts) / 1e18;
    }

    function _forwardEcosystemFee(uint256 ecoFee) private {
        if (ecosystemTreasury != address(0)) {
            (bool okE, ) = payable(ecosystemTreasury).call{value: ecoFee}("");
            if (!okE) revert EcoFeeFail();
        } else {
            totalFeesCollected += ecoFee;
        }
    }

    function _forwardBurnFee(uint256 burnF) private {
        if (burnF == 0) return;
        if (burnAgent == address(0)) revert BurnAgentNotSet();
        IBurnAgent(burnAgent).handle{value: burnF}();
    }

    function _isCto(address tokenAddress) internal view returns (bool) {
        return tokenInfo[tokenAddress].firstBuyLockTier != FIRST_BUY_LOCK_NONE;
    }

    function _ctoCap(address tokenAddress) internal view returns (uint256) {
        return (tokenInfo[tokenAddress].totalSupply * uint256(CTO_MAX_BPS)) / 10000;
    }

    event TokenBanned(address indexed tokenAddress, string reason);
    event TokenUnbanned(address indexed tokenAddress);
    event CreatorTokensClaimed(address indexed tokenAddress, address indexed creator, uint256 amount);
    event CreatorFirstBuyClaimed(address indexed tokenAddress, address indexed creator, uint256 amount);
    event CreatorTokensBurned(address indexed tokenAddress, uint256 amount);
    event TokenCreated(address indexed tokenAddress, address indexed creator, uint256 timestamp, bool creatorTokensBurned);
    event TokenPurchased(address indexed tokenAddress, address indexed buyer, uint256 ethIn, uint256 tokenOut, uint256 newPrice);
    event TokenSold(address indexed tokenAddress, address indexed seller, uint256 tokenIn, uint256 ethOut, uint256 newPrice);
    event LiquidityAdded(address indexed tokenAddress, address indexed pair, uint256 ethAmount, uint256 tokenAmount);
    event TokenGraduated(address indexed tokenAddress, uint256 finalMarketCap, address indexed dexPair);
    event BurnAgentUpdated(address indexed agent);
    event EcosystemTreasuryUpdated(address indexed treasury);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event CreationFeesWithdrawn(address indexed to, uint256 amount);
    event MinCtoFirstBuyUpdated(uint256 amountWei);
    event TokenMetadataUpdated(address indexed tokenAddress, address indexed creator);
    function initialize(address tokenDeployer_) external initializer {
        __Ownable_init(msg.sender);
        // Proxy storage starts zeroed; nonReentrant expects 1.
        _locked = 1;
        // If ecosystemTreasury is zero, fees accumulate in-contract and can be claimed via withdraw*().
        ecosystemTreasury = address(0);
        tokenDeployer = ITokenDeployer(tokenDeployer_);
        // TEST CONFIG — small CTO minimum; owner can change via setMinCtoFirstBuyWei.
        minCtoFirstBuyWei = 0.001 ether;
        emit EcosystemTreasuryUpdated(address(0));
        emit MinCtoFirstBuyUpdated(minCtoFirstBuyWei);
    }

    function setBurnAgent(address _agent) external {
        if (msg.sender != owner()) revert OnlyOwner();
        if (_agent == address(0)) revert InvalidBurnAgent();
        burnAgent = _agent;
        emit BurnAgentUpdated(_agent);
    }

    function setEcosystemTreasury(address _treasury) external {
        if (msg.sender != owner()) revert OnlyOwner();
        // Allow zero address to disable auto-forwarding and accumulate fees in-contract.
        ecosystemTreasury = _treasury;
        emit EcosystemTreasuryUpdated(_treasury);
    }

    /// @notice Set minimum first-buy (in wei) required when CTO lock is enabled.
    /// Must be at least MIN_CREATOR_FIRST_BUY.
    function setMinCtoFirstBuyWei(uint256 amountWei) external {
        if (msg.sender != owner()) revert OnlyOwner();
        if (amountWei < MIN_CREATOR_FIRST_BUY) revert FirstBuyTooSmall();
        minCtoFirstBuyWei = amountWei;
        emit MinCtoFirstBuyUpdated(amountWei);
    }

    function _bootstrapDeployedToken(
        address tokenAddress,
        MemeCoin newToken,
        string memory name_,
        string memory symbol_,
        string memory description_,
        string memory imageUrl_,
        string memory website_,
        string memory telegram_,
        string memory twitter_,
        string memory discord_,
        bool burnCreatorTokens,
        bool paysDividends_,
        LaunchConfig calldata lc,
        address creator_
    ) private {
        bondingCurves[tokenAddress] = BondingCurve({
            virtualETH: 30 ether,
            virtualToken: 1_073_000_000 * 1e18,
            realETH: 0,
            realToken: TRADING_SUPPLY,
            targetETH: GRADUATION_TARGET
        });

        newToken.mint(address(this), TRADING_SUPPLY);
        // Creator allocation removed in this tokenomics (CREATOR_ALLOCATION = 0).
        // Keep the field consistent so claimCreatorTokens is disabled.
        if (burnCreatorTokens) {
            emit CreatorTokensBurned(tokenAddress, 0);
        }

        BondingCurve storage curveInit = bondingCurves[tokenAddress];
        uint256 ts = 1_000_000_000 * 1e18;
        uint256 initPx = _spotPrice(curveInit);
        tokenInfo[tokenAddress] = TokenInfo({
            tokenAddress: tokenAddress,
            name: name_,
            symbol: symbol_,
            description: description_,
            imageUrl: imageUrl_,
            website: website_,
            telegram: telegram_,
            twitter: twitter_,
            discord: discord_,
            creator: creator_,
            totalSupply: ts,
            currentPrice: initPx,
            marketCap: (initPx * ts) / 1e18,
            createdAt: block.timestamp,
            graduated: false,
            creatorTokensBurned: true,
            vestingEndTime: 0,
            dexPair: address(0),
            firstBuyLockTier: 0,
            firstBuyUnlockTime: 0,
            paysDividends: paysDividends_,
            rewardKind: lc.rewardKind,
            totalTaxBps: lc.totalTaxBps,
            allocFundsBps: lc.allocFundsBps,
            allocBurnBps: lc.allocBurnBps,
            allocDividendBps: lc.allocDividendBps,
            allocLpBps: lc.allocLpBps,
            fundsWallet: lc.fundsWallet,
            antiBotDurationSec: lc.antiBotDurationSec,
            antiBotMaxTxBps: lc.antiBotMaxTxBps,
            antiBotMaxWalletBps: lc.antiBotMaxWalletBps,
            dividendExempt: lc.dividendExempt
        });

        allTokens.push(tokenAddress);
    }

    function createToken(
        string memory name_,
        string memory symbol_,
        string memory description_,
        string memory imageUrl_,
        string memory website_,
        string memory telegram_,
        string memory twitter_,
        string memory discord_,
        bool   burnCreatorTokens,
        uint8  firstBuyLockTier,
        bool   paysDividends_,
        LaunchConfig calldata lc,
        bytes32 salt
    ) external payable nonReentrant returns (address) {
        if (address(tokenDeployer) == address(0)) revert NotInitialized();
        if (msg.value < CREATION_MIN_FEE + MIN_CREATOR_FIRST_BUY) revert InsufficientValue();
        uint256 firstBuyWei = msg.value - CREATION_MIN_FEE;
        if (firstBuyWei < MIN_CREATOR_FIRST_BUY) revert FirstBuyTooSmall();
        // Extra floor only when CTO mode is used (firstBuyLockTier != NONE).
        if (firstBuyLockTier != FIRST_BUY_LOCK_NONE) {
            uint256 minCto = minCtoFirstBuyWei;
            if (minCto < MIN_CREATOR_FIRST_BUY) {
                minCto = MIN_CREATOR_FIRST_BUY;
            }
            if (firstBuyWei < minCto) revert FirstBuyTooSmall();
        }
        if (firstBuyLockTier > FIRST_BUY_LOCK_12M) revert InvalidLockTier();
        if (uint256(lc.totalTaxBps) > uint256(MAX_TOTAL_TAX_BPS)) revert DexFeeCap();
        // If totalTaxBps == 0 => allow a tax-free token (all allocs may be 0).
        if (lc.totalTaxBps > 0) {
            uint256 asum = uint256(lc.allocFundsBps) +
                uint256(lc.allocBurnBps) +
                uint256(lc.allocDividendBps) +
                uint256(lc.allocLpBps);
            if (asum != 10000) revert AllocSum();
            if (lc.allocFundsBps > 0 && lc.fundsWallet == address(0)) revert InvalidTreasury();
            if (lc.allocDividendBps > 0 && !paysDividends_) revert RewardKindInvalid();
        }
        if (paysDividends_ && lc.rewardKind > 1) revert RewardKindInvalid();
        if (!paysDividends_ && lc.rewardKind != 0) revert RewardKindInvalid();
        if (lc.antiBotDurationSec != 0 && lc.antiBotDurationSec != ANTIBOT_MAX_DURATION_SEC) revert AntiBotCfg();
        if (lc.antiBotMaxTxBps != 0 || lc.antiBotMaxWalletBps != 0) revert AntiBotCfg();

        _collectCreationFee(CREATION_MIN_FEE);

        address tokenAddress = tokenDeployer.deployMemeCoin(
            name_,
            symbol_,
            address(this),
            salt,
            VAULT_TOKEN_ADDRESS_SUFFIX
        );
        MemeCoin newToken = MemeCoin(tokenAddress);

        _bootstrapDeployedToken(
            tokenAddress,
            newToken,
            name_,
            symbol_,
            description_,
            imageUrl_,
            website_,
            telegram_,
            twitter_,
            discord_,
            burnCreatorTokens,
            paysDividends_,
            lc,
            msg.sender
        );

        _creatorFirstBuy(tokenAddress, msg.sender, firstBuyWei, firstBuyLockTier);

        emit TokenCreated(tokenAddress, msg.sender, block.timestamp, burnCreatorTokens);
        return tokenAddress;
    }

    function _creatorFirstBuy(
        address tokenAddress,
        address creator_,
        uint256 grossEth,
        uint8 lockTier
    ) private {
        if (tokenInfo[tokenAddress].graduated) revert AlreadyGraduated();
        if (bannedTokens[tokenAddress]) revert TokenBanned_();

        BondingCurve storage c = bondingCurves[tokenAddress];

        uint256 ecoFee   = (grossEth * ECOSYSTEM_FEE) / 10000;
        uint256 creatorF = (grossEth * CREATOR_FEE)   / 10000;
        uint256 burnF    = (grossEth * BURNAGENT_FEE) / 10000;

        uint256 netETH   = grossEth - ecoFee - creatorF - burnF;
        if (netETH == 0) revert NetEthZero();

        uint256 tokenAmount = _getBuyAmount(c, netETH);
        // 5% max per buy for any investor (bonding curve phase)
        uint256 cap = _ctoCap(tokenAddress);
        if (tokenAmount > cap) revert CtoMaxBuy();

        c.virtualETH   += netETH;
        c.realETH      += netETH;
        c.virtualToken -= tokenAmount;
        c.realToken    -= tokenAmount;

        _payCreatorFeePresale(tokenAddress, creatorF);

        _forwardBurnFee(burnF);
        _forwardEcosystemFee(ecoFee);

        _syncBondingView(tokenAddress, c);

        emit TokenPurchased(tokenAddress, creator_, grossEth, tokenAmount, tokenInfo[tokenAddress].currentPrice);

        uint256 unlockTime = 0;
        if (lockTier == FIRST_BUY_LOCK_3M) {
            unlockTime = block.timestamp + 90 days;
        } else if (lockTier == FIRST_BUY_LOCK_6M) {
            unlockTime = block.timestamp + 180 days;
        } else if (lockTier == FIRST_BUY_LOCK_12M) {
            unlockTime = block.timestamp + 365 days;
        }

        tokenInfo[tokenAddress].firstBuyLockTier = lockTier;
        tokenInfo[tokenAddress].firstBuyUnlockTime = unlockTime;

        if (lockTier == FIRST_BUY_LOCK_NONE) {
            // 5% max per wallet (only applies when tokens land in the wallet)
            if (MemeCoin(tokenAddress).balanceOf(creator_) + tokenAmount > cap) revert CtoMaxWallet();
            MemeCoin(tokenAddress).transfer(creator_, tokenAmount);
        } else {
            creatorFirstBuyLocked[tokenAddress] = tokenAmount;
        }

        if (c.realETH >= GRADUATION_TARGET) {
            _graduateToken(tokenAddress);
        }
    }

    function _collectCreationFee(uint256 amount) internal {
        if (ecosystemTreasury != address(0)) {
            (bool ok, ) = payable(ecosystemTreasury).call{value: amount}("");
            if (!ok) revert CreationFeeFail();
        } else {
            creationFeesCollected += amount;
        }
    }

    function buyToken(address tokenAddress) external payable nonReentrant {
        if (msg.value == 0) revert MustSendEth();
        if (tokenInfo[tokenAddress].graduated) revert TokenAlreadyGraduated();
        if (bannedTokens[tokenAddress]) revert TokenBanned_();

        BondingCurve storage c = bondingCurves[tokenAddress];

        uint256 ecoFee   = (msg.value * ECOSYSTEM_FEE) / 10000; 
        uint256 creatorF = (msg.value * CREATOR_FEE)   / 10000; 
        uint256 burnF    = (msg.value * BURNAGENT_FEE) / 10000; 

        uint256 netETH   = msg.value - ecoFee - creatorF - burnF;
        if (netETH == 0) revert NetEthZero();

        uint256 tokenAmount = _getBuyAmount(c, netETH);
        // 5% max per buy + per wallet for any investor (bonding curve phase)
        uint256 cap = _ctoCap(tokenAddress);
        if (tokenAmount > cap) revert CtoMaxBuy();
        if (MemeCoin(tokenAddress).balanceOf(msg.sender) + tokenAmount > cap) revert CtoMaxWallet();

        c.virtualETH   += netETH;
        c.realETH      += netETH;
        c.virtualToken -= tokenAmount;
        c.realToken    -= tokenAmount;

        MemeCoin(tokenAddress).transfer(msg.sender, tokenAmount);

        _payCreatorFeePresale(tokenAddress, creatorF);

        _forwardBurnFee(burnF);
        _forwardEcosystemFee(ecoFee);

        _syncBondingView(tokenAddress, c);

        emit TokenPurchased(tokenAddress, msg.sender, msg.value, tokenAmount, tokenInfo[tokenAddress].currentPrice);

        if (c.realETH >= GRADUATION_TARGET) {
            _graduateToken(tokenAddress);
        }
    }

    function sellToken(address tokenAddress, uint256 tokenAmount) external nonReentrant {
        if (tokenAmount == 0) revert AmountZero();
        if (tokenInfo[tokenAddress].graduated) revert TokenAlreadyGraduated();
        if (bannedTokens[tokenAddress]) revert TokenBanned_();
        if (MemeCoin(tokenAddress).balanceOf(msg.sender) < tokenAmount) revert NoBalance();

        BondingCurve storage c = bondingCurves[tokenAddress];

        uint256 ethAmount = _getSellAmount(c, tokenAmount);

        uint256 ecoFee   = (ethAmount * ECOSYSTEM_FEE) / 10000; 
        uint256 creatorF = (ethAmount * CREATOR_FEE)   / 10000; 
        uint256 burnF    = (ethAmount * BURNAGENT_FEE) / 10000; 

        uint256 netETH   = ethAmount - ecoFee - creatorF - burnF;
        if (netETH > address(this).balance) revert InsufficientEthFactory();

        c.virtualETH   -= ethAmount;
        c.virtualToken += tokenAmount;

        c.realETH   -= netETH;
        c.realToken += tokenAmount;

        MemeCoin(tokenAddress).transferFrom(msg.sender, address(this), tokenAmount);

        (bool okS, ) = payable(msg.sender).call{value: netETH}("");
        if (!okS) revert SellerPayFail();

        _payCreatorFeePresale(tokenAddress, creatorF);

        _forwardBurnFee(burnF);
        _forwardEcosystemFee(ecoFee);

        _syncBondingView(tokenAddress, c);

        emit TokenSold(tokenAddress, msg.sender, tokenAmount, ethAmount, tokenInfo[tokenAddress].currentPrice);
    }

    function _graduateToken(address tokenAddress) private {
        BondingCurve storage c = bondingCurves[tokenAddress];

        uint256 reserved = totalFeesCollected + creationFeesCollected;
        uint256 ethForLP = address(this).balance;
        if (reserved <= ethForLP) {
            ethForLP -= reserved;
        } else {
            ethForLP = 0;
        }

        uint256 tokenForLP = c.realToken;
        if (ethForLP == 0 || tokenForLP == 0) revert NothingToAddLP();

        address pair = _createDEXLiquidity(tokenAddress, ethForLP, tokenForLP);

        // Burn any leftover tokens that were not used for LP (router can return less than requested).
        // With 100% supply on the curve, this ensures anything "left in the curve contract" at graduation is burned.
        uint256 leftover = IERC20(tokenAddress).balanceOf(address(this));
        if (leftover > 0) {
            IERC20(tokenAddress).transfer(DEAD, leftover);
        }

        tokenInfo[tokenAddress].graduated = true;
        tokenInfo[tokenAddress].dexPair   = pair;

        c.realETH   = 0;
        c.realToken = 0;

        TokenInfo storage ti = tokenInfo[tokenAddress];
        address rewardT = address(0);
        if (ti.paysDividends && ti.allocDividendBps > 0) {
            rewardT = ti.rewardKind == 1 ? USDT_BASE : WETH;
        }

        MemeCoin.DexFeeConfig memory cfg;
        cfg.creator = ti.creator;
        cfg.lpPair = pair;
        cfg.fundsWallet = ti.fundsWallet;
        cfg.totalTaxBps = ti.totalTaxBps;
        cfg.allocFundsBps = ti.allocFundsBps;
        cfg.allocBurnBps = ti.allocBurnBps;
        cfg.allocDividendBps = ti.allocDividendBps;
        cfg.allocLpBps = ti.allocLpBps;
        cfg.taxEnabled = ti.totalTaxBps > 0;
        cfg.paysDividends = ti.paysDividends;
        cfg.swapRouter = address(router);
        cfg.WETH = WETH;
        cfg.rewardToken = rewardT;
        cfg.antiBotUntil = ti.antiBotDurationSec == 0 ? 0 : block.timestamp + uint256(ti.antiBotDurationSec);
        cfg.antiBotMaxTxBps = ti.antiBotMaxTxBps;
        cfg.antiBotMaxWalletBps = ti.antiBotMaxWalletBps;
        cfg.dividendExempt = ti.dividendExempt;

        MemeCoin(tokenAddress).activateDexFees(cfg);

        _syncBondingView(tokenAddress, c);

        emit TokenGraduated(tokenAddress, tokenInfo[tokenAddress].marketCap, pair);
    }

    function _createDEXLiquidity(address tokenAddress, uint256 ethAmount, uint256 tokenAmount)
        private
        returns (address)
    {
        MemeCoin token = MemeCoin(tokenAddress);

        if (!token.approve(address(router), tokenAmount)) revert ApproveFail();

        (uint amountToken, uint amountETH, uint liquidity) = router.addLiquidityETH{value: ethAmount}(
            tokenAddress,
            tokenAmount,
            0,
            0,
            address(this),
            block.timestamp + 600
        );

        address pair = dexFactory.getPair(tokenAddress, WETH);
        if (pair == address(0)) revert PairNotCreated();

        IERC20(pair).transfer(DEAD, liquidity);

        emit LiquidityAdded(tokenAddress, pair, amountETH, amountToken);
        return pair;
    }

    /// @notice Allow the token creator to update off-chain metadata (description, image, socials)
    /// after the token is launched. Only the creator of a specific memecoin can call this for that token.
    function updateTokenMetadata(
        address tokenAddress,
        string calldata description_,
        string calldata imageUrl_,
        string calldata website_,
        string calldata telegram_,
        string calldata twitter_,
        string calldata discord_
    ) external {
        TokenInfo storage ti = tokenInfo[tokenAddress];
        if (ti.tokenAddress == address(0)) revert TokenMissing();
        if (msg.sender != ti.creator) revert OnlyCreator();
        ti.description = description_;
        ti.imageUrl    = imageUrl_;
        ti.website     = website_;
        ti.telegram    = telegram_;
        ti.twitter     = twitter_;
        ti.discord     = discord_;
        emit TokenMetadataUpdated(tokenAddress, msg.sender);
    }

    function claimCreatorTokens(address tokenAddress) external nonReentrant {
        if (msg.sender != tokenInfo[tokenAddress].creator) revert OnlyCreator();
        if (tokenInfo[tokenAddress].creatorTokensBurned) revert CreatorTokensBurned_();
        if (block.timestamp < tokenInfo[tokenAddress].vestingEndTime) revert TokensLocked();
        uint256 amt = creatorTokensLocked[tokenAddress];
        if (amt == 0) revert NothingToClaim();
        creatorTokensLocked[tokenAddress] = 0;
        MemeCoin(tokenAddress).transfer(msg.sender, amt);
        emit CreatorTokensClaimed(tokenAddress, msg.sender, amt);
    }

    function claimFirstBuyTokens(address tokenAddress) external nonReentrant {
        if (msg.sender != tokenInfo[tokenAddress].creator) revert OnlyCreator();
        uint256 unlockAt = tokenInfo[tokenAddress].firstBuyUnlockTime;
        if (unlockAt == 0) revert NoLockedFirstBuy();
        if (block.timestamp < unlockAt) revert FirstBuyLocked();
        uint256 amt = creatorFirstBuyLocked[tokenAddress];
        if (amt == 0) revert NothingToClaim();
        creatorFirstBuyLocked[tokenAddress] = 0;
        MemeCoin(tokenAddress).transfer(msg.sender, amt);
        emit CreatorFirstBuyClaimed(tokenAddress, msg.sender, amt);
    }

    function banToken(address tokenAddress, string memory reason) external {
        if (msg.sender != owner()) revert OnlyOwner();
        if (tokenInfo[tokenAddress].tokenAddress == address(0)) revert TokenMissing();
        bannedTokens[tokenAddress] = true;
        emit TokenBanned(tokenAddress, reason);
    }

    function unbanToken(address tokenAddress) external {
        if (msg.sender != owner()) revert OnlyOwner();
        bannedTokens[tokenAddress] = false;
        emit TokenUnbanned(tokenAddress);
    }

    function withdrawFees() external nonReentrant {
        if (msg.sender != owner()) revert OnlyOwner();
        uint256 amt = totalFeesCollected;
        totalFeesCollected = 0;
        (bool ok, ) = payable(owner()).call{value: amt}("");
        if (!ok) revert WithdrawFail();
        emit FeesWithdrawn(owner(), amt);
    }

    function withdrawCreationFees() external nonReentrant {
        if (msg.sender != owner()) revert OnlyOwner();
        uint256 amt = creationFeesCollected;
        creationFeesCollected = 0;
        (bool ok, ) = payable(owner()).call{value: amt}("");
        if (!ok) revert WithdrawFail();
        emit CreationFeesWithdrawn(owner(), amt);
    }

    /// @notice Pre-sale only: full creator fee to creator. No dividends (those apply on PancakeSwap via MemeCoin).
    function _payCreatorFeePresale(address tokenAddress, uint256 creatorF) internal {
        if (creatorF == 0) return;
        address c = tokenInfo[tokenAddress].creator;
        (bool okC, ) = payable(c).call{value: creatorF}("");
        if (!okC) revert CreatorFeeFail();
    }

    receive() external payable {}
}
