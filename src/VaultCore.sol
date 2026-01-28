// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IWKaia} from "./interfaces/IWKaia.sol";
import {TokenInfo} from "./interfaces/ITokenInfo.sol";
import {DragonSwapHandler} from "./DragonSwapHandler.sol";
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
        address poolAddr = address(0); // TODO: Fill in real Mainnet Pool Address
        uint24 feeTier = 500; // 0.05%
        
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
    function getTotalAssets() external view returns (uint256 total) {
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
            
            // DragonSwap NFT Position (LP)
            uint256 tokenId = lpTokenIds[0];
            if (tokenId != 0) {
                 // Future: Get value from position manager
            }
        }
        
        return total;
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
             // 1. Calculate Split
             // balancedRatio represents % of usage for LP. 
             // Logic: "100% LP" means using the entire amountToInvest for LP.
             // To create LP (WKAIA/KoKAIA approx 50/50), we keep 50% WKAIA and stake 50% KoKAIA.
             
             uint256 amountToStake;
             uint256 amountToKeepWKAIA;
             
             if (balancedRatio > 0) {
                 // Smart Split for LP
                 uint256 lpPortion = (amountToInvest * balancedRatio) / 10000;
                 uint256 stakePortion = (amountToInvest - lpPortion) + (lpPortion / 2);
                 
                 amountToStake = stakePortion;
                 amountToKeepWKAIA = amountToInvest - stakePortion;
             } else {
                 // Stable Vault (100% Stake)
                 amountToStake = amountToInvest;
                 amountToKeepWKAIA = 0;
             }
             
             // 2. Execute Staking
             if (amountToStake > 0) {
                 IWKaia(wkaia).withdraw(amountToStake);
                 _stakeToProtocol(amountToStake);
                 emit StakeExecuted(amountToStake);
             }
             
             // 3. Add Liquidity (if we kept WKAIA for LP)
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
             uint256 amountToStake;
             uint256 amountToWrapWKAIA; // For LP
             
             if (balancedRatio > 0) {
                 // Smart Split for LP
                 uint256 lpPortion = (amountToInvest * balancedRatio) / 10000;
                 uint256 stakePortion = (amountToInvest - lpPortion) + (lpPortion / 2);
                 
                 amountToStake = stakePortion;
                 amountToWrapWKAIA = amountToInvest - stakePortion;
             } else {
                 amountToStake = amountToInvest;
                 amountToWrapWKAIA = 0;
             }
             
             // Execute Stake
             if (amountToStake > 0) {
                 _stakeToProtocol(amountToStake);
                 emit StakeExecuted(amountToStake);
             }
             
             // Wrap for LP
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
    
    function instantWithdraw(uint256 amount) external returns (bool) {
        return handleWithdraw(amount, msg.sender);
    }
    
    /**
     * @notice Handle withdrawal request from ShareVault.
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
        
        uint256 wkaiaBalance = IERC20(wkaia).balanceOf(address(this));
        
        if (wkaiaBalance < amount) {
            uint256 needed = amount - wkaiaBalance;
            
            // 1. Try swapping free KoKAIA first
            TokenInfo memory info = tokensInfo[0];
            uint256 kokaiaBal = IERC20(info.asset).balanceOf(address(this));
            
            if (kokaiaBal > 0) {
                uint256 amountToSwap = kokaiaBal; // Use all available if needed
                
                IERC20(info.asset).forceApprove(dragonSwapHandler, amountToSwap);
                
                try DragonSwapHandler(dragonSwapHandler).swapExactOutput(
                    info.asset,
                    wkaia,
                    info.feeTier,
                    needed,       // amountOut desired
                    amountToSwap  // max In
                ) returns (uint256 /*consumed*/) {
                    needed = 0;
                } catch {
                    // Swap failed or insufficient liquidity
                }
            }
            
            // 2. If still needed, Break LP (Future Impl)
            if (needed > 0 && lpTokenIds[0] != 0) {
                // _removeLiquidity(needed); // Not implemented yet
            }
            
            wkaiaBalance = IERC20(wkaia).balanceOf(address(this));
            if (wkaiaBalance < amount) revert("E6"); 
        }
        
        IWKaia(wkaia).withdraw(amount);
        (bool success, ) = shareVault.call{value: amount}("");
        require(success, "Transfer failed");
        
        emit AssetsWithdrawn(amount, recipient);
        return true;
    }

    // ========== INTERNAL HELPERS ==========

    function _stakeToProtocol(uint256 amount) private {
        TokenInfo memory info = tokensInfo[0]; // Always 0
        bool success;
        
        // Testnet: no params, Mainnet: address param
        if (isMainnet) {
            address activeNode = 0x9fA8A1dE3295A286b5e51dDEd41D08c417dF45A8;
            (success,) = info.handler.call{value: amount}(
                abi.encodeWithSignature("stake(address)", activeNode)
            );
        } else {
            (success,) = info.handler.call{value: amount}(
                abi.encodeWithSignature("stake()")
            );
        }
        if (!success) revert("E8");
    }
    
    function _processInvestment(uint256 kaiaAmount) private {
        // Simple passthrough or deprecated
        _stakeToProtocol(kaiaAmount);
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
        investRatio = _i; balancedRatio = _b; aggressiveRatio = _a;
    }
    function setWKaia(address _wkaia) external onlyOwner { wkaia = _wkaia; }
    function updateTokenInfo() external onlyOwner { _initTokenInfo(); }
    
    // Claim functions
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
        return balances;
    }

    function getAssetNames() external pure returns (string[14] memory names) {
        names[0] = "KAIA";
        names[1] = "WKAIA";
        names[2] = "KoKAIA";
        names[3] = "wKoKAIA";
        return names;
    }
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    receive() external payable {}
}