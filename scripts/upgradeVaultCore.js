const { ethers, upgrades } = require("hardhat");

async function main() {
    const d = require("../deployments/mainnet/audit-kaia.json");
    
    console.log("🔄 Upgrading VaultCore...");
    console.log("   Proxy:", d.vaultCore);
    
    const VaultCore = await ethers.getContractFactory("VaultCore");
    
    const upgraded = await upgrades.upgradeProxy(d.vaultCore, VaultCore, {
        unsafeAllow: ["delegatecall"]
    });
    await upgraded.waitForDeployment();
    
    console.log("   ✅ VaultCore upgraded");
    
    // Verify state is preserved
    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);
    console.log("   shareVault:", await vc.shareVault());
    console.log("   claimManager:", await vc.claimManager());
    console.log("   isMainnet:", await vc.isMainnet());
    console.log("   investRatio:", (await vc.investRatio()).toString());
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
