const { ethers } = require("hardhat");
const deployments = require("../deployments/testnet/audit-kairos.json");

async function main() {
    console.log("🔼 PROXY UPGRADE TEST (Manual UUPS - Audit Validation)");
    console.log("════════════════════════════════════════════════\n");

    const [deployer] = await ethers.getSigners();
    console.log("  Deployer:", deployer.address);
    console.log("  VaultCore (Proxy):", deployments.vaultCore);
    console.log("  ShareVault (Proxy):", deployments.shareVault);

    // 1. Upgrade VaultCore
    console.log("\n1️⃣ Upgrading VaultCore to V2...");

    // Attach to existing proxy
    const vaultCoreProxy = await ethers.getContractAt("VaultCore", deployments.vaultCore);

    // Deploy V2 Implementation
    const VaultCoreV2 = await ethers.getContractFactory("VaultCoreV2");
    const v2Impl = await VaultCoreV2.deploy();
    await v2Impl.waitForDeployment();
    const v2ImplAddr = await v2Impl.getAddress();
    console.log("   ✅ V2 Implementation deployed at:", v2ImplAddr);

    try {
        // Execute Upgrade
        const tx = await vaultCoreProxy.upgradeToAndCall(v2ImplAddr, "0x");
        await tx.wait();
        console.log("   ✅ VaultCore Upgraded (UUPS call success)");

        // Verify V2 Functionality
        const upgradedVault = await ethers.getContractAt("VaultCoreV2", deployments.vaultCore);
        const version = await upgradedVault.version();
        console.log("   🔍 V2 Version Check:", version);

        if (version === "v2") {
            console.log("   ✅ VaultCore Upgrade Verified");
        } else {
            console.log("   ❌ VaultCore Upgrade Failed: Version mismatch");
        }

    } catch (e) {
        console.log("   ❌ VaultCore Upgrade Failed:", e.message);
    }

    // 2. Upgrade ShareVault
    console.log("\n2️⃣ Upgrading ShareVault to V2...");
    const shareVaultProxy = await ethers.getContractAt("ShareVault", deployments.shareVault);

    const ShareVaultV2 = await ethers.getContractFactory("ShareVaultV2");
    const sv2Impl = await ShareVaultV2.deploy();
    await sv2Impl.waitForDeployment();
    const sv2ImplAddr = await sv2Impl.getAddress();
    console.log("   ✅ ShareVault V2 Implementation deployed at:", sv2ImplAddr);

    try {
        const tx = await shareVaultProxy.upgradeToAndCall(sv2ImplAddr, "0x");
        await tx.wait();
        console.log("   ✅ ShareVault Upgraded (UUPS call success)");

        // Verify V2 Functionality
        const upgradedShare = await ethers.getContractAt("ShareVaultV2", deployments.shareVault);
        const version = await upgradedShare.versionV2();
        console.log("   🔍 V2 Version Check:", version);

        if (version === "v2") {
            console.log("   ✅ ShareVault Upgrade Verified");
        } else {
            console.log("   ❌ ShareVault Upgrade Failed: Version mismatch");
        }

    } catch (e) {
        console.log("   ❌ ShareVault Upgrade Failed:", e.message);
    }

    console.log("\n✅ UPGRADE TEST COMPLETE");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
