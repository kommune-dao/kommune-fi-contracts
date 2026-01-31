const { ethers, upgrades } = require("hardhat");

async function main() {
    const profile = process.env.PROFILE || "aggressive";
    const d = require(`../deployments/mainnet/audit-kaia-${profile}.json`);

    console.log(`Upgrading VaultCore (${profile})...`);
    console.log("   Proxy:", d.vaultCore);

    const VaultCore = await ethers.getContractFactory("VaultCore");

    const upgraded = await upgrades.upgradeProxy(d.vaultCore, VaultCore, {
        unsafeAllow: ["delegatecall"]
    });
    await upgraded.waitForDeployment();

    console.log("   VaultCore upgraded");

    // Verify state preserved
    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);
    console.log("   shareVault:", await vc.shareVault());
    console.log("   claimManager:", await vc.claimManager());
    console.log("   isMainnet:", await vc.isMainnet());
    console.log("   investRatio:", (await vc.investRatio()).toString());
    console.log("   balancedRatio:", (await vc.balancedRatio()).toString());
    console.log("   aggressiveRatio:", (await vc.aggressiveRatio()).toString());
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
