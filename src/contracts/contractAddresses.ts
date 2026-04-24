/**
 * BSC mainnet — defaults match totavault deploy (override with VITE_* in .env).
 *
 * TokenFactory (proxy):     0x9EF2388a7218f55a374DD6d0d0aE49c8aE7b9f67
 * TokenFactory (impl):     0x25DbDB1E75eEC6B4E4b27c52EfA94ADb3b2F8981
 * ProxyAdmin:               0xf6982f4D22bD55d6eA4B3f4d66B0d66E6c1e468d
 * TokenDeployer:            0x132e68dd5C4Af9A9B629d25881f7aefa69493B98
 * BurnAgent:                0x45bF203666F9Eb8750012ef5e2C9f4deb13805F6
 * TotaVaultLocked (lock):   0x7853558aAe580f922823AE16e2dDba12DB5cB496
 *
 * Use proxy for TOKEN_FACTORY, not impl. After deploy, prefer setting VITE_TOKEN_FACTORY,
 * VITE_TOKEN_DEPLOYER, VITE_PLATFORM_TOKEN_LOCK in .env so builds do not drift.
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const pick = (k: string) => env?.[k]?.trim();

export const CONTRACT_ADDRESSES = {
  /** TokenFactory — use o endereço do TransparentUpgradeableProxy (não o impl). */
  TOKEN_FACTORY: pick('VITE_TOKEN_FACTORY') || '0x9EF2388a7218f55a374DD6d0d0aE49c8aE7b9f67',
  /** Contract that actually does CREATE2 `new MemeCoin{salt:...}` (used for vanity mining). */
  TOKEN_DEPLOYER: pick('VITE_TOKEN_DEPLOYER') || '0x132e68dd5C4Af9A9B629d25881f7aefa69493B98',
  /** Platform lock contract — tokens here should not accrue dividends if used as `dividendExempt` at launch. */
  PLATFORM_TOKEN_LOCK: pick('VITE_PLATFORM_TOKEN_LOCK') || '0x7853558aAe580f922823AE16e2dDba12DB5cB496',
};

export const PLATFORM_TOKEN_LOCK_ABI = [
  'function deposit(address token, uint256 amount, uint256 durationSeconds) external',
  'function withdraw(address token, uint256 lockId) external',
  'function lockCount(address user, address token) external view returns (uint256)',
  'function lockInfo(address user, address token, uint256 lockId) external view returns (uint256 amount, uint256 unlockAt, bool withdrawn)',
  'event Locked(address indexed user, address indexed token, uint256 indexed lockId, uint256 amount, uint256 unlockAt)',
  'event Withdrawn(address indexed user, address indexed token, uint256 indexed lockId, uint256 amount)',
] as const;

export const TOKEN_FACTORY_ABI = [
  'function CREATION_MIN_FEE() external view returns (uint256)',
  'function MIN_CREATOR_FIRST_BUY() external view returns (uint256)',
  'function GRADUATION_TARGET() external view returns (uint256)',
  'function createToken(string,string,string,string,string,string,string,string,bool,uint8,bool,(uint8,uint16,uint16,uint16,uint16,uint16,address,uint32,uint16,uint16,address),bytes32) external payable returns (address)',
  'function MAX_TOTAL_TAX_BPS() external view returns (uint16)',
  'function claimFirstBuyTokens(address tokenAddress) external',
  'function updateTokenMetadata(address tokenAddress, string description_, string imageUrl_, string website_, string telegram_, string twitter_, string discord_) external',
  'function creatorFirstBuyLocked(address) external view returns (uint256)',
  'function MIN_CREATOR_FIRST_BUY() external view returns (uint256)',
  'function minCtoFirstBuyWei() external view returns (uint256)',
  'function setMinCtoFirstBuyWei(uint256 amountWei) external',
  'function buyToken(address tokenAddress) external payable',
  'function sellToken(address tokenAddress, uint256 tokenAmount) external',
  'function allTokens(uint256) external view returns (address)',
  'function owner() external view returns (address)',
  'function burnAgent() external view returns (address)',
  'function ecosystemTreasury() external view returns (address)',
  'function totalFeesCollected() external view returns (uint256)',
  'function creationFeesCollected() external view returns (uint256)',
  'function setBurnAgent(address _agent) external',
  'function setEcosystemTreasury(address _treasury) external',
  'function withdrawFees() external',
  'function withdrawCreationFees() external',
  'function banToken(address tokenAddress, string memory reason) external',
  'function unbanToken(address tokenAddress) external',
  'function bannedTokens(address tokenAddress) external view returns (bool)',
  'function claimCreatorTokens(address tokenAddress) external',
  'function creatorTokensLocked(address) external view returns (uint256)',
  'function tokenInfo(address) external view returns (address tokenAddress, string name, string symbol, string description, string imageUrl, string website, string telegram, string twitter, string discord, address creator, uint256 totalSupply, uint256 currentPrice, uint256 marketCap, uint256 createdAt, bool graduated, bool creatorTokensBurned, uint256 vestingEndTime, address dexPair, uint8 firstBuyLockTier, uint256 firstBuyUnlockTime, bool paysDividends, uint8 rewardKind, uint16 totalTaxBps, uint16 allocFundsBps, uint16 allocBurnBps, uint16 allocDividendBps, uint16 allocLpBps, address fundsWallet, uint32 antiBotDurationSec, uint16 antiBotMaxTxBps, uint16 antiBotMaxWalletBps, address dividendExempt)',
  'function VAULT_TOKEN_ADDRESS_SUFFIX() external view returns (uint256)',
  'function tokenDeployer() external view returns (address)',
  'function bondingCurves(address) external view returns (uint256 virtualETH, uint256 virtualToken, uint256 realETH, uint256 realToken, uint256 targetETH)',
  'event TokenCreated(address indexed tokenAddress, address indexed creator, uint256 timestamp, bool creatorTokensBurned)',
  'event TokenPurchased(address indexed tokenAddress, address indexed buyer, uint256 ethAmount, uint256 tokenAmount, uint256 newPrice)',
  'event TokenSold(address indexed tokenAddress, address indexed seller, uint256 tokenAmount, uint256 ethAmount, uint256 newPrice)',
  'event TokenGraduated(address indexed tokenAddress, uint256 finalMarketCap, address indexed dexPair)',
  'event TokenBanned(address indexed tokenAddress, string reason)',
  'event TokenUnbanned(address indexed tokenAddress)',
  'event CreatorTokensClaimed(address indexed tokenAddress, address indexed creator, uint256 amount)',
  'event CreatorFirstBuyClaimed(address indexed tokenAddress, address indexed creator, uint256 amount)',
  'event CreatorTokensBurned(address indexed tokenAddress, uint256 amount)',
  'event TokenMetadataUpdated(address indexed tokenAddress, address indexed creator)',
  'event LiquidityAdded(address indexed tokenAddress, address indexed pair, uint256 ethAmount, uint256 tokenAmount)',
  // Custom errors — required so ethers can decode reverts instead of "require(false)".
  'error Reentrancy()',
  'error OnlyOwner()',
  'error InvalidBurnAgent()',
  'error InvalidTreasury()',
  'error InsufficientValue()',
  'error FirstBuyTooSmall()',
  'error InvalidLockTier()',
  'error DexFeeCap()',
  'error AllocSum()',
  'error RewardKindInvalid()',
  'error InvalidSalt()',
  'error AlreadyGraduated()',
  'error TokenBanned_()',
  'error NetEthZero()',
  'error BurnAgentNotSet()',
  'error EcoFeeFail()',
  'error CreationFeeFail()',
  'error NoLiquidity()',
  'error MustSendEth()',
  'error TokenAlreadyGraduated()',
  'error AmountZero()',
  'error NoBalance()',
  'error InsufficientEthFactory()',
  'error SellerPayFail()',
  'error NothingToAddLP()',
  'error ApproveFail()',
  'error PairNotCreated()',
  'error OnlyCreator()',
  'error CreatorTokensBurned_()',
  'error TokensLocked()',
  'error NothingToClaim()',
  'error NoLockedFirstBuy()',
  'error FirstBuyLocked()',
  'error TokenMissing()',
  'error WithdrawFail()',
  'error CreatorFeeFail()',
  'error CtoMaxBuy()',
  'error CtoMaxWallet()',
  'error AntiBotCfg()',
  'error NotInitialized()',
];
