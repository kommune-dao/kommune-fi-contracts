// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TokenInfo} from "./interfaces/ITokenInfo.sol";

/**
 * @title SharedStorage
 * @dev Base storage contract to ensure identical layout for VaultCore and ClaimManager delegatecall
 * 
 * CRITICAL RULES:
 * 1. NEVER modify the order of existing variables
 * 2. NEVER remove variables
 * 3. ONLY add new variables at the end (before __gap)
 * 4. Always decrease __gap size when adding new variables
 * 
 * This contract ensures VaultCore and ClaimManager have identical storage layouts,
 * preventing storage collision when using delegatecall.
 */
contract SharedStorage {
    // ========== CORE ADDRESSES (slots 0-4) ==========
    address public shareVault;       // slot 0
    address public wkaia;            // slot 1
    address public __gap_legacy_balancerVault;    // slot 2 (reserved/deprecated)
    address public dragonSwapHandler;     // slot 3 (formerly swapContract)
    address public claimManager;     // slot 4
    
    // ========== LST CONFIGURATION (slots 5-6) ==========
    mapping(uint256 => TokenInfo) public tokensInfo;  // slot 5
    mapping(uint256 => uint256) public lstAPY;        // slot 6
    
    // ========== INVESTMENT PARAMETERS (slots 7-8) ==========
    uint256 public investRatio;     // slot 7 - basis points (e.g., 9000 = 90%)
    uint256 public slippage;        // slot 8 - basis points (e.g., 1000 = 10%)
    
    // ========== UNSTAKE TRACKING (slots 9-10) ==========
    mapping(address => mapping(uint256 => uint256)) public unstakeRequests;  // slot 9 - user => lstIndex => timestamp
    mapping(address => mapping(uint256 => uint256)) public unstakeAmounts;   // slot 10 - user => lstIndex => amount
    
    // ========== DEPOSIT TRACKING (slot 11) ==========
    mapping(address => uint256) public lastDepositBlock;  // slot 11 - anti-spam protection
    
    // ========== INVESTMENT STRATEGY ALLOCATION (slots 12-13) ==========
    // All ratios are in basis points (10000 = 100%)
    // balancedRatio + aggressiveRatio <= 10000 (100%)
    // These determine how much of the LSTs (obtained via investRatio) go to pools
    uint256 public balancedRatio;   // slot 12 - % of LSTs to add to pool1 for LP tokens
    uint256 public aggressiveRatio; // slot 13 - % of LSTs to add to pool2 for LP tokens
    
    // ========== BALANCER LP TRACKING (slots 15-16) ==========
    // These variables are kept to preserve storage layout for upgradeability
    uint256 public __gap_legacy_lpBalance;           // slot 15 (reserved/deprecated)
    address public __gap_legacy_lpToken;             // slot 16 (reserved/deprecated)
    
    // ========== NETWORK CONFIGURATION (slot 17) ==========
    bool public isMainnet;              // slot 17 - true for mainnet (6-token pool), false for testnet (5-token pool)
    
    // ========== RESERVE FOR FUTURE UPGRADES ==========
    // When adding new variables:
    // 1. Add them here (before __gap)
    // 2. Decrease __gap size accordingly
    // Example: uint256 public newVariable; // slot 18
    //          uint256[32] private __gap;  // reduced from 33
    
    // ========== DRAGONSWAP LP TRACKING (slot 18) ==========
    mapping(uint256 => uint256) public lpTokenIds;  // slot 18 - lstIndex => tokenId (NFT Position ID)

    // ========== AGGRESSIVE STRATEGY / AI AGENT (slots 19-21) ==========
    address public agentAddress;           // slot 19 - Authorized agent EOA that can call agentSwap()
    /// @custom:oz-renamed-from agentDeployedCapital
    uint256 public agentAllocatedCapital;  // slot 20 - KAIA amount allocated to aggressive strategy (staked as KoKAIA in vault)
    uint256 public agentTotalProfit;       // slot 21 - Cumulative profit from agent swaps (wei)

    // ========== STKAIA STRATEGY (slots 22-23) ==========
    address public stKaiaToken;        // slot 22 - stKAIA token contract
    address public stKaiaRateProvider; // slot 23 - stKAIA Rate Provider contract

    // ========== INSTANT WITHDRAW (slot 24) ==========
    uint256 public instantWithdrawFeeBps; // slot 24 - fee in basis points (10 = 0.1%), stays in vault

    uint256[26] private __gap;  // Reserve slots 25-50 for future variables (reduced from 27)
}