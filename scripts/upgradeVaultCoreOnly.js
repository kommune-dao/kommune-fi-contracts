const { ethers } = require("hardhat");

/**
 * Upgrade VaultCore implementation only (LP valuation fix).
 * Deploys once, upgrades all 3 profiles.
 *
 * Usage:
 *   npx hardhat run scripts/upgradeVaultCoreOnly.js --network kaia
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const provider = ethers.provider;
    const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

    console.log("=== VaultCore LP Fix Upgrade ===");
    console.log("Deployer:", deployer.address);
    console.log("Balance:", ethers.formatEther(await provider.getBalance(deployer.address)), "KAIA\n");

    // Deploy new VaultCore implementation
    console.log("[1/2] Deploying VaultCore implementation...");
    const VaultCore = await ethers.getContractFactory("VaultCore");
    const vcImpl = await VaultCore.deploy();
    await vcImpl.waitForDeployment();
    const vcImplAddr = await vcImpl.getAddress();
    console.log("  New impl:", vcImplAddr);

    // Verify: check for balanceOf selector (used in new _getLPValueRaw)
    const vcCode = await provider.getCode(vcImplAddr);
    const hasBalanceOf = vcCode.toLowerCase().includes(
        ethers.id("balanceOf(address)").slice(2, 10)
    );
    console.log("  Has balanceOf(address) in bytecode:", hasBalanceOf);

    const profiles = [
        { name: "stable", vc: "0xfb2e4E39629b0DaC9c2fdf268191de46E214eC90" },
        { name: "balanced", vc: "0x65Aba372d675d117a6aEc9736C7F703De7f08B51" },
        { name: "aggressive", vc: "0xc2AC68C0d96A34d9DAC80CF53BFFF003547ea493" },
    ];

    // Upgrade all profiles
    console.log("\n[2/2] Upgrading VaultCore proxies...\n");
    const upgradeAbi = ["function upgradeToAndCall(address,bytes) external"];

    for (const profile of profiles) {
        const vcImplBefore = "0x" + (await provider.getStorage(profile.vc, implSlot)).slice(26);

        const proxy = new ethers.Contract(profile.vc, upgradeAbi, deployer);
        try {
            const tx = await proxy.upgradeToAndCall(vcImplAddr, "0x", { gasLimit: 500000 });
            const receipt = await tx.wait();
            const vcImplAfter = "0x" + (await provider.getStorage(profile.vc, implSlot)).slice(26);
            console.log(`  ${profile.name}: ${receipt.status === 1 ? "SUCCESS" : "FAILED"} → ${vcImplAfter}`);
        } catch (e) {
            console.error(`  ${profile.name}: FAILED - ${e.message.slice(0, 80)}`);
        }
    }

    // Verify balanced vault TVL
    console.log("\n=== TVL Verification ===\n");
    const tvlAbi = ["function getTotalAssets() view returns (uint256)"];
    for (const profile of profiles) {
        const vc = new ethers.Contract(profile.vc, tvlAbi, provider);
        try {
            const total = await vc.getTotalAssets();
            console.log(`  ${profile.name}: ${ethers.formatEther(total)} KAIA`);
        } catch (e) {
            console.log(`  ${profile.name}: ERROR - ${e.message.slice(0, 60)}`);
        }
    }

    console.log("\nBalance after:", ethers.formatEther(await provider.getBalance(deployer.address)), "KAIA");
    console.log("=== Done ===");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
