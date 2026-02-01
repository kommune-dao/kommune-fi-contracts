const { ethers, upgrades } = require("hardhat");

async function main() {
    const profile = process.env.PROFILE || "stable";
    const network = hre.network.name; // "kaia" or "kairos"

    let deploymentPath;
    if (network === "kaia") {
        deploymentPath = `../deployments/mainnet/audit-kaia-${profile}.json`;
    } else {
        deploymentPath = `../deployments/testnet/audit-kairos.json`;
    }

    console.log(`=== VaultCore Upgrade (${profile}) ===`);
    console.log("   Deployment:", deploymentPath);

    const d = require(deploymentPath);
    console.log("   Proxy:", d.vaultCore);

    const VaultCore = await ethers.getContractFactory("VaultCore");

    console.log("\n[1/2] Upgrading VaultCore proxy...");
    const upgraded = await upgrades.upgradeProxy(d.vaultCore, VaultCore, {
        unsafeAllow: ["delegatecall"]
    });
    await upgraded.waitForDeployment();
    console.log("   VaultCore upgraded successfully");

    // Verify state is preserved and new functions work
    console.log("\n[2/2] Verifying state...");
    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);
    console.log("   shareVault:", await vc.shareVault());
    console.log("   claimManager:", await vc.claimManager());
    console.log("   isMainnet:", await vc.isMainnet());
    console.log("   investRatio:", (await vc.investRatio()).toString());
    console.log("   balancedRatio:", (await vc.balancedRatio()).toString());

    // Verify getTotalAssets (should now include LP value)
    const totalAssets = await vc.getTotalAssets();
    console.log("   getTotalAssets:", ethers.formatEther(totalAssets), "KAIA");

    console.log(`\n=== ${profile} VaultCore Upgrade Complete ===`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
