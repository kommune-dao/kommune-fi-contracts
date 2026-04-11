# GitHub Copilot Instructions - KommuneFi Contracts (Audit Version)

> Multi-Strategy yield optimization vault on KAIA blockchain.

---

## 🚀 Audit-Ready State (Current)

**The codebase is currently frozen for audit.**
*   **Strategy**: "Stable" (100% KoKAIA Staking). No LP logic is active.
*   **Active Contracts**: Only 5 core contracts in `src/`.
*   **Deployment**: Single active deployment file: `deployments/testnet/audit-kairos.json`.
*   **Scripts**: Minimized to `deployAudit.js`, `testDepositWithdraw.js`, `testAuditUpgrade.js`.

---

## 🏗 Architecture (Split Vault)

```
┌──────────────┐     delegatecall     ┌──────────────┐
│  ShareVault  │ ───────────────────> │  VaultCore   │
│ (User Entry) │                      │ (Asset Mgmt) │
└──────────────┘                      └──────┬───────┘
       │                                     │
       │                                     ▼
       │                            ┌─────────────────────┐
       │                            │  DragonSwapHandler  │
       └──────────────────────────> │ (Swaps/LP Minting)  │
                                    └─────────────────────┘
```

*   **ShareVault**: Implementation of ERC-4626. Manages Shares (Mint/Burn).
*   **VaultCore**: Holds all Assets (WKAIA, LSTs). Manages logic.
*   **SharedStorage**: Critical for `delegatecall` safety. **ALWAYS** inherit this first.

---

## 🚨 Critical Rules

### 1. Storage Safety (Upgradeability)
*   **NEVER** add state variables to `VaultCore` or `ShareVault` directly.
*   **ALWAYS** add new variables to `SharedStorage.sol` inside the `SharedStorage` struct, **before** the `__gap`.
*   **Check** `storage-layout.md` before making changes.

### 2. Deployment & Testing
*   **Deploy**: Use `scripts/deployAudit.js`. Do **NOT** use legacy `deployFresh*.js` scripts.
*   **Test**: Use `scripts/testDepositWithdraw.js` for functional testing.
*   **Addresses**: Read ONLY from `deployments/testnet/audit-kairos.json`.

### 3. Code Style & NatSpec
*   **NatSpec**: Mandatory for all public/external functions.
    *   `@notice`: User-friendly description.
    *   `@dev`: Technical implementation details.
    *   `@param`: Parameter explanation.
*   **Modifiers**: Use `nonReentrant` on all external state-changing functions.
*   **SafeTransfer**: Always use `SafeERC20` for token transfers.

---

## 📝 Common Tasks

### How to Deploy (Fresh)
```bash
npx hardhat run scripts/deployAudit.js --network kairos
```

### How to Verify Functionality
```bash
npx hardhat run scripts/testDepositWithdraw.js --network kairos
```

### How to Verify Upgrades (UUPS)
```bash
npx hardhat run scripts/testAuditUpgrade.js --network kairos
```

---

## 📦 Commit Guidelines (Conventional Commits)

Commits must follow **Simple Title + Detailed Body** format.

### Format
```text
<type>: <short summary>

<detailed explanation of what changed>
<why it changed>
<list of specific updates>
```

### Example
```text
docs: Complete documentation update and cleanup

Update all documentation for reorganized project structure and remove 
temporary planning files.

Documentation updates:
- README.md: Add organized documentation links
- CLAUDE.md: Update with new project structure and deployment paths
- Fix all links to use kebab-case paths

Cleanup:
- Remove FILE_CLEANUP_PLAN.md (task completed)
```

### Types
*   `feat`: New feature
*   `fix`: Bug fix
*   `refactor`: Code change that neither fixes a bug nor adds a feature
*   `docs`: Documentation only changes
*   `chore`: Maintainance tasks (builds, tools, cleanup)
*   `test`: Adding or missing tests

---

## 🚫 Avoid Legacy Patterns (Do Not Use)
*   ❌ `LPCalculations` (Removed/Archived)
*   ❌ `SwapContract` (Replaced by `DragonSwapHandler`)
*   ❌ `deployments/archive/*` (Legacy records)
*   ❌ Complex "Balanced" strategy logic (Commented out/Disabled for audit)

---

**Primary Language**: Korean (한국어) for explanations, English for Code/Comments.
