const { ethers } = require("hardhat");

async function main() {
    const d = require("../deployments/mainnet/audit-kaia.json");
    const [signer] = await ethers.getSigners();
    
    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);
    
    // Check tokensInfo[0]
    // VaultCore doesn't expose tokensInfo directly, so let's check via getVaultAssets
    console.log("=== VaultCore State ===");
    console.log("shareVault:", await vc.shareVault());
    console.log("isMainnet:", await vc.isMainnet());
    console.log("investRatio:", (await vc.investRatio()).toString());
    
    // Try to call handleDepositKAIA directly (should fail with E1 since we're not ShareVault)
    console.log("\n=== Direct handleDepositKAIA test (expect E1 revert) ===");
    try {
        await vc.handleDepositKAIA.staticCall({ value: ethers.parseEther("0.1") });
    } catch (e) {
        console.log("Reverted as expected:", e.message.substring(0, 100));
    }
    
    // Test KoKAIA stake directly
    const KOKAIA = "0xA1338309658D3Da331C747518d0bb414031F22fd";
    const ACTIVE_NODE = "0x9fA8A1dE3295A286b5e51dDEd41D08c417dF45A8";
    
    console.log("\n=== KoKAIA Staking Test ===");
    console.log("KoKAIA:", KOKAIA);
    console.log("ActiveNode:", ACTIVE_NODE);
    
    // Check KoKAIA contract code
    const kokaiaCode = await ethers.provider.getCode(KOKAIA);
    console.log("KoKAIA has code:", kokaiaCode !== "0x");
    
    // Try staticcall to stake(address) with 0.1 KAIA
    const iface = new ethers.Interface(["function stake(address) payable"]);
    const calldata = iface.encodeFunctionData("stake", [ACTIVE_NODE]);
    console.log("Calldata:", calldata);
    
    try {
        const result = await ethers.provider.call({
            to: KOKAIA,
            data: calldata,
            value: ethers.parseEther("0.1"),
            from: signer.address,
        });
        console.log("stake() staticcall result:", result);
    } catch (e) {
        console.log("stake() staticcall REVERTED:", e.message.substring(0, 200));
    }
    
    // Also check what function selectors KoKAIA has
    // Try stake() without params
    const iface2 = new ethers.Interface(["function stake() payable"]);
    const calldata2 = iface2.encodeFunctionData("stake", []);
    console.log("\nTrying stake() without params...");
    try {
        const result = await ethers.provider.call({
            to: KOKAIA,
            data: calldata2,
            value: ethers.parseEther("0.1"),
            from: signer.address,
        });
        console.log("stake() result:", result);
    } catch (e) {
        console.log("stake() REVERTED:", e.message.substring(0, 200));
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
