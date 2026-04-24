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

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IUniswapV2Router02 {
    function WETH() external pure returns (address);

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable;
}

contract BurnAgent {
    address public owner;
    address public platformToken;
    IUniswapV2Router02 public immutable router;
    address public immutable WETH;

    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    event PlatformTokenUpdated(address newToken);
    event BurnExecuted(uint256 ethIn);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _router) {
        require(_router != address(0), "Invalid router address");
        owner = msg.sender;
        router = IUniswapV2Router02(_router);
        WETH = router.WETH();
    }

    function setPlatformToken(address _newToken) external onlyOwner {
        require(_newToken != address(0), "Invalid token");
        platformToken = _newToken;
        emit PlatformTokenUpdated(_newToken);
    }

    function handle() external payable {
        _burnWithETH(msg.value);
    }

    receive() external payable {
        _burnWithETH(msg.value);
    }

    function _burnWithETH(uint256 amount) internal {
        require(amount > 0, "No ETH sent");
        require(platformToken != address(0), "Platform token not set");

        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = platformToken;

        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: amount}(
            0,
            path,
            DEAD,
            block.timestamp + 600
        );

        emit BurnExecuted(amount);
    }

    function rescueETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to rescue");
        payable(owner).transfer(balance);
    }

    function rescueTokens(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than zero");
        IERC20(token).transfer(owner, amount);
    }
}
