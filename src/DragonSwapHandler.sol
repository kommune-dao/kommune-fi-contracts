// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {ISwapRouter, INonfungiblePositionManager} from "./interfaces/IDragonSwap.sol";

/**
 * @title DragonSwapHandler
 * @dev Handles interactions with DragonSwap V3 (swaps and liquidity)
 * Replaces the old SwapContract which was bound to Balancer
 */
contract DragonSwapHandler is OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    ISwapRouter public swapRouter;
    INonfungiblePositionManager public positionManager;

    // Mapping to store authorized callers (VaultCore, Agent)
    mapping(address => bool) public authorizedCallers;

    event SwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event LiquidityAdded(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    event LiquidityRemoved(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    event FeesCollected(uint256 indexed tokenId, uint256 amount0, uint256 amount1);
    event CallerAuthorized(address indexed caller, bool status);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _swapRouter, address _positionManager) external initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        swapRouter = ISwapRouter(_swapRouter);
        positionManager = INonfungiblePositionManager(_positionManager);
    }

    modifier onlyAuthorized() {
        require(authorizedCallers[msg.sender] || msg.sender == owner(), "Not authorized");
        _;
    }

    function setAuthorizedCaller(address caller, bool status) external onlyOwner {
        authorizedCallers[caller] = status;
        emit CallerAuthorized(caller, status);
    }

    // --- Swap Functions ---

    /**
     * @notice Swap exact input amount for output (e.g., Rebalancing).
     * @dev Includes a -1 wei buffer when calculating `actualIn` to prevent transfer-tax/rebasing rounding errors.
     * @param tokenIn Address of the input token.
     * @param tokenOut Address of the output token.
     * @param fee The pool fee tier (e.g. 500, 3000).
     * @param amountIn The exact amount of input tokens to swap.
     * @param amountOutMinimum The minimum amount of output tokens to receive (slippage protection).
     * @return amountOut The actual amount of output tokens received.
     */
    function swapExactInput(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external onlyAuthorized nonReentrant returns (uint256 amountOut) {
        // Transfer tokens from caller to this contract
        uint256 balBefore = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 actualIn = IERC20(tokenIn).balanceOf(address(this)) - balBefore;
        if (actualIn > 0) actualIn -= 1; // Safety buffer for rebasing rounding

        // Approve router
        IERC20(tokenIn).forceApprove(address(swapRouter), actualIn);

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: msg.sender, // Send output directly to caller
            deadline: block.timestamp,
            amountIn: actualIn,
            amountOutMinimum: amountOutMinimum,
            sqrtPriceLimitX96: 0
        });

        amountOut = swapRouter.exactInputSingle(params);
        
        // Clear approval
        IERC20(tokenIn).forceApprove(address(swapRouter), 0);
        
        emit SwapExecuted(tokenIn, tokenOut, actualIn, amountOut);
    }

    /**
     * @notice Swap for exact output amount (e.g., Instant Withdraw).
     * @dev CAUTION: User must specify maximum input amount they are willing to spend.
     *      Unused input tokens are refunded to the caller.
     * @param tokenIn Address of the input token.
     * @param tokenOut Address of the output token.
     * @param fee The pool fee tier.
     * @param amountOut The exact amount of output tokens desired.
     * @param amountInMaximum The maximum amount of input tokens willing to spend.
     * @return amountIn The actual amount of input tokens spent.
     */
    function swapExactOutput(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountOut,
        uint256 amountInMaximum
    ) external onlyAuthorized nonReentrant returns (uint256 amountIn) {
        // Transfer max input tokens from caller to this contract
        uint256 balBefore = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountInMaximum);
        uint256 actualMax = IERC20(tokenIn).balanceOf(address(this)) - balBefore;
        if (actualMax > 0) actualMax -= 1; // Safety buffer

        // Approve router
        IERC20(tokenIn).forceApprove(address(swapRouter), actualMax);

        ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter.ExactOutputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: msg.sender, // Send output directly to caller
            deadline: block.timestamp,
            amountOut: amountOut,
            amountInMaximum: actualMax,
            sqrtPriceLimitX96: 0
        });

        amountIn = swapRouter.exactOutputSingle(params);

        // Clear approval
        IERC20(tokenIn).forceApprove(address(swapRouter), 0);

        // Refund unused input tokens
        if (amountIn < actualMax) {
            IERC20(tokenIn).safeTransfer(msg.sender, actualMax - amountIn);
        }

        emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
    }

    // --- Liquidity Functions (NFT Position) ---

    /**
     * @notice Mint a new liquidity position (NFT) on DragonSwap V3.
     * @dev Handles token transfers, approvals, and minting interaction with the PositionManager.
     *      Applies `-1 wei` buffer to transferred amounts to handle potential rounding issues.
     *      Refunds any unused tokens to the caller.
     * @param token0 Address of the first token (sorted).
     * @param token1 Address of the second token (sorted).
     * @param fee The pool fee tier.
     * @param tickLower The lower tick of the position range.
     * @param tickUpper The upper tick of the position range.
     * @param amount0Desired The desired amount of token0 to provide.
     * @param amount1Desired The desired amount of token1 to provide.
     * @param amount0Min The minimum amount of token0 to provide (slippage).
     * @param amount1Min The minimum amount of token1 to provide (slippage).
     * @return tokenId The ID of the minted NFT position.
     * @return liquidity The amount of liquidity minted.
     * @return amount0 The actual amount of token0 used.
     * @return amount1 The actual amount of token1 used.
     */
    function mintNewPosition(
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min
    ) external onlyAuthorized nonReentrant returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        // Transfer tokens from caller and check actual received
        uint256 bal0Before = IERC20(token0).balanceOf(address(this));
        uint256 bal1Before = IERC20(token1).balanceOf(address(this));
        
        IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0Desired);
        IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1Desired);
        
        uint256 actual0 = IERC20(token0).balanceOf(address(this)) - bal0Before;
        uint256 actual1 = IERC20(token1).balanceOf(address(this)) - bal1Before;
        
        if (actual0 > 0) actual0 -= 1; // Safety buffer
        if (actual1 > 0) actual1 -= 1; // Safety buffer

        // Approve position manager
        IERC20(token0).forceApprove(address(positionManager), actual0);
        IERC20(token1).forceApprove(address(positionManager), actual1);

        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: actual0,
            amount1Desired: actual1,
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            recipient: msg.sender, // Caller receives the NFT
            deadline: block.timestamp
        });

        (tokenId, liquidity, amount0, amount1) = positionManager.mint(params);

        // Clear approvals
        IERC20(token0).forceApprove(address(positionManager), 0);
        IERC20(token1).forceApprove(address(positionManager), 0);

        // Refund any leftovers
        if (amount0 < actual0) {
            IERC20(token0).safeTransfer(msg.sender, actual0 - amount0);
        }
        if (amount1 < actual1) {
            IERC20(token1).safeTransfer(msg.sender, actual1 - amount1);
        }

        emit LiquidityAdded(tokenId, liquidity, amount0, amount1);
    }

    /**
     * @dev Decrease liquidity and collect fees
     */
    function decreaseLiquidityAndCollect(
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0Min,
        uint256 amount1Min
    ) external onlyAuthorized nonReentrant returns (uint256 amount0, uint256 amount1) {
        // 1. Decrease Liquidity
        INonfungiblePositionManager.DecreaseLiquidityParams memory params = INonfungiblePositionManager.DecreaseLiquidityParams({
            tokenId: tokenId,
            liquidity: liquidity,
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            deadline: block.timestamp
        });

        (amount0, amount1) = positionManager.decreaseLiquidity(params);
        emit LiquidityRemoved(tokenId, liquidity, amount0, amount1);

        // 2. Collect Tokens (Principal + Fees)
        INonfungiblePositionManager.CollectParams memory collectParams = INonfungiblePositionManager.CollectParams({
            tokenId: tokenId,
            recipient: msg.sender, // Send to caller
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (uint256 collected0, uint256 collected1) = positionManager.collect(collectParams);
        
        emit FeesCollected(tokenId, collected0 - amount0, collected1 - amount1);
    }

    // --- Emergency Functions ---

    function rescueToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    /**
     * @dev Get the WKAIA value of a position
     * Placeholder implementation for Phase 1 compilation.
     * TODO: Implement V3 TickMath to calculate actual value from liquidity and current price.
     */
    function getPositionValue(uint256 /*tokenId*/) external pure returns (uint256) {
        return 0; 
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
