# GitHub Copilot Instructions - KommuneFi Contracts

> Multi-LST yield optimization vault on KAIA blockchain

---

## Communication Guidelines

**Language**: Communicate with users in **Korean (한국어)** by default.

- ✅ Respond to user questions in Korean
- ✅ Provide explanations and documentation in Korean
- ✅ Code comments should remain in English (industry standard)
- ✅ Technical terms can use English (e.g., "wallet", "transaction", "signature")
- ✅ **Commit messages must be in English** (following Conventional Commits format)

---

## Project Overview

**KommuneFi Contracts** is an ERC-4626 compliant yield vault protocol that optimizes returns across multiple Liquid Staking Tokens (LSTs) on the KAIA blockchain. The protocol features two investment profiles and integrates with Balancer V2 for liquidity management.

**Key Information:**
- **Tech Stack**: Solidity ^0.8.20, Hardhat 2.23+, OpenZeppelin 5.4.0
- **Networks**: KAIA Mainnet (8217), Kairos Testnet (1001)
- **Package Manager**: Yarn 1.22.22
- **Node Version**: 16+
- **Status**: Production-ready (audit-ready)

**Repository**: KommuneDAO/kommune-fi-contracts

---

## Architecture

### Separated Vault Architecture (V2)

The protocol uses a modular architecture for size optimization and security:

```
┌─────────────────┐
│  ShareVault     │  ERC-4626 share management (12.23 KB)
│  (Proxy)        │  - mint/burn shares
└────────┬────────┘  - deposit/withdraw/redeem
         │
         │ delegatecall
         ▼
┌─────────────────┐
│  VaultCore      │  Asset management logic (~20 KB)
│  (Proxy)        │  - LST conversions
└────────┬────────┘  - LP pool management
         │            - Fee calculations
         │
         │ external call
         ▼
┌─────────────────┐
│  SwapContract   │  Balancer swap handler (9.26 KB)
│  (Proxy)        │  ✅ FINALIZED - DO NOT MODIFY
└─────────────────┘  - GIVEN_OUT swaps for precise amounts
         │
         │ external call
         ▼
┌─────────────────┐
│  ClaimManager   │  Unstake/claim operations (4.0 KB)
│  (Proxy)        │  - Via delegatecall from VaultCore
└─────────────────┘  - Owner-only operations
```

### Core Contracts

| Contract | Size | Purpose | Status |
|----------|------|---------|--------|
| **ShareVault** | 12.23 KB | ERC-4626 share issuance | Upgradeable |
| **VaultCore** | ~20 KB | Asset management + LP | Upgradeable |
| **SwapContract** | 9.26 KB | Balancer V2 integration | ✅ FINALIZED |
| **ClaimManager** | 4.0 KB | Unstake/claim handling | Upgradeable |

---

## Supported LSTs (4 Tokens)

### 1. wKoKAIA (Index 0)
```
Handler/Asset: 0xb15782EFbC2034E366670599F3997f94c7333FF9
Wrapped Token: 0x9a93e2fcDEBE43d0f8205D1cd255D709B7598317
```

### 2. wGCKAIA (Index 1)
```
Handler:       0xe4c732f651B39169648A22F159b815d8499F996c
Asset:         0x4EC04F4D46D7e34EBf0C3932B65068168FDcE7f6
Wrapped Token: 0x324353670B23b16DFacBDE169Cd8ebF8C8bf6601
```

### 3. wstKLAY (Index 2)
```
Handler:       0x28B13a88E72a2c8d6E93C28dD39125705d78E75F
Asset:         0x524dCFf07BFF606225A4FA76AFA55D705B052004
Wrapped Token: 0x474B49DF463E528223F244670e332fE82742e1aA
```

### 4. stKAIA (Index 3)
```
Handler:       0x4C0d434C7DD74491A52375163a7b724ED387d0b6
Asset/Wrapped: 0x45886b01276c45Fe337d3758b94DD8D7F3951d97
Rate Provider: 0xefBDe60d5402a570DF7CA0d26Ddfedc413260146 (1.0589x)
```

**Important**: stKAIA is a rebasing token. Use the rate provider for KAIA conversion calculations.

---

## Investment Profiles

### STABLE Profile
- **investRatio**: 100% (all deposits convert to LSTs)
- **balancedRatio**: 0% (no LP pool deposits)
- **Strategy**: Pure LST holdings for maximum stability
- **Use Case**: Conservative yield optimization

### BALANCED Profile
- **investRatio**: 100%
- **balancedRatio**: 50%
- **Effective Distribution**:
  - 50% → LST holdings
  - 50% → Balancer LP pools
- **Use Case**: Higher yield with LP fee income

**Calculation**:
```
WKAIA buffer = (1 - investRatio) × total
LST holdings = investRatio × (1 - balancedRatio) × total
LP holdings  = investRatio × balancedRatio × total
```

---

## Critical Development Rules

### 🚨 RULE 1: NEVER Modify SwapContract.sol

**Status**: ✅ FINALIZED (2025-08-14)

SwapContract.sol has been:
- Fully tested with all 4 LSTs
- Optimized for GIVEN_OUT swaps
- Successfully integrated with Balancer V2
- Asset recovery functions added (2025-08-25)

**DO NOT**:
- ❌ Modify any function in SwapContract.sol
- ❌ Change token sorting logic
- ❌ Alter pool IDs or addresses
- ❌ Question the GIVEN_OUT implementation

### 🚨 RULE 2: Understand Deposit Functions

**CRITICAL**: Two different deposit functions with different requirements:

#### deposit(uint256 assets, address receiver) - WKAIA ONLY
```solidity
// Requires:
// 1. User already has WKAIA
// 2. WKAIA approved to ShareVault
// 3. NO msg.value

// WRONG ❌
await shareVault.deposit(amount, user, {value: amount}); // WILL FAIL!

// CORRECT ✅
await wkaia.deposit({value: amount});          // Wrap KAIA → WKAIA
await wkaia.approve(shareVault, amount);       // Approve
await shareVault.deposit(amount, user);        // Deposit
```

#### depositKAIA(address receiver) - NATIVE KAIA
```solidity
// Requires:
// 1. Send native KAIA as msg.value
// 2. NO approve needed

// CORRECT ✅
await shareVault.depositKAIA(user, {value: amount});
```

**Common Mistake**: Using `deposit()` with `{value: amount}` - This ALWAYS fails!

### 🚨 RULE 3: Use Deployment Files for Addresses

**NEVER hardcode contract addresses**. Always read from deployment files:

```javascript
// ✅ CORRECT
const deployments = JSON.parse(
  fs.readFileSync(`deployments-${profile}-${network}.json`, 'utf8')
);
const shareVault = deployments.shareVault;
const vaultCore = deployments.vaultCore;

// ❌ WRONG
const shareVault = "0x90af1a8b94480Ce57a4c4E86d14c8Fb3D95b425E"; // Hardcoded
```

**Deployment Files**:
- `deployments-stable-kairos.json` - Testnet STABLE
- `deployments-balanced-kairos.json` - Testnet BALANCED
- `deployments-stable-kaia.json` - Mainnet STABLE
- `deployments-balanced-kaia.json` - Mainnet BALANCED

### 🚨 RULE 4: Shares vs WKAIA

Users care about **WKAIA amounts**, not shares.

```javascript
// ❌ WRONG - using shares
const shares = await shareVault.balanceOf(user);
const withdrawShares = shares / 2n;
await shareVault.redeem(withdrawShares, user, user);

// ✅ CORRECT - using WKAIA amounts
const maxWKAIA = await shareVault.maxWithdraw(user); // Returns WKAIA!
const withdrawWKAIA = maxWKAIA / 2n;
await shareVault.withdraw(withdrawWKAIA, user, user);
```

**Key Methods**:
- `maxWithdraw(user)` → Returns **WKAIA** amount
- `balanceOf(user)` → Returns **shares** amount
- `withdraw(assets, ...)` → Takes **WKAIA** amount
- `redeem(shares, ...)` → Takes **shares** amount

### 🚨 RULE 5: Test Scripts Organization

**Always create new test scripts in `scripts/temp/` first**:

```bash
# ✅ CORRECT
scripts/temp/newTestScript.js

# ❌ WRONG
scripts/newTestScript.js
```

**Folder Structure**:
- `scripts/` - Production-ready scripts
- `scripts/temp/` - Temporary test scripts (cleanup later)
- `scripts/tests/` - Component-specific tests

---

## Development Workflow

### Environment Setup

```bash
# Install dependencies
yarn install

# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test
```

### Network Configuration

**Testnet (Kairos - Chain ID 1001)**:
```bash
PRIVATE_KEY=your_private_key npx hardhat run scripts/script.js --network kairos
```

**Mainnet (Kaia - Chain ID 8217)**:
```bash
PRIVATE_KEY=your_private_key npx hardhat run scripts/script.js --network kaia
```

### Profile Selection

Use the `PROFILE` environment variable to select investment profile:

```bash
# STABLE profile
PROFILE=stable npx hardhat run scripts/deployFreshStable.js --network kairos

# BALANCED profile
PROFILE=balanced npx hardhat run scripts/deployFreshBalanced.js --network kairos
```

---

## Common Development Tasks

### 1. Deploy Fresh Contracts

```bash
# Deploy STABLE profile (testnet)
npm run deploy:testnet:stable

# Deploy BALANCED profile (testnet)
npm run deploy:testnet:balanced

# Deploy to mainnet
npm run deploy:mainnet:stable
npm run deploy:mainnet:balanced
```

### 2. Upgrade Contracts

**⚠️ IMPORTANT**: Use `*Fixed.js` scripts to handle cache issues and library linking.

#### Standard Upgrade (may encounter cache issues)
```bash
PROFILE=stable npx hardhat run scripts/upgradeAll.js --network kairos
```

#### Enhanced Upgrade (RECOMMENDED)
```bash
# Clean cache and upgrade all
CLEAN_CACHE=true PROFILE=stable npx hardhat run scripts/upgradeAllFixed.js --network kairos

# Individual upgrades
PROFILE=balanced npx hardhat run scripts/upgradeVaultCoreFixed.js --network kaia
PROFILE=stable npx hardhat run scripts/upgradeShareVaultFixed.js --network kairos
```

**Enhanced Scripts Handle**:
- Hardhat upgrades plugin cache issues
- LPCalculations library deployment and linking (VaultCore)
- Proxy registration fallback logic
- ClaimManager optimization (only redeploys when code changes)

**Clean Cache Before Upgrade**:
```bash
rm -rf .openzeppelin cache artifacts/build-info
npx hardhat compile
PROFILE=stable npx hardhat run scripts/upgradeAllFixed.js --network kairos
```

### 3. Send Rewards to VaultCore

```bash
# Send default 0.5 WKAIA to each VaultCore
npx hardhat run scripts/sendWKAIAtoVaultCores.js --network kaia

# Send custom amount
SEND_AMOUNT=1 npx hardhat run scripts/sendWKAIAtoVaultCores.js --network kairos
```

**Effect**: Increases totalAssets proportionally for all depositors.

### 4. Configure APY Values

```bash
# Set APY for LSTs
npx hardhat run scripts/setAPY.js --network kairos
```

### 5. Recover Stranded Assets

```bash
# Recover assets from SwapContract
npx hardhat run scripts/recoverSwapAssets.js --network kairos
```

### 6. Run Integration Tests

```bash
# Test STABLE mode
npm run test:stable:testnet

# Test BALANCED mode
npm run test:balanced:testnet

# Manual test scripts
npx hardhat run scripts/tests/testIntegratedStable.js --network kairos
npx hardhat run scripts/tests/testIntegratedBalanced.js --network kairos
```

---

## LP Token Valuation

### Query Tools

#### Query Single-Token Exit Values
```bash
# Query exit values from Balancer pool
npx hardhat run scripts/queryLPExit.js --network kairos

# Custom LP amount
LP_AMOUNT=1000 npx hardhat run scripts/queryLPExit.js --network kaia
```

#### Query BPT→WKAIA Swap Rates
```bash
# Query BPT swap through dedicated pool
npx hardhat run scripts/queryBPTSwap.js --network kairos
```

### LP Calculation Logic (Mainnet 6-Token Pool)

**Token Handling**:
- **KoKAIA, GCKAIA, stKLAY**: Use unwrapped amounts only (no rate provider)
- **stKAIA**: Apply rate provider (0xefBDe60d...0146) for KAIA conversion
- **sKLAY**: Apply rate provider (0x15F6f25f...c93) for KAIA conversion
- **BPT**: Excluded from value calculation

**Reference**: See `docs/LP_CALCULATION_LOGIC.md` for detailed implementation.

---

## Security Guidelines

### Critical Security Patterns

#### 1. ERC-4626 Standard Compliance
```solidity
// Standard pattern
function deposit(uint256 assets, address receiver) 
    external returns (uint256 shares) 
{
    // Security checks
    require(assets > 0, "Zero assets");
    require(receiver != address(0), "Zero address");
    
    // Transfer first (Checks-Effects-Interactions)
    IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);
    
    // Calculate and mint shares
    shares = previewDeposit(assets);
    _mint(receiver, shares);
}
```

#### 2. Owner-Only Operations
```solidity
// Critical functions
function unstakeLST(uint8 lstIndex, uint256 amount) external onlyOwner {
    // Owner can unstake for contract maintenance
}

function claim(uint8 lstIndex) external onlyOwner {
    // Owner claims unstaked KAIA
}
```

#### 3. Slippage Protection
```solidity
// All swaps use maxSlippage
uint256 minAmountOut = (expectedAmount * (10000 - maxSlippage)) / 10000;
require(actualAmount >= minAmountOut, "Slippage exceeded");
```

**Current Slippage**: 10% (testnet), consider 5-10% for mainnet.

#### 4. Withdrawal Fee
```solidity
// 0.3% fee (30 basis points)
uint256 fee = (assets * withdrawalFeeBasisPoints) / 10000;
uint256 netAssets = assets - fee;
```

### Input Validation

```solidity
// ✅ CORRECT - Validate all inputs
require(assets > 0, "Zero assets");
require(receiver != address(0), "Zero receiver");
require(lstIndex < 4, "Invalid LST index");
require(amount <= maxAvailable, "Insufficient balance");

// Validate address parameters
require(token != address(0), "Zero token");
require(handler != address(0), "Zero handler");
```

### Rate Provider Handling

```solidity
// stKAIA rate provider application
if (lstIndex == 3) { // stKAIA
    IRateProvider rateProvider = IRateProvider(stKaiaRateProvider);
    uint256 rate = rateProvider.getRate(); // e.g., 1.0589e18
    kaiaValue = (amount * rate) / 1e18;
} else {
    // Other LSTs use unwrap functions
    kaiaValue = IHandler(handler).getUnwrappedAmount(amount);
}
```

---

## Code Conventions

### Solidity Style

```solidity
// ✅ CORRECT - OpenZeppelin style
contract VaultCore is 
    Initializable,
    UUPSUpgradeable,
    AccessControlUpgradeable
{
    // State variables
    uint256 public totalAssets;
    
    // Events
    event Deposit(address indexed user, uint256 amount);
    
    // Modifiers
    modifier onlyOwner() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not owner");
        _;
    }
    
    // External functions first
    function deposit(uint256 amount) external returns (uint256) {
        // Implementation
    }
    
    // Internal functions
    function _calculateShares(uint256 assets) internal view returns (uint256) {
        // Implementation
    }
}
```

### JavaScript/Hardhat Style

```javascript
// ✅ CORRECT - Async/await pattern
async function deployContracts() {
  // Read deployment config
  const deployments = JSON.parse(
    fs.readFileSync(`deployments-${profile}-${network}.json`, 'utf8')
  );
  
  // Get contract factory
  const ShareVault = await ethers.getContractFactory("ShareVault");
  
  // Deploy with error handling
  try {
    const shareVault = await upgrades.deployProxy(
      ShareVault,
      [vaultCore, wkaia, name, symbol],
      { initializer: 'initialize' }
    );
    await shareVault.deployed();
    
    console.log(`ShareVault deployed: ${shareVault.address}`);
    return shareVault;
  } catch (error) {
    console.error("Deployment failed:", error.message);
    throw error;
  }
}
```

### Environment Variables

```bash
# Required
PRIVATE_KEY=your_private_key_without_0x

# Optional
PROFILE=stable              # or balanced
CLEAN_CACHE=true            # Force cache clean before upgrade
SEND_AMOUNT=1.0            # Custom reward amount
LP_AMOUNT=1000             # Custom LP query amount
```

**Security**:
- ✅ Use `.env` file (never commit)
- ✅ Validate required vars at script start
- ❌ Never hardcode private keys

```javascript
// ✅ CORRECT
require('dotenv').config();
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error("PRIVATE_KEY not set in .env");
}
```

---

## Testing Strategy

### Unit Tests

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/ShareVault.test.js

# With gas reporting
REPORT_GAS=true npx hardhat test
```

### Integration Tests

```bash
# STABLE profile integration test
npm run test:stable:testnet

# BALANCED profile integration test  
npm run test:balanced:testnet

# Custom test
npx hardhat run scripts/tests/testIntegratedStable.js --network kairos
```

**Integration Test Coverage**:
- ✅ Deposit flows (WKAIA and native KAIA)
- ✅ All 4 LST conversions
- ✅ LP pool deposits (BALANCED mode)
- ✅ Withdrawal with GIVEN_OUT swaps
- ✅ Fee calculations
- ✅ Share price accuracy

### Test Checklist

Before deploying to mainnet:
- [ ] All unit tests passing
- [ ] Integration tests for both profiles passing
- [ ] LP valuation queries working
- [ ] Upgrade scripts tested on testnet
- [ ] Gas optimization reviewed
- [ ] Security audit completed
- [ ] Rate provider accuracy verified (stKAIA)

---

## Troubleshooting

### Common Issues

#### Issue 1: Deposit Fails with "Insufficient allowance"
**Cause**: Using `deposit()` without WKAIA approval
**Solution**: Either approve WKAIA first, or use `depositKAIA()` for native KAIA
```javascript
// Option 1: Approve first
await wkaia.approve(shareVault, amount);
await shareVault.deposit(amount, user);

// Option 2: Use depositKAIA
await shareVault.depositKAIA(user, {value: amount});
```

#### Issue 2: Upgrade Fails with "Implementation reused"
**Cause**: Hardhat upgrades plugin cache issue
**Solution**: Use enhanced upgrade scripts with cache cleaning
```bash
CLEAN_CACHE=true PROFILE=stable npx hardhat run scripts/upgradeAllFixed.js --network kairos
```

#### Issue 3: VaultCore Upgrade Fails with "Library not linked"
**Cause**: LPCalculations library needs to be deployed and linked
**Solution**: Use `upgradeVaultCoreFixed.js` which handles library linking automatically
```bash
PROFILE=stable npx hardhat run scripts/upgradeVaultCoreFixed.js --network kairos
```

#### Issue 4: Wrong Share Price After Rewards
**Cause**: stKAIA rate provider not applied
**Solution**: Ensure VaultCore's `getTotalAssets()` applies rate provider for index 3 (stKAIA)

#### Issue 5: LP Exit Returns Unexpected Values
**Cause**: Mainnet 6-token pool includes sKLAY with different rate provider
**Solution**: Check `docs/LP_CALCULATION_LOGIC.md` for correct token handling

---

## Reference Documentation

### In This Repository

- **[CLAUDE.md](../CLAUDE.md)** - Detailed project instructions
- **[CLAUDE_HISTORY.md](../CLAUDE_HISTORY.md)** - Historical issues and resolutions
- **[README.md](../README.md)** - Project overview and setup
- **[DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md)** - Deployment procedures
- **[UPGRADE_GUIDE.md](../UPGRADE_GUIDE.md)** - Upgrade procedures
- **[docs/LP_CALCULATION_LOGIC.md](../docs/LP_CALCULATION_LOGIC.md)** - LP valuation details
- **[AUDIT_README.md](../AUDIT_README.md)** - Security audit information
- **[STORAGE_LAYOUT.md](../STORAGE_LAYOUT.md)** - Contract storage layout

### External Resources

- **OpenZeppelin Contracts**: https://docs.openzeppelin.com/contracts/
- **ERC-4626 Tokenized Vault Standard**: https://eips.ethereum.org/EIPS/eip-4626
- **Balancer V2 Documentation**: https://docs.balancer.fi/
- **Hardhat Documentation**: https://hardhat.org/docs
- **KAIA Network**: https://docs.kaia.io/

---

## Quick Commands Reference

```bash
# Development
npx hardhat compile                 # Compile contracts
npx hardhat test                    # Run tests
npx hardhat node                    # Start local node

# Deployment
npm run deploy:testnet:stable       # Deploy STABLE to testnet
npm run deploy:testnet:balanced     # Deploy BALANCED to testnet
npm run deploy:mainnet:stable       # Deploy STABLE to mainnet
npm run deploy:mainnet:balanced     # Deploy BALANCED to mainnet

# Upgrades (Enhanced)
npm run upgrade:testnet:stable:fixed    # Upgrade STABLE (testnet)
npm run upgrade:testnet:balanced:fixed  # Upgrade BALANCED (testnet)
npm run upgrade:mainnet:stable:fixed    # Upgrade STABLE (mainnet)
npm run upgrade:mainnet:balanced:fixed  # Upgrade BALANCED (mainnet)

# Testing
npm run test:stable:testnet         # Test STABLE integration
npm run test:balanced:testnet       # Test BALANCED integration

# Utilities
npm run send:rewards:testnet        # Send rewards to VaultCores
npm run query:lp:exit               # Query LP exit values
npm run query:bpt:swap              # Query BPT swap rates

# Cache Management
rm -rf .openzeppelin cache artifacts/build-info
npx hardhat compile
```

---

## Important Notes

### For AI Code Assistants

1. **Architecture**: Always work with V2 separated architecture (ShareVault + VaultCore)
2. **SwapContract**: NEVER modify - it's finalized and tested
3. **Deposit Functions**: Understand the difference between `deposit()` and `depositKAIA()`
4. **Addresses**: Always read from `deployments-{profile}-{network}.json` files
5. **Upgrade Scripts**: Use `*Fixed.js` scripts to avoid cache and library issues
6. **LST Handling**: stKAIA (index 3) requires rate provider application
7. **Testing**: Create new tests in `scripts/temp/` first
8. **Security**: Validate all inputs, use slippage protection, apply withdrawal fees

### Critical Reminders

- 🔐 ERC-4626 standard compliance for all vault operations
- 🔐 Owner-only operations for contract maintenance (unstake/claim)
- 🔐 Slippage protection on all swaps (current: 10%)
- 🔐 Withdrawal fees applied (0.3%)
- 🔐 Rate provider for stKAIA (1.0589x)
- 🔐 Never modify SwapContract.sol
- 🔐 Use deployment files for addresses
- 🔐 Test on Kairos before mainnet deployment

---

**Project**: KommuneFi Contracts  
**Profile**: STABLE | BALANCED  
**Networks**: KAIA (8217) | Kairos (1001)  
**Last Updated**: 2025-09-03  
**Maintained By**: Kommune DAO  
**Status**: Production-ready (audit-ready)
