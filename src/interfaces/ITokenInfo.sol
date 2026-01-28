// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

struct TokenInfo {
    address handler;
    address asset;
    address tokenA;     // Wrapped LST (e.g. wKoKAIA)
    address tokenB;     // Intermediate token (if needed, or unused)
    address tokenC;     // WKAIA
    address poolAddress; // DragonSwap V3 Pool Address
    uint24 feeTier;      // DragonSwap V3 Fee Tier (e.g., 500, 3000, 10000)
}