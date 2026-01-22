// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

contract SimpleArbitrageBot is Ownable {
    using SafeERC20 for IERC20;

    address public immutable vault;
    // Authorized executor (the Agent EOA)
    address public executor;

    event Executed(address indexed tokenIn, uint256 amountIn, uint256 profit);

    constructor(address _vault, address _executor) Ownable(msg.sender) {
        vault = _vault;
        executor = _executor;
    }

    modifier onlyExecutor() {
        require(msg.sender == executor || msg.sender == owner(), "Not authorized");
        _;
    }

    // Naive backrun: Uses contract's own funds
    function backrun(
        address router,
        address tokenIn,
        uint256 amountIn,
        address[] calldata path
    ) external onlyExecutor {
        // 1. Approve router if needed
        IERC20(tokenIn).approve(router, amountIn);

        // 2. Execute Swap (reusing the exact logic from the Strategy decoding)
        // path is expected to be [tokenOut, ..., tokenIn] (Reverse of target tx)
        
        // Safety check: Ensure we are swapping back to a token we want (e.g. WKAIA/USDT)
        // For now, trust the path provided by the Agent
        
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));

        IRouter(router).swapExactTokensForTokens(
            amountIn,
            0, // Slippage 0 for now (Atomic failure if rekt)
            path,
            address(this),
            block.timestamp
        );

        uint256 balanceAfter = IERC20(path[path.length - 1]).balanceOf(address(this));
        
        require(balanceAfter > balanceBefore, "No profit");

        // 3. Send Profit to Vault? Or keep for compounding?
        // Let's send it to Vault for safety demonstration
        // uint256 profit = balanceAfter - balanceBefore;
        // IERC20(path[path.length - 1]).safeTransfer(vault, profit);
        
        emit Executed(tokenIn, amountIn, balanceAfter - balanceBefore);
    }
    
    // Admin functions to withdraw funds or rescue tokens
    function withdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(vault, amount);
    }
}
