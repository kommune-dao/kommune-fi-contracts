# Kommune-Fi Vault Contracts (Audit Version)

Multi-Strategy yield optimization vault on Kaia blockchain. Refactored and frozen for security audit.

![Status](https://img.shields.io/badge/Status-Mainnet_Deployed-green)
![Network](https://img.shields.io/badge/Network-Kaia_Cypress_&_Kairos-blue)

## Audit Overview

This version implements the **Stable Strategy** (100% KoKAIA Staking) with strict separations of concern for security. Mainnet deployments include Balanced and Aggressive profiles with AI Agent integration.

*   **Logic Deduplication**: `ShareVault` refactored to minimize code paths.
*   **Documentation**: fully documented with NatSpec conventions.
*   **Upgrade Safety**: UUPS Proxy pattern with `SharedStorage` layout protection.
*   **Test Coverage**: Functional tests for Deposit, Withdraw, and Proxy Upgrades.

---

## 🏗 System Architecture

```mermaid
graph TD
    User([User]) -->|Deposit/Mint| ShareVault
    ShareVault -->|Delegate Assets| VaultCore
    VaultCore -->|Stake/Unstake| KoKaia[KoKAIA Protocol]
    VaultCore -->|Swap/LP| DragonHandler[DragonSwapHandler]
    DragonHandler -->|Swap Logic| DragonSwap[DragonSwap V3]
    VaultCore -.->|DelegateCall| ClaimManager
    
    subgraph Core Contracts
    ShareVault
    VaultCore
    DragonHandler
    ClaimManager
    end
```

### Core Components
| Contract | Role | Key Responsibility |
|----------|------|--------------------|
| **ShareVault.sol** | Frontend | ERC-4626 Interface. Manages User Shares. |
| **VaultCore.sol** | Backend | Asset Custody. Executes Staking & Allocations. |
| **DragonSwapHandler.sol** | DEX Handler | Isolates Swap/Liquidity Logic from Core. |
| **ClaimManager.sol** | Unstaking | Manages 7-day unbonding period & claiming. |
| **SharedStorage.sol** | Storage | Prevents storage collisions for `delegatecall`. |

---

## 🛠 Quick Start

### 1. Installation
```bash
npm install
npx hardhat compile
```

### 2. Deployment (Audit Setup)
Deploys the clean, optimized suite to **Kairos Testnet**.
```bash
npx hardhat run scripts/deployAudit.js --network kairos
```
> **Artifact**: `deployments/testnet/audit-kairos.json`

### 3. Verification
**Functional Test (In/Out)**:
```bash
npx hardhat run scripts/testDepositWithdraw.js --network kairos
```

**Upgradeability Test (UUPS Proxy)**:
```bash
npx hardhat run scripts/testAuditUpgrade.js --network kairos
```

---

## 📂 Repository Structure

*   `src/` - **Audit Scope**. The 5 core Solidity contracts.
*   `scripts/` - **Validation Scripts**. Minimal set for audit verification.
*   `deployments/` - **Active Config**. Only contains the current audit deployment.
*   `docs/` - **Documentation**. Detailed guides and specs.
    *   [Audit Guide](docs/audit/audit-readme.md)
    *   [Deployment Guide](docs/deployment/deployment-guide.md)
    *   [Storage Layout](docs/architecture/storage-layout.md)

> **Note**: Legacy code and scripts have been moved to `_archive/` and are excluded from the audit scope.

---

## Investment Strategies (Mainnet On-Chain State)

Three independent vault deployments, each with its own proxy set. Ratios are configured via `setInvestmentRatios(investRatio, balancedRatio, aggressiveRatio)`.

### Stable — 100% KoKAIA Staking

*   `investRatio=10000, balancedRatio=0, aggressiveRatio=0`
*   All deposits staked to KoKAIA protocol. No LP, no agent.
*   Yield source: KoKAIA staking rewards only.
*   Implementation: **base version** (stKAIA slots not upgraded).

### Balanced — 50/50 KoKAIA + WKAIA → DragonSwap V3 LP

*   `investRatio=10000, balancedRatio=10000, aggressiveRatio=0`
*   Deposit flow splits 50% KoKAIA (staking) + 50% WKAIA, then mints full-range DragonSwap V3 LP (NFT #42343).
*   Yield source: KoKAIA staking rewards + LP swap fees.
*   Implementation: **base version** (stKAIA slots not upgraded).

### Aggressive — 100% KoKAIA + AI Agent Post-Deposit Management

*   `investRatio=10000, balancedRatio=0, aggressiveRatio=0`
*   Deposit flow identical to Stable (100% KoKAIA staking).
*   AI Agent (`0x3797...4271`) manages vault assets after deposit.
*   stKAIA configured: token `0x4295...1995`, rateProvider `0xefBD...0146`.
*   LP NFT #42342 exists (created during agent operations).
*   Implementation: **latest version** with stKAIA support (slots 22-23).

### On-Chain Ratio Summary

| Profile | investRatio | balancedRatio | aggressiveRatio | Agent | stKAIA | LP |
|---------|-------------|---------------|-----------------|-------|--------|-----|
| **Stable** | 10000 | 0 | 0 | — | N/A | — |
| **Balanced** | 10000 | 10000 | 0 | — | N/A | #42343 |
| **Aggressive** | 10000 | 0 | 0 | Active | Active | #42342 |

> **Note**: `aggressiveRatio` is stored in SharedStorage but not used in the deposit flow. The aggressive strategy is implemented via AI Agent functions that operate on vault assets post-deposit.

---

## AI Agent Integration (Aggressive Profile Only)

VaultCore exposes agent-only functions for automated yield optimization:

*   `agentSwap()` / `agentSwapExactOutput()` — DEX arbitrage (KoKAIA ↔ WKAIA) via DragonSwap V3
*   `agentBuyStKaia()` — 2-hop purchase: KoKAIA → WKAIA → stKAIA
*   `agentRequestUnstake()` — Initiate 7-day stKAIA unbonding
*   `agentClaimUnstake()` — Claim matured KAIA → auto-restake to KoKAIA

Agent is authorized via `setAgentAddress()` in VaultCore. All assets remain in vault; agent EOA only sends control transactions.

---

## Deployment Addresses

### Kairos Testnet (Audit Baseline)

*Source: `deployments/testnet/audit-kairos.json`*

| Contract | Address |
|----------|---------|
| **ShareVault** | `0xEce34C711903b0884DB9B2248f498796BA36980B` |
| **VaultCore** | `0x7BFFAb552E3CA60C9993C05bF66D078a3aDc09e6` |
| **DragonSwapHandler** | `0xd998B223dfD57D74fC15bbf127Ad32bbC4B04320` |
| **ClaimManager** | `0x1A9914728e101d2cEE477C3c1db98519B7B08B1D` |

### Kaia Mainnet — Stable Profile

*Source: `deployments/mainnet/audit-kaia-stable.json` (2026-01-30)*

| Contract | Address |
|----------|---------|
| **ShareVault** | `0x7a801555A3c489652ce88D6E0768FA75E699088D` |
| **VaultCore** | `0xfb2e4E39629b0DaC9c2fdf268191de46E214eC90` |
| **DragonSwapHandler** | `0x7F6a983e5509eD4168cA1Bf413be3259b5083768` |
| **ClaimManager** | `0x705843370841294241cA7E874Ae316F0931243c1` |

### Kaia Mainnet — Aggressive Profile (AI Agent)

*Source: `deployments/mainnet/audit-kaia-aggressive.json` (2026-01-30)*

| Contract | Address |
|----------|---------|
| **ShareVault** | `0x8663b23E3a4ECd9ED6424854656CC5463C11C197` |
| **VaultCore** | `0xc2AC68C0d96A34d9DAC80CF53BFFF003547ea493` |
| **DragonSwapHandler** | `0xDa3Fce1B7e2a63918B47B3467831430B6bd8F812` |
| **ClaimManager** | `0x07fC311311143aB44D73D3DA484a8C4366F0ac5F` |

Configuration: investRatio=10000 (100%), basisPointsFees=1000 (10%).
