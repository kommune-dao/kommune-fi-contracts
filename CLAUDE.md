# CLAUDE.md - KommuneFi Contracts

> 상위 가이드 상속 (kommune-dao/CLAUDE.md). 여기서는 반복하지 않음.

## Critical Rules

- **deposit(assets, receiver)** = WKAIA only (approve first). **depositKAIA(receiver)** = native KAIA via msg.value. Never mix them.
- **SwapContract.sol is FINALIZED** -- do not modify.
- New test scripts go in `scripts/temp/` first; move to `scripts/` only when confirmed.
- Always read from `deployments-{profile}-{network}.json` for addresses -- never hardcode.
- Reference `KommuneVaultV2.sol` and `SwapContract.sol` before implementing swap/withdrawal logic.
- Shares != WKAIA. Use `maxWithdraw()` (returns WKAIA) for withdrawal amounts, not `balanceOf()` (returns shares).
- Historical issues: see [CLAUDE_HISTORY.md](./CLAUDE_HISTORY.md)

## Architecture (Separated Vault V2)

| Contract | File | Role |
| -------- | ---- | ---- |
| ShareVault | `src/ShareVault.sol` | ERC-4626 share management |
| VaultCore | `src/VaultCore.sol` | Asset management + LP support |
| SwapContract | `src/SwapContract.sol` | Balancer GIVEN_OUT swaps (FINALIZED) |
| ClaimManager | `src/ClaimManager.sol` | Unstake/claim via delegatecall |

## Vault Profiles

| Profile | investRatio | balancedRatio | Result |
| ------- | ----------- | ------------- | ------ |
| STABLE | 100% | 0% | All WKAIA -> LSTs |
| BALANCED | 100% | 50% | 50% LST, 50% LP |
| AGGRESSIVE | -- | -- | AI Agent (planned) |

- **Slippage**: 10% (testnet), target 5-10% (mainnet)
- **Withdrawal Fee**: 0.3% (30 bps)

## Deployment Addresses

Source of truth: `deployments-{profile}-{network}.json` files.

### Kairos Testnet

**STABLE** (2025-09-02): ShareVault `0x90af...425E` | VaultCore `0xB4a7...AFDd` | SwapContract `0xC0AE...130B` | ClaimManager `0xef47...Bf6E`

**BALANCED** (2025-09-02): ShareVault `0x6c0B...0966` | VaultCore `0x05fa...078A` | SwapContract `0x28e0...875c` | ClaimManager `0x6784...381EC`

Shared: WKAIA `0x0339...b106` | Balancer Vault `0x1c90...F86d`

### Kaia Mainnet

**STABLE** (2025-09-01): ShareVault `0x8679...78AE` | VaultCore `0x06ce...Afc9` | SwapContract `0xAB03...128B` | ClaimManager `0x30d2...8f8f`

**BALANCED** (2025-09-01): ShareVault `0xF4C6...d7f3` | VaultCore `0x95A2...db2dA` | SwapContract `0x015d...a366` | ClaimManager `0xab1D...a366`

Shared: WKAIA `0x19Aa...4432` | Balancer Vault `0xbF1f...E581`

## LST Tokens

| # | Name | Handler/Asset | Wrapped Token |
| --- | ------ | -------------- | --------------- |
| 0 | wKoKAIA | `0xb157...FF9` | `0x9a93...317` |
| 1 | wGCKAIA | H:`0xe4c7...F9c` A:`0x4EC0...7f6` | `0x3243...601` |
| 2 | wstKLAY | H:`0x28B1...75F` A:`0x524d...004` | `0x474B...1aA` |
| 3 | stKAIA | H:`0x4C0d...0b6` | `0x4588...d97` |

- stKAIA is rebasing; rate provider (`0xefBD...146`) applied in VaultCore `getTotalAssets()`.

## LP Calculation (Mainnet 6-Token Pool)

- KoKAIA, GCKAIA, stKLAY: unwrapped amounts only (no rate provider)
- stKAIA: rate provider `0xefBD...146`
- sKLAY: rate provider `0x15F6...c93`
- BPT: excluded from value calculation
- Details: [LP_CALCULATION_LOGIC.md](./docs/LP_CALCULATION_LOGIC.md)

## Scripts

| Category | Scripts |
| -------- | ------- |
| Deploy | `deployFreshStable.js`, `deployFreshBalanced.js` |
| Upgrade (recommended) | `upgradeAllFixed.js`, `upgradeShareVaultFixed.js`, `upgradeVaultCoreFixed.js`, `upgradeSwapContractFixed.js` |
| Upgrade (legacy) | `upgradeAll.js`, `upgradeShareVault.js`, `upgradeVaultCore.js`, `upgradeSwapContract.js` |
| Config | `setAPY.js`, `sendWKAIAtoVaultCores.js`, `recoverSwapAssets.js` |
| Query | `queryLPExit.js`, `queryBPTSwap.js` |
| Test | `scripts/tests/testIntegrated{Stable,Balanced}.js`, `testUnstakeClaim.js` |

### Upgrade Workflow

Enhanced (`*Fixed.js`) scripts handle Hardhat cache issues, LPCalculations library linking, and proxy registration fallback.

```bash
CLEAN_CACHE=true PROFILE=stable npx hardhat run scripts/upgradeAllFixed.js --network kairos
PROFILE=balanced npx hardhat run scripts/upgradeVaultCoreFixed.js --network kaia
```

### Quick Test Commands

```bash
npm run test:stable:testnet
npm run test:balanced:testnet
npm run upgrade:testnet:stable:fixed
```
