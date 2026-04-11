// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISwapRouter} from "../../interfaces/IDragonSwap.sol";

/// @dev Mock swap router that does 1:1 token swaps.
///      Must hold output tokens to fulfil swaps.
contract MockSwapRouter is ISwapRouter {
    using SafeERC20 for IERC20;

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), params.amountIn);
        amountOut = params.amountIn; // 1:1 swap
        IERC20(params.tokenOut).safeTransfer(params.recipient, amountOut);
    }

    function exactOutputSingle(ExactOutputSingleParams calldata params) external payable returns (uint256 amountIn) {
        amountIn = params.amountOut; // 1:1 swap
        IERC20(params.tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(params.tokenOut).safeTransfer(params.recipient, params.amountOut);
    }
}
