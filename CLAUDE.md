# CLAUDE.md - AI Agent Development Guide

> **Purpose**: Essential instructions for AI agents working on KommuneFi Contracts  
> **Company**: Colligence Labs  
> **Project**: Kommune DAO - Multi-LST Yield Optimization Vault

---

## 🚨 MANDATORY FIRST STEPS

**Before implementing ANY feature or fix:**

1. **Read existing implementations FIRST**
   - `src/SwapContract.sol` - ✅ FINALIZED, do not modify
   - `src/KommuneVaultV2.sol` - Reference for swap/withdrawal patterns
   - Working scripts in `scripts/tests/`

2. **Check historical solutions**
   - See [docs/claude-history.md](./docs/claude-history.md) for resolved issues
   - Don't reinvent - copy proven patterns

3. **Never hardcode addresses**
   - Always use deployment files in `deployments/`
   - Use `utils/deployment-paths.js` helper

---

## 📁 Project Structure

```
kommune-fi-contracts/
├── src/                    # Smart contracts (V2 architecture)
│   ├── ShareVault.sol     # ERC-4626 share management
│   ├── VaultCore.sol      # Asset management + LP support
│   ├── SwapContract.sol   # ✅ FINALIZED - Balancer swaps
│   └── ClaimManager.sol   # Unstake/claim operations
├── scripts/               # Deployment & utilities
│   ├── deployFresh*.js   # Fresh deployments
│   ├── upgradeAll*.js    # Contract upgrades
│   ├── tests/            # Integration tests
│   └── temp/             # ⚠️ Put new test scripts here first
├── deployments/          # Deployment configs (JSON)
│   ├── mainnet/         # Kaia mainnet
│   ├── testnet/         # Kairos testnet
│   └── archive/         # Legacy files
├── docs/                # Documentation
│   ├── audit/          # Audit preparation
│   ├── deployment/     # Deployment guides
│   ├── architecture/   # Design & strategy
│   └── technical/      # Implementation details
└── utils/              # Helper functions
```

---

## ⚠️ CRITICAL: Common Mistakes to Avoid

### 1. Deposit Function Confusion

**Two different deposit functions - DO NOT MIX:**

```javascript
// deposit() - WKAIA only (requires approve first)
await wkaia.deposit({value: amount});      // Wrap KAIA to WKAIA
await wkaia.approve(shareVault, amount);   // Approve
await shareVault.deposit(amount, user);    // Deposit

// depositKAIA() - Native KAIA (no approve needed)
await shareVault.depositKAIA(user, {value: amount});
```

❌ **NEVER**: `await shareVault.deposit(amount, user, {value: amount})`  
→ This ALWAYS fails! deposit() expects WKAIA, not native KAIA.

### 2. Shares vs WKAIA Amounts

```javascript
// ❌ WRONG - using shares directly
const shares = await shareVault.balanceOf(user);
await shareVault.redeem(shares / 2n, user, user);

// ✅ CORRECT - using WKAIA amounts
const maxWKAIA = await shareVault.maxWithdraw(user);  // Returns WKAIA amount
await shareVault.withdraw(maxWKAIA / 2n, user, user);
```

**Remember**: 
- `balanceOf()` returns **shares** (internal accounting)
- `maxWithdraw()` returns **WKAIA** (actual withdrawable amount)
- Users care about WKAIA, not shares!

### 3. SwapContract.sol is FINALIZED

**✅ Status**: Thoroughly tested with all 4 LSTs (wKoKAIA, wGCKAIA, wstKLAY, stKAIA)

❌ **DO NOT**:
- Modify SwapContract.sol
- Question the token sorting logic
- Change pool IDs or addresses
- Alter GIVEN_OUT swap implementation

---

## 📝 Development Guidelines

### Script Organization

**⚠️ IMPORTANT**: Always create new test scripts in `scripts/temp/` first

```bash
# ✅ CORRECT
scripts/temp/myNewTest.js

# ❌ WRONG
scripts/myNewTest.js
```

Only move to `scripts/` when explicitly approved.

### Getting Deployment Addresses

```javascript
// Use helper function (recommended)
const { getDeploymentPathWithFallback } = require('./utils/deployment-paths');
const path = getDeploymentPathWithFallback(network, profile);
const deployments = JSON.parse(fs.readFileSync(path, 'utf8'));

// Or direct path
const mainnetPath = 'deployments/mainnet/kaia-stable.json';
const testnetPath = 'deployments/testnet/kairos-balanced.json';
```

**Deployment files are the source of truth** - never hardcode addresses.

### Key Commands

```bash
# Deploy fresh
npx hardhat run scripts/deployFreshStable.js --network kairos
npx hardhat run scripts/deployFreshBalanced.js --network kaia

# Upgrade (use *Fixed.js versions - handle cache issues)
PROFILE=stable npx hardhat run scripts/upgradeAllFixed.js --network kairos

# Test
npx hardhat run scripts/tests/testIntegratedStable.js --network kairos
npx hardhat run scripts/tests/testIntegratedBalanced.js --network kairos

# Send rewards
npx hardhat run scripts/sendWKAIAtoVaultCores.js --network kaia
```

---

## 📖 Documentation Reference

### Quick Links

- **[README.md](./README.md)** - Project overview & quick start
- **[docs/claude-history.md](./docs/claude-history.md)** - Historical issues & solutions
- **[docs/deployment/](./docs/deployment/)** - Deployment & upgrade guides
- **[docs/architecture/](./docs/architecture/)** - System design & investment strategies
- **[docs/technical/](./docs/technical/)** - Implementation details

### Key Technical Docs

- [Deployment Guide](./docs/deployment/deployment-guide.md)
- [Upgrade Guide](./docs/deployment/upgrade-guide.md)
- [LP Calculation Logic](./docs/technical/lp-calculation-logic.md)
- [Sequential Swap](./docs/technical/sequential-swap.md)

For Korean docs, append `-kr` to filename: `deployment-guide-kr.md`

---

## 🔑 Key Concepts

### Architecture: Separated Vault (V2)

```
User ←→ ShareVault (ERC-4626) ←→ VaultCore (LST management)
                                       ↓
                                  SwapContract (Balancer)
                                       ↓
                                  ClaimManager (Unstake/Claim)
```

**Contracts**:
- **ShareVault**: ERC-4626 compliant, manages user shares
- **VaultCore**: Asset allocation across 4 LSTs + LP pools
- **SwapContract**: Handles all Balancer swaps (FINALIZED)
- **ClaimManager**: Processes unstake/claim via delegatecall

### LST Tokens

4 Liquid Staking Tokens integrated:
1. **wKoKAIA** (Index 0) - Wrapped KoKAIA
2. **wGCKAIA** (Index 1) - Wrapped GCKAIA
3. **wstKLAY** (Index 2) - Wrapped stKLAY
4. **stKAIA** (Index 3) - stKAIA (uses rate provider)

**Note**: stKAIA is rebasing token - rate provider converts to KAIA equivalent.

### Investment Profiles

- **STABLE**: 100% to LST staking, 0% LP
- **BALANCED**: 50% LST staking, 50% LP pools
- **AGGRESSIVE**: Custom ratios (configurable)

**Example (BALANCED)**:
- investRatio = 100% (all WKAIA → LST)
- balancedRatio = 50% (half of LST → LP)
- Result: 50% stays as LST, 50% goes to LP

---

## ⚙️ Configuration

### Deployment Files Structure

```
deployments/
├── mainnet/
│   ├── kaia-stable.json      # Mainnet STABLE profile
│   └── kaia-balanced.json    # Mainnet BALANCED profile
├── testnet/
│   ├── kairos-stable.json    # Testnet STABLE profile
│   ├── kairos-balanced.json  # Testnet BALANCED profile
│   └── kairos-v1.json        # Legacy V1 deployment
└── archive/
    └── *.json                # Legacy deployment files
```

### Current Settings

**STABLE Profile**:
- investRatio: 100% (all to LSTs)
- Liquidity buffer: 0%
- Withdrawal fee: 0.3% (30 basis points)

**BALANCED Profile**:
- investRatio: 100%
- balancedRatio: 50% (50% of LST → LP)
- Liquidity buffer: 0%
- Withdrawal fee: 0.3%

---

## 🎯 Quick Troubleshooting

### Issue: Transaction fails with "Deposit failed"
→ Check if you're using correct deposit function (WKAIA vs native KAIA)

### Issue: Can't find deployment addresses
→ Check `deployments/{network}/{profile}.json` files

### Issue: Test script creating mess in root
→ Always create in `scripts/temp/` first

### Issue: Upgrade fails with cache errors
→ Use `*Fixed.js` versions: `upgradeAllFixed.js`, `upgradeVaultCoreFixed.js`

### Issue: Need to reference specific contract version
→ Check git history or [docs/claude-history.md](./docs/claude-history.md)

---

## 📋 Checklist for New Features

Before implementing:
- [ ] Read this guide completely
- [ ] Check [docs/claude-history.md](./docs/claude-history.md) for similar issues
- [ ] Review existing implementations in `src/`
- [ ] Create test script in `scripts/temp/`
- [ ] Use deployment files, never hardcode addresses
- [ ] Test on Kairos testnet first
- [ ] Document any new patterns discovered

---

## 🚀 Recent Updates

### 2025-09-03: LP Query Tools
- Added `scripts/queryLPExit.js` - Query single-token exit values
- Added `scripts/queryBPTSwap.js` - Query BPT→WKAIA swap rates

### 2025-09-03: stKAIA Rate Provider Fix
- VaultCore now correctly applies rate provider to direct stKAIA holdings

### 2025-09-02: Enhanced Upgrade Scripts
- Added `*Fixed.js` versions with cache handling
- Improved library linking for VaultCore upgrades

### 2025-08-14: SwapContract Finalized
- All 4 LSTs tested successfully
- Asset recovery functions added

---

**Last Updated**: 2026-01-22  
**Maintainer**: Colligence Labs  
**For detailed history**: See [docs/claude-history.md](./docs/claude-history.md)
