// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWKaia} from "./interfaces/IWKaia.sol";
import {TokenInfo} from "./interfaces/ITokenInfo.sol";
import {DragonSwapHandler} from "./DragonSwapHandler.sol";
import {INonfungiblePositionManager, IUniswapV3Pool} from "./interfaces/IDragonSwap.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IWrappedLST} from "./interfaces/IWrappedLST.sol";
import {IKoKaia} from "./interfaces/IKoKaia.sol";
import {SharedStorage} from "./SharedStorage.sol";

/**
 * @title VaultCore
 * @notice Core logic for managing assets, staking, and DragonSwap liquidity provision.
 * @dev This contract handles the "backend" operations:
 *      1. Staking KAIA tokens via the Handler.
 *      2. Wrapping/Unwrapping WKAIA.
 *      3. Providing Liquidity to DragonSwap (WKAIA/KoKAIA pool).
 *      4. Managing the portfolio mix via `investRatio`, `balancedRatio`, etc.
 * 
 * @custom:security CRITICAL: This contract delegates storage to `SharedStorage`.
 * Ensure NO new storage variables are added here directly. Use `SharedStorage`.
 */
contract VaultCore is SharedStorage, OwnableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;
    
    // All storage variables are inherited from SharedStorage
    // DO NOT add any storage variables here - add them to SharedStorage instead
    
    // Events
    event AssetsDeposited(uint256 amount);
    event AssetsWithdrawn(uint256 amount, address recipient);
    event KAIADeposited(uint256 amount);
    event StakeExecuted(uint256 amount);
    event SwapExecuted(uint256 index, uint256 amountIn, uint256 amountOut);
    event DepositProcessed(address indexed depositor, uint256 amount);
    event WrappedUnstake(address indexed user, uint256 indexed lstIndex, uint256 amount);
    event Claimed(address indexed user, uint256 indexed lstIndex, uint256 amount);
    event LiquidityAdded(uint256 indexed lstIndex, uint256 tokenAmount, uint256 lpReceived);
    event LiquidityRemoved(uint256 indexed lstIndex, uint256 lpAmount, uint256 tokenReceived);
    event AgentSwapExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event AgentStKaiaPurchased(uint256 kokaiaSpent, uint256 stKaiaReceived);
    event AgentUnstakeRequested(uint256 stKaiaAmount, uint256 requestId);
    event AgentUnstakeClaimed(uint256 requestId, uint256 kaiaReceived);
    event InstantWithdrawExecuted(address indexed recipient, uint256 grossAmount, uint256 fee, uint256 netAmount);
    event InstantWithdrawAsKoKAIAExecuted(address indexed recipient, uint256 grossAmount, uint256 fee, uint256 netKoKAIA);
    event InstantWithdrawAsLPTokensExecuted(address indexed recipient, uint256 grossAmount, uint256 fee, uint256 wkaiaAmount, uint256 kokaiaAmount);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev Initialize VaultCore
     */
    function initialize(
        address _wkaia,
        address _dragonSwapHandler,
        uint256 _investRatio
    ) external initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        
        wkaia = _wkaia;
        dragonSwapHandler = _dragonSwapHandler;
        investRatio = _investRatio;
        slippage = 1000; // 10% default slippage
        
        // Set mainnet flag based on chain ID
        uint256 chainId = block.chainid;
        isMainnet = (chainId == 8217); // Kaia mainnet
        
        // Set default ratios - no LP creation initially
        // Can be changed later via setInvestmentRatios
        balancedRatio = 0;    // 0% of LSTs go to pool1
        aggressiveRatio = 0;  // 0% of LSTs go to pool2
        
        _initTokenInfo();
    }
    
    /**
     * @dev Initialize token information for KoKAIA based on chain ID
     */
    function _initTokenInfo() private {
        uint256 chainId = block.chainid;
        
        if (chainId == 8217) {
            _initMainnet();
        } else if (chainId == 1001) {
            _initTestnet();
        } else {
            revert("Unsupported chain");
        }
    }
    
    function _initMainnet() private {
        // Mainnet KoKAIA Setup
        // KoKAIA: 0xA1338309658D3Da331C747518d0bb414031F22fd
        // wKoKAIA: 0xdEC2Cc84f0a37Ef917f63212FE8ba7494b0E4B15
        
        address asset = 0xA1338309658D3Da331C747518d0bb414031F22fd;
        address tokenA = 0xdEC2Cc84f0a37Ef917f63212FE8ba7494b0E4B15;
        
        // DragonSwap WKAIA/KoKAIA Pool
        address poolAddr = 0x0BB457F4739dAdf707668AE4Fd3d5D530568D56d;
        uint24 feeTier = 1000; // 0.1%
        
        tokensInfo[0] = TokenInfo(asset, asset, tokenA, wkaia, wkaia, poolAddr, feeTier);
    }
    
    function _initTestnet() private {
        // Testnet KoKAIA Setup (Kairos)
        
        address asset = 0xb15782EFbC2034E366670599F3997f94c7333FF9; // Also Handler
        address tokenA = 0x9a93e2fcDEBE43d0f8205D1cd255D709B7598317;
        
        // DragonSwap WKAIA/KoKAIA Pool (0.01%)
        address poolAddr = 0x2D3d0184Ddf6128FaEBB0803CA8cfB6415aC6990;
        uint24 feeTier = 100; // 0.01%
        
        tokensInfo[0] = TokenInfo(asset, asset, tokenA, wkaia, wkaia, poolAddr, feeTier);
    }
    
    /**
     * @dev Get total assets managed by this vault (KoKAIA + WKAIA + LP)
     */
    function getTotalAssets() external view returns (uint256) {
        return _getTotalAssets();
    }

    /**
     * @dev Internal version for use by other functions (e.g. proportional LP removal).
     *      Includes LP valuation via pool sqrtPriceX96.
     *      Uses raw staticcall for LP valuation to avoid Kaia EVM delegatecall+typed-call issue.
     */
    function _getTotalAssets() internal view returns (uint256 total) {
        // Native KAIA
        total = address(this).balance;

        // WKAIA
        if (wkaia != address(0)) {
            total += IERC20(wkaia).balanceOf(address(this));
        }

        // KoKAIA (Asset)
        if (tokensInfo[0].asset != address(0)) {
            total += IERC20(tokensInfo[0].asset).balanceOf(address(this));

            // wKoKAIA (if any held directly)
            try IERC20(tokensInfo[0].tokenA).balanceOf(address(this)) returns (uint256 wBalance) {
                if (wBalance > 0) {
                    total += IWrappedLST(tokensInfo[0].tokenA).getUnwrappedAmount(wBalance);
                }
            } catch {}

            // DragonSwap NFT Position (LP) — valued via raw staticcall
            total += _getLPValueRaw();
        }

        // Agent capital stays in vault as KoKAIA — already counted above
        return total;
    }

    /**
     * @dev Calculate LP value using raw staticcall to avoid Kaia EVM compatibility issue
     *      with typed external calls through UUPS proxy delegatecall.
     *      Enumerates ALL NFT positions owned by this vault (not just lpTokenIds[0]).
     */
    function _getLPValueRaw() internal view returns (uint256) {
        // Get position manager address from DragonSwapHandler
        address pmAddr;
        {
            (bool ok, bytes memory ret) = dragonSwapHandler.staticcall(
                abi.encodeWithSignature("positionManager()")
            );
            if (!ok || ret.length < 32) return 0;
            pmAddr = abi.decode(ret, (address));
        }

        // Get sqrtPriceX96 from pool (shared across all positions)
        uint160 sqrtPriceX96;
        {
            address poolAddr = tokensInfo[0].poolAddress;
            if (poolAddr == address(0)) return 0;
            (bool ok, bytes memory ret) = poolAddr.staticcall(
                abi.encodeWithSignature("slot0()")
            );
            if (!ok || ret.length < 32) return 0;
            sqrtPriceX96 = uint160(abi.decode(ret, (uint256)));
        }
        if (sqrtPriceX96 == 0) return 0;

        // Get number of NFT positions owned by this vault
        uint256 nftCount;
        {
            (bool ok, bytes memory ret) = pmAddr.staticcall(
                abi.encodeWithSignature("balanceOf(address)", address(this))
            );
            if (!ok || ret.length < 32) return 0;
            nftCount = abi.decode(ret, (uint256));
        }
        if (nftCount == 0) return 0;

        uint256 Q96 = 1 << 96;
        uint256 totalValue;

        // Iterate over all NFT positions
        for (uint256 i = 0; i < nftCount; i++) {
            // Get tokenId at index i
            uint256 tokenId;
            {
                (bool ok, bytes memory ret) = pmAddr.staticcall(
                    abi.encodeWithSignature("tokenOfOwnerByIndex(address,uint256)", address(this), i)
                );
                if (!ok || ret.length < 32) continue;
                tokenId = abi.decode(ret, (uint256));
            }

            // Get liquidity from this position
            uint128 liquidity;
            {
                (bool ok, bytes memory ret) = pmAddr.staticcall(
                    abi.encodeWithSignature("positions(uint256)", tokenId)
                );
                if (!ok || ret.length < 384) continue;
                assembly {
                    liquidity := mload(add(ret, 256)) // 32 (length prefix) + 7*32
                }
            }
            if (liquidity == 0) continue;

            totalValue += Math.mulDiv(uint256(liquidity), Q96, uint256(sqrtPriceX96));
            totalValue += Math.mulDiv(uint256(liquidity), uint256(sqrtPriceX96), Q96);
        }

        return totalValue;
    }
    
    /**
     * @notice Handle deposit notification from ShareVault.
     * @dev Implements "Smart Split" logic:
     *      - If `balancedRatio` > 0: Splits funds between Staking (KoKAIA) and LPs (WKAIA/KoKAIA).
     *      - Else: Stakes 100% into KoKAIA (Stable strategy).
     * @param amount The amount of WKAIA transferred to this vault.
     * @param depositor The address of the user who deposited.
     * @return bool True if successful.
     */
    function handleDeposit(uint256 amount, address depositor) external returns (bool) {
        if (msg.sender != shareVault) revert("E1");
        if (amount == 0) revert("E2");
        
        emit DepositProcessed(depositor, amount);
        
        // Verify WKAIA received
        uint256 wkaiaBalance = IERC20(wkaia).balanceOf(address(this));
        if (wkaiaBalance < amount) revert("E4");
        
        uint256 amountToInvest = (amount * investRatio) / 10000;
        
        if (amountToInvest > 0) {
             // Split: Balanced (LP) vs Stable+Aggressive (all KoKAIA staking)
             // Aggressive portion stakes to KoKAIA same as stable; agent manages via agentSwap()
             uint256 balancedPortion = (amountToInvest * balancedRatio) / 10000;
             uint256 stakePortion = amountToInvest - balancedPortion;

             // Balanced LP: 50% staked (KoKAIA) + 50% WKAIA
             uint256 amountToStake = stakePortion + (balancedPortion / 2);
             uint256 amountToKeepWKAIA = balancedPortion - (balancedPortion / 2);

             // 1. Stake to KoKAIA (stable + aggressive combined)
             if (amountToStake > 0) {
                 IWKaia(wkaia).withdraw(amountToStake);
                 _stakeToProtocol(amountToStake);
                 emit StakeExecuted(amountToStake);
             }

             // 2. Add Liquidity (Balanced WKAIA side)
             if (amountToKeepWKAIA > 0) {
                 _addLiquidity(amountToKeepWKAIA);
             }
        }

        emit AssetsDeposited(amount);
        return true;
    }
    
    /**
     * @notice Handle native KAIA deposit from ShareVault.
     * @dev Similar to `handleDeposit` but handles native ETH/KAIA.
     *      - Wraps required amount to WKAIA for LP or Staking.
     * @return bool True if successful.
     */
    function handleDepositKAIA() external payable returns (bool) {
        if (msg.sender != shareVault) revert("E1");
        if (msg.value == 0) revert("E2");
        
        uint256 kaiaAmount = msg.value;
        uint256 amountToInvest = (kaiaAmount * investRatio) / 10000;
        
        if (amountToInvest > 0) {
             // Split: Balanced (LP) vs Stable+Aggressive (all KoKAIA staking)
             uint256 balancedPortion = (amountToInvest * balancedRatio) / 10000;
             uint256 stakePortion = amountToInvest - balancedPortion;

             // Balanced LP: 50% staked (KoKAIA) + 50% WKAIA
             uint256 amountToStake = stakePortion + (balancedPortion / 2);
             uint256 amountToWrapWKAIA = balancedPortion - (balancedPortion / 2);

             // 1. Stake to KoKAIA (stable + aggressive combined)
             if (amountToStake > 0) {
                 _stakeToProtocol(amountToStake);
                 emit StakeExecuted(amountToStake);
             }

             // 2. Wrap and Add Liquidity (Balanced WKAIA side)
             if (amountToWrapWKAIA > 0) {
                 IWKaia(wkaia).deposit{value: amountToWrapWKAIA}();
                 _addLiquidity(amountToWrapWKAIA);
             }
        }

        // Wrap remainder (reserve) to WKAIA
        uint256 reserve = kaiaAmount - amountToInvest;
        if (reserve > 0) {
             IWKaia(wkaia).deposit{value: reserve}();
        }

        emit KAIADeposited(kaiaAmount);
        return true;
    }
    
    // --- Rescue Functions ---
    
    /**
     * @dev Rescue any ERC20 token
     */
    function rescueToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
    }
    
    /**
     * @dev Rescue native KAIA
     */
    function rescueKAIA(uint256 amount) external onlyOwner {
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
    }

    // --- End Rescue Functions ---
    
    /**
     * @notice Handle instant withdrawal — deducts fee, sources WKAIA from LP/DEX.
     * @dev Called by ShareVault. Fee is deducted first from gross amount.
     *      Only netAmount is sourced (via LP removal → KoKAIA DEX swap → liquid WKAIA).
     *      Fee stays as vault assets (benefits remaining depositors).
     * @param amount The gross amount of assets requested.
     * @param recipient The user address (for event logging).
     * @return netAmount The actual KAIA sent to ShareVault after fee deduction.
     */
    function handleInstantWithdraw(uint256 amount, address recipient) external returns (uint256 netAmount) {
        if (msg.sender != shareVault) revert("E1");
        if (amount == 0) revert("E2");

        // 1. Deduct fee first
        uint256 fee = (amount * instantWithdrawFeeBps) / 10000;
        netAmount = amount - fee;

        // 2. Source only netAmount of WKAIA (fee stays as vault assets)
        _ensureWKAIA(netAmount);

        // 3. Send net amount to ShareVault
        IWKaia(wkaia).withdraw(netAmount);
        (bool success, ) = shareVault.call{value: netAmount}("");
        require(success, "Transfer failed");

        emit InstantWithdrawExecuted(recipient, amount, fee, netAmount);
    }

    /**
     * @notice Handle instant withdrawal returning KoKAIA directly (no swap).
     * @dev Called by ShareVault. Fee is deducted first.
     *      Transfers netAmount of KoKAIA tokens directly to ShareVault.
     *      Used for Conservative/Aggressive vaults when user opts to receive KoKAIA.
     * @param amount The gross amount of assets requested (KAIA-denominated).
     * @param recipient The user address (for event logging).
     * @return netAmount The KoKAIA amount sent to ShareVault after fee deduction.
     */
    function handleInstantWithdrawAsKoKAIA(uint256 amount, address recipient) external returns (uint256 netAmount) {
        if (msg.sender != shareVault) revert("E1");
        if (amount == 0) revert("E2");

        // 1. Deduct fee (fee stays as vault assets)
        uint256 fee = (amount * instantWithdrawFeeBps) / 10000;
        netAmount = amount - fee;

        // 2. Verify sufficient KoKAIA balance
        uint256 kokaiaBalance = IERC20(tokensInfo[0].asset).balanceOf(address(this));
        require(kokaiaBalance >= netAmount, "Insufficient KoKAIA");

        // 3. Transfer KoKAIA directly to ShareVault (no swap, no unwrap)
        IERC20(tokensInfo[0].asset).safeTransfer(shareVault, netAmount);

        emit InstantWithdrawAsKoKAIAExecuted(recipient, amount, fee, netAmount);
    }

    /**
     * @notice Handle instant withdrawal returning LP components (WKAIA + KoKAIA).
     * @dev Called by ShareVault. Fee is deducted first.
     *      Removes proportional LP and transfers both tokens to ShareVault.
     *      Used for Balanced vault when user opts to receive LP components.
     * @param amount The gross amount of assets requested (KAIA-denominated).
     * @param recipient The user address (for event logging).
     * @return netAmount The net asset amount after fee deduction.
     * @return wkaiaAmount The WKAIA amount sent to ShareVault.
     * @return kokaiaAmount The KoKAIA amount sent to ShareVault.
     */
    function handleInstantWithdrawAsLPTokens(uint256 amount, address recipient)
        external returns (uint256 netAmount, uint256 wkaiaAmount, uint256 kokaiaAmount)
    {
        if (msg.sender != shareVault) revert("E1");
        if (amount == 0) revert("E2");

        // 1. Deduct fee (fee stays as vault assets)
        uint256 fee = (amount * instantWithdrawFeeBps) / 10000;
        netAmount = amount - fee;

        // 2. Record balances before LP removal
        uint256 wkaiaBefore = IERC20(wkaia).balanceOf(address(this));
        uint256 kokaiaBefore = IERC20(tokensInfo[0].asset).balanceOf(address(this));

        // 3. Remove proportional LP (returns WKAIA + KoKAIA to this vault)
        _removeLiquidity(netAmount);

        // 4. Calculate actual amounts received from LP removal
        wkaiaAmount = IERC20(wkaia).balanceOf(address(this)) - wkaiaBefore;
        kokaiaAmount = IERC20(tokensInfo[0].asset).balanceOf(address(this)) - kokaiaBefore;

        require(wkaiaAmount > 0 || kokaiaAmount > 0, "No LP tokens received");

        // 5. Transfer both tokens to ShareVault
        if (wkaiaAmount > 0) {
            IERC20(wkaia).safeTransfer(shareVault, wkaiaAmount);
        }
        if (kokaiaAmount > 0) {
            IERC20(tokensInfo[0].asset).safeTransfer(shareVault, kokaiaAmount);
        }

        emit InstantWithdrawAsLPTokensExecuted(recipient, amount, fee, wkaiaAmount, kokaiaAmount);
    }

    /**
     * @notice Handle standard withdrawal request from ShareVault.
     * @dev Withdrawal Strategy (in order of preference):
     *      1. Use liquid WKAIA held in Vault.
     *      2. Swap free KoKAIA to WKAIA via DragonSwap.
     *      3. (Future) Remove Liquidity from DragonSwap -> Swap -> WKAIA.
     * @param amount The amount of assets to withdraw.
     * @param recipient The address to receive the withdrawn assets.
     * @return bool True if successful.
     */
    function handleWithdraw(uint256 amount, address recipient) public returns (bool) {
        if (msg.sender != shareVault) revert("E1");
        if (amount == 0) revert("E2");

        _ensureWKAIA(amount);

        IWKaia(wkaia).withdraw(amount);
        (bool success, ) = shareVault.call{value: amount}("");
        require(success, "Transfer failed");

        emit AssetsWithdrawn(amount, recipient);
        return true;
    }

    /**
     * @dev Ensure vault holds at least `needed` WKAIA.
     *      Priority: liquid WKAIA → proportional LP removal → KoKAIA DEX swap.
     */
    function _ensureWKAIA(uint256 needed) private {
        uint256 wkaiaBalance = IERC20(wkaia).balanceOf(address(this));
        if (wkaiaBalance >= needed) return;

        uint256 deficit = needed - wkaiaBalance;

        // 1. Proportional LP removal (returns WKAIA + KoKAIA to vault)
        if (lpTokenIds[0] != 0) {
            _removeLiquidity(deficit);
            wkaiaBalance = IERC20(wkaia).balanceOf(address(this));
            if (wkaiaBalance >= needed) return;
            deficit = needed - wkaiaBalance;
        }

        // 2. Swap available KoKAIA → WKAIA to cover remaining deficit
        TokenInfo memory info = tokensInfo[0];
        uint256 kokaiaBal = IERC20(info.asset).balanceOf(address(this));

        if (kokaiaBal > 0 && deficit > 0) {
            IERC20(info.asset).forceApprove(dragonSwapHandler, kokaiaBal);

            try DragonSwapHandler(dragonSwapHandler).swapExactOutput(
                info.asset,
                wkaia,
                info.feeTier,
                deficit,
                kokaiaBal
            ) returns (uint256) {} catch {}
        }

        wkaiaBalance = IERC20(wkaia).balanceOf(address(this));
        if (wkaiaBalance < needed) revert("E6");
    }

    /**
     * @dev Remove proportional liquidity from DragonSwap V3 LP position.
     *      Uses pool sqrtPriceX96 to calculate exact liquidity for `targetWKAIA`.
     *
     *      Math (full-range V3, pegged pair):
     *        valuePerL = Q96/sqrtP + sqrtP/Q96  (scaled by 1e18)
     *        liquidityNeeded = targetWKAIA * 1e18 / valuePerL
     *        +3% buffer for swap fee & price impact
     *
     * @param targetWKAIA The WKAIA amount we need from LP.
     */
    function _removeLiquidity(uint256 targetWKAIA) private {
        uint256 tokenId = lpTokenIds[0];
        if (tokenId == 0) return;

        INonfungiblePositionManager pm = DragonSwapHandler(dragonSwapHandler).positionManager();
        (, , , , , , , uint128 totalLiquidity, , , , ) = pm.positions(tokenId);
        if (totalLiquidity == 0) return;

        // Calculate proportional liquidity via sqrtPriceX96
        uint160 sqrtPriceX96 = _getPoolSqrtPrice();
        if (sqrtPriceX96 == 0) return;

        uint256 Q96 = 1 << 96;
        // Value per unit of liquidity (scaled by 1e18 for precision)
        uint256 termA = Math.mulDiv(Q96, 1e18, uint256(sqrtPriceX96));      // token0 side per L
        uint256 termB = Math.mulDiv(uint256(sqrtPriceX96), 1e18, Q96);      // token1 side per L
        uint256 valuePerL = termA + termB; // ≈ 2e18 for 1:1 price

        // Liquidity needed (with 3% buffer for swap fee + price impact)
        uint256 rawLiquidity = Math.mulDiv(targetWKAIA, 1e18, valuePerL);
        uint256 buffered = rawLiquidity * 103 / 100;
        uint128 liquidityToRemove = buffered > uint256(totalLiquidity)
            ? totalLiquidity
            : uint128(buffered);

        // Approve handler to manage NFT position (ERC721 approve)
        pm.approve(dragonSwapHandler, tokenId);

        (uint256 amount0, uint256 amount1) = DragonSwapHandler(dragonSwapHandler).decreaseLiquidityAndCollect(
            tokenId, liquidityToRemove, 0, 0
        );

        // Clear LP tracking if all liquidity removed
        if (liquidityToRemove == totalLiquidity) {
            lpTokenIds[0] = 0;
        }

        emit LiquidityRemoved(0, liquidityToRemove, amount0 + amount1);
    }

    /**
     * @dev Get sqrtPriceX96 from the DragonSwap V3 pool.
     */
    function _getPoolSqrtPrice() private view returns (uint160) {
        TokenInfo memory info = tokensInfo[0];
        if (info.poolAddress == address(0)) return 0;
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(info.poolAddress).slot0();
        return sqrtPriceX96;
    }

    // ========== INTERNAL HELPERS ==========

    function _stakeToProtocol(uint256 amount) private {
        TokenInfo memory info = tokensInfo[0]; // Always 0
        bool success;

        // KoKAIA uses stake() on both mainnet and testnet
        (success,) = info.handler.call{value: amount}(
            abi.encodeWithSignature("stake()")
        );
        if (!success) revert("E8");
    }
    
    function _addLiquidity(uint256 wkaiaAmount) private {
        TokenInfo memory info = tokensInfo[0];
        uint256 kokaiaBalance = IERC20(info.asset).balanceOf(address(this));
        if (kokaiaBalance > 10000) kokaiaBalance -= 10000; // Safety buffer (increased) for Vault->Handler transfer
        
        if (wkaiaAmount > 0 && kokaiaBalance > 0) {
            IERC20(wkaia).forceApprove(dragonSwapHandler, wkaiaAmount);
            IERC20(info.asset).forceApprove(dragonSwapHandler, kokaiaBalance);
            
            address token0 = wkaia < info.asset ? wkaia : info.asset;
            address token1 = wkaia < info.asset ? info.asset : wkaia;
            
            uint256 amount0 = wkaia < info.asset ? wkaiaAmount : kokaiaBalance;
            uint256 amount1 = wkaia < info.asset ? kokaiaBalance : wkaiaAmount;
            
            (uint256 tokenId, uint128 liq, , ) = DragonSwapHandler(dragonSwapHandler).mintNewPosition(
                token0,
                token1,
                info.feeTier,
                -887200, 887200,    // Full Range approx
                amount0,
                amount1,
                0, 0
            );
            lpTokenIds[0] = tokenId;
            emit LiquidityAdded(0, 0, liq);
        }
    }
    
    // Admin Functions
    function setShareVault(address _shareVault) external onlyOwner { shareVault = _shareVault; }
    function setClaimManager(address _mgr) external onlyOwner { claimManager = _mgr; }
    function setDragonSwapHandler(address _handler) external onlyOwner { dragonSwapHandler = _handler; }
    function setInvestRatio(uint256 _r) external onlyOwner { investRatio = _r; }
    function setInvestmentRatios(uint256 _i, uint256 _b, uint256 _a) external onlyOwner {
        require(_b + _a <= 10000, "E14");
        investRatio = _i; balancedRatio = _b; aggressiveRatio = _a;
    }
    function setInstantWithdrawFee(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "E15"); // Max 10%
        instantWithdrawFeeBps = _feeBps;
    }
    function setWKaia(address _wkaia) external onlyOwner { wkaia = _wkaia; }
    function setAgentAddress(address _agent) external onlyOwner { agentAddress = _agent; }
    function setStKaiaAddresses(address _token, address _rateProvider) external onlyOwner {
        stKaiaToken = _token;
        stKaiaRateProvider = _rateProvider;
    }
    function updateTokenInfo() external onlyOwner { _initTokenInfo(); }

    // ========== AGENT STRATEGY FUNCTIONS ==========

    modifier onlyAgent() {
        require(msg.sender == agentAddress, "Not agent");
        _;
    }

    /**
     * @notice Agent swaps vault assets via DragonSwap (exact input).
     * @dev Assets remain in VaultCore. Agent triggers swap, output returns to vault.
     * @param tokenIn Address of input token (e.g. KoKAIA).
     * @param tokenOut Address of output token (e.g. WKAIA).
     * @param fee Pool fee tier.
     * @param amountIn Exact amount of input tokens to swap.
     * @param amountOutMinimum Minimum output (slippage protection).
     * @return amountOut Actual output received.
     */
    function agentSwap(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external onlyAgent returns (uint256 amountOut) {
        IERC20(tokenIn).forceApprove(dragonSwapHandler, amountIn);

        amountOut = DragonSwapHandler(dragonSwapHandler).swapExactInput(
            tokenIn, tokenOut, fee, amountIn, amountOutMinimum
        );

        IERC20(tokenIn).forceApprove(dragonSwapHandler, 0);

        emit AgentSwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
    }

    /**
     * @notice Agent swaps vault assets via DragonSwap (exact output).
     * @param tokenIn Address of input token.
     * @param tokenOut Address of output token.
     * @param fee Pool fee tier.
     * @param amountOut Exact amount of output tokens desired.
     * @param amountInMaximum Maximum input willing to spend.
     * @return amountIn Actual input spent.
     */
    function agentSwapExactOutput(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountOut,
        uint256 amountInMaximum
    ) external onlyAgent returns (uint256 amountIn) {
        IERC20(tokenIn).forceApprove(dragonSwapHandler, amountInMaximum);

        amountIn = DragonSwapHandler(dragonSwapHandler).swapExactOutput(
            tokenIn, tokenOut, fee, amountOut, amountInMaximum
        );

        IERC20(tokenIn).forceApprove(dragonSwapHandler, 0);

        emit AgentSwapExecuted(tokenIn, tokenOut, amountIn, amountOut);
    }

    /**
     * @notice Atomically swap KoKAIA → WKAIA → stKAIA in a single transaction.
     * @param kokaiaAmount Amount of KoKAIA to sell.
     * @param kokaiaToWkaiaFee Fee tier for KoKAIA/WKAIA pool (e.g. 1000).
     * @param wkaiaToStkaiaFee Fee tier for WKAIA/stKAIA pool (e.g. 500).
     * @param minStKaiaOut Minimum stKAIA output (slippage protection).
     * @return stKaiaReceived Actual stKAIA received.
     */
    function agentBuyStKaia(
        uint256 kokaiaAmount,
        uint24 kokaiaToWkaiaFee,
        uint24 wkaiaToStkaiaFee,
        uint256 minStKaiaOut
    ) external onlyAgent returns (uint256 stKaiaReceived) {
        require(stKaiaToken != address(0), "stKAIA not set");
        address kokaia = tokensInfo[0].asset;

        // Step 1: KoKAIA → WKAIA
        IERC20(kokaia).forceApprove(dragonSwapHandler, kokaiaAmount);
        uint256 wkaiaAmount = DragonSwapHandler(dragonSwapHandler).swapExactInput(
            kokaia, wkaia, kokaiaToWkaiaFee, kokaiaAmount, 0
        );
        IERC20(kokaia).forceApprove(dragonSwapHandler, 0);

        // Step 2: WKAIA → stKAIA
        IERC20(wkaia).forceApprove(dragonSwapHandler, wkaiaAmount);
        stKaiaReceived = DragonSwapHandler(dragonSwapHandler).swapExactInput(
            wkaia, stKaiaToken, wkaiaToStkaiaFee, wkaiaAmount, minStKaiaOut
        );
        IERC20(wkaia).forceApprove(dragonSwapHandler, 0);

        emit AgentStKaiaPurchased(kokaiaAmount, stKaiaReceived);
    }

    /**
     * @notice Request stKAIA unstaking (7-day unbonding).
     * @param stKaiaAmount Amount of stKAIA to unstake.
     * @return requestId The withdrawal request ID from stKAIA contract.
     */
    function agentRequestUnstake(uint256 stKaiaAmount) external onlyAgent returns (uint256 requestId) {
        require(stKaiaToken != address(0), "stKAIA not set");
        IERC20(stKaiaToken).forceApprove(stKaiaToken, stKaiaAmount);

        (bool success, bytes memory data) = stKaiaToken.call(
            abi.encodeWithSignature("requestWithdrawal(uint256)", stKaiaAmount)
        );
        require(success, "Unstake failed");
        requestId = abi.decode(data, (uint256));

        emit AgentUnstakeRequested(stKaiaAmount, requestId);
    }

    /**
     * @notice Claim matured stKAIA withdrawal. Received KAIA is auto-restaked to KoKAIA.
     * @param requestId The withdrawal request ID to claim.
     * @return kaiaReceived Amount of KAIA received from claim.
     */
    function agentClaimUnstake(uint256 requestId) external onlyAgent returns (uint256 kaiaReceived) {
        require(stKaiaToken != address(0), "stKAIA not set");
        uint256 balBefore = address(this).balance;

        (bool success,) = stKaiaToken.call(
            abi.encodeWithSignature("claimWithdrawal(uint256)", requestId)
        );
        require(success, "Claim failed");

        kaiaReceived = address(this).balance - balBefore;

        // Auto-restake claimed KAIA → KoKAIA
        if (kaiaReceived > 0) {
            _stakeToProtocol(kaiaReceived);
        }

        emit AgentUnstakeClaimed(requestId, kaiaReceived);
    }

    // Unstake & Claim functions

    /**
     * @notice Initiate KoKAIA unstaking for a user (7-day unbonding on mainnet).
     * @dev Delegatecalls to ClaimManager.executeUnstake(). Only owner (admin) can trigger.
     *      Use this when DEX liquidity is insufficient for instant withdrawal.
     * @param user The user address to unstake for.
     * @param lstIndex The LST index (0 = KoKAIA).
     * @param amount The amount of KoKAIA to unstake.
     * @return bool True if successful.
     */
    function unstake(address user, uint256 lstIndex, uint256 amount) external onlyOwner returns (bool) {
        require(claimManager != address(0), "ClaimManager not set");
        (bool success, bytes memory data) = claimManager.delegatecall(
            abi.encodeWithSignature("executeUnstake(address,uint256,uint256)", user, lstIndex, amount)
        );
        if (!success) revert("E22");
        emit WrappedUnstake(user, lstIndex, amount);
        return abi.decode(data, (bool));
    }

    function claim(address user, uint256 lstIndex) external onlyOwner returns (uint256) {
        require(claimManager != address(0), "ClaimManager not set");
         (bool success, bytes memory data) = claimManager.delegatecall(
            abi.encodeWithSignature("executeClaim(address,uint256)", user, lstIndex)
        );
        if (!success) revert("E21");
        return abi.decode(data, (uint256));
    }
    
    function isClaimReady(address user, uint256 lstIndex) external view returns (bool) {
         require(claimManager != address(0), "ClaimManager not set");
        (bool success, bytes memory data) = claimManager.staticcall(
            abi.encodeWithSignature("isClaimReady(address,uint256)", user, lstIndex)
        );
        if (!success) return false;
        return abi.decode(data, (bool));
    }

    function getTimeUntilClaim(address user, uint256 lstIndex) external view returns (uint256) {
        require(claimManager != address(0), "ClaimManager not set");
        (bool success, bytes memory data) = claimManager.staticcall(
            abi.encodeWithSignature("getTimeUntilClaim(address,uint256)", user, lstIndex)
        );
         if (!success) return type(uint256).max;
        return abi.decode(data, (uint256));
    }
    
    function getVaultAssets() external view returns (uint256[14] memory balances) {
        // Re-implement simplified version if needed, or rely on previous definition if I am appending?
        // Wait, replace_file_content replaces a BLOCK.
        // If I target instantWithdraw down to end, I am REPLACING getVaultAssets too.
        // So I MUST provide the new getVaultAssets implementation here.
        
        balances[0] = address(this).balance;
        balances[1] = wkaia != address(0) ? IERC20(wkaia).balanceOf(address(this)) : 0;
        
        if (tokensInfo[0].asset != address(0)) {
            balances[2] = IERC20(tokensInfo[0].asset).balanceOf(address(this));
            try IERC20(tokensInfo[0].tokenA).balanceOf(address(this)) returns (uint256 wBalance) {
               if (wBalance > 0) balances[3] = wBalance; // keep packed
            } catch {}
        }
        // Agent allocation tracking
        balances[4] = agentAllocatedCapital;
        balances[5] = agentTotalProfit;

        return balances;
    }

    function getAssetNames() external pure returns (string[14] memory names) {
        names[0] = "KAIA";
        names[1] = "WKAIA";
        names[2] = "KoKAIA";
        names[3] = "wKoKAIA";
        names[4] = "AgentAllocated";
        names[5] = "AgentProfit";
        return names;
    }
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    receive() external payable {}
}