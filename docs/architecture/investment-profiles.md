# Investment Profiles — KommuneFi Vault

Last updated: 2026-01-31

## Overview

KommuneFi deploys **three independent vault sets** on Kaia mainnet, each with its own UUPS proxy contracts (ShareVault, VaultCore, DragonSwapHandler, ClaimManager). Profiles differ by on-chain ratio configuration and whether an AI Agent is attached.

## Ratio System

All ratios are in basis points (10000 = 100%).

```solidity
// SharedStorage.sol
uint256 public investRatio;      // slot 7  — % of deposit to invest
uint256 public balancedRatio;    // slot 12 — % of invested amount routed to LP
uint256 public aggressiveRatio;  // slot 13 — stored but NOT used in deposit flow
```

Set via owner-only function:

```solidity
function setInvestmentRatios(uint256 _i, uint256 _b, uint256 _a) external onlyOwner {
    require(_b + _a <= 10000, "E14");
    investRatio = _i; balancedRatio = _b; aggressiveRatio = _a;
}
```

> **Note**: `stableRatio` was removed. The stable portion is implicit: `investRatio - balancedRatio` goes to KoKAIA staking.

## Deposit Flow (VaultCore.handleDeposit)

```text
amountToInvest   = deposit × investRatio / 10000
balancedPortion  = amountToInvest × balancedRatio / 10000
stakePortion     = amountToInvest − balancedPortion

KoKAIA staking   = stakePortion + (balancedPortion / 2)
WKAIA for LP     = balancedPortion / 2

If balancedPortion > 0 → mint DragonSwap V3 full-range LP (WKAIA + KoKAIA)
Reserve           = deposit − amountToInvest  (stays as WKAIA)
```

`aggressiveRatio` is **not referenced** in the deposit flow. The aggressive strategy is implemented externally by the AI Agent operating on vault assets post-deposit.

---

## Mainnet Profiles (On-Chain State, 2026-01-31)

### 1. Stable

| Parameter | Value |
|-----------|-------|
| VaultCore | `0xfb2e4E39629b0DaC9c2fdf268191de46E214eC90` |
| investRatio | 10000 (100%) |
| balancedRatio | 0 |
| aggressiveRatio | 0 |
| Agent | None (`0x0`) |
| stKAIA | Not upgraded |
| LP Position | None |
| Assets | ~100 KoKAIA |

**Behavior**: 100% of deposits staked to KoKAIA. No LP, no agent, no reserve. Yield from KoKAIA staking rewards only.

### 2. Balanced

| Parameter | Value |
|-----------|-------|
| VaultCore | `0x65Aba372d675d117a6aEc9736C7F703De7f08B51` |
| investRatio | 10000 (100%) |
| balancedRatio | 10000 (100%) |
| aggressiveRatio | 0 |
| Agent | None (`0x0`) |
| stKAIA | Not upgraded |
| LP Position | NFT #42343 (active) |
| Assets | ~0.6 WKAIA (LP remainder) |

**Behavior**: With `balancedRatio=10000`, the entire deposit is treated as balanced portion:
- 50% staked to KoKAIA
- 50% kept as WKAIA
- Both used to mint a full-range DragonSwap V3 WKAIA/KoKAIA LP position

Yield from KoKAIA staking rewards + LP swap fees (0.1% fee tier).

### 3. Aggressive

| Parameter | Value |
|-----------|-------|
| VaultCore | `0xc2AC68C0d96A34d9DAC80CF53BFFF003547ea493` |
| investRatio | 10000 (100%) |
| balancedRatio | 0 |
| aggressiveRatio | 0 |
| Agent | `0x3797E85c0837C9d2aa3Df1D42fF397FDff274271` |
| stKAIA Token | `0x42952B873ed6f7f0A7E4992E2a9818E3A9001995` |
| stKAIA Rate Provider | `0xefBDe60d5402a570DF7CA0d26Ddfedc413260146` |
| LP Position | NFT #42342 (exists) |
| Assets | ~995 KoKAIA |

**Behavior**: Deposit flow identical to Stable (100% KoKAIA staking). The AI Agent manages vault assets post-deposit via `onlyAgent` functions:

- `agentSwap()` / `agentSwapExactOutput()` — DEX arbitrage (KoKAIA ↔ WKAIA)
- `agentBuyStKaia()` — 2-hop: KoKAIA → WKAIA → stKAIA (exploits ~16.9% DEX vs unstake spread)
- `agentRequestUnstake()` — stKAIA 7-day unbonding request
- `agentClaimUnstake()` — Claim matured KAIA → auto-restake to KoKAIA

This is the only profile upgraded to the latest VaultCore implementation (with SharedStorage slots 19-23: agent address, allocated capital, profit tracking, stKAIA addresses).

---

## Profile Comparison

| | Stable | Balanced | Aggressive |
|---|--------|----------|------------|
| **Deposit** | 100% KoKAIA | 50% KoKAIA + 50% WKAIA → LP | 100% KoKAIA |
| **Reserve** | 0% | 0% | 0% |
| **LP** | No | DragonSwap V3 full-range | Via agent ops |
| **Agent** | No | No | Yes |
| **stKAIA** | No | No | Yes |
| **Yield** | Staking | Staking + LP fees | Staking + agent arb |
| **Contract Version** | Base | Base | Latest (stKAIA) |

## Administration

### Setting Ratios

```bash
# Stable: all staking
PROFILE=stable INVEST=10000 BALANCED=0 AGGRESSIVE=0 \
  npx hardhat run scripts/setRatios.js --network kaia

# Balanced: all LP
PROFILE=balanced INVEST=10000 BALANCED=10000 AGGRESSIVE=0 \
  npx hardhat run scripts/setRatios.js --network kaia
```

### Setting Agent (Aggressive Only)

```bash
AGENT_ADDRESS=0x3797... npx hardhat run scripts/setAgentAddress.js --network kaia
```

### Upgrading VaultCore

```bash
# Per-profile upgrade
PROFILE=aggressive npx hardhat run scripts/upgradeVaultCoreProfile.js --network kaia

# Aggressive-specific (includes stKAIA address setup)
npx hardhat run scripts/upgradeVaultCoreAggressive.js --network kaia
```

## Security Considerations

1. **Owner-only**: All ratio and agent changes require contract owner signature.
2. **Agent isolation**: Agent EOA can only call whitelisted functions; assets never leave VaultCore.
3. **Ratio validation**: `balancedRatio + aggressiveRatio <= 10000` enforced on-chain.
4. **Storage safety**: UUPS proxy + SharedStorage pattern prevents slot collision on upgrade.
5. **Emergency**: Set `investRatio=0` to halt new investment without blocking withdrawals.
