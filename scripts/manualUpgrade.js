const { ethers } = require("hardhat");

/**
 * Manual upgrade: deploy implementations and call upgradeTo() directly.
 * Bypasses OZ Upgrades plugin entirely.
 *
 * Usage:
 *   npx hardhat run scripts/manualUpgrade.js --network kairos
 */
async function main() {
    const d = require("../deployments/testnet/audit-kairos.json");
    const [deployer] = await ethers.getSigners();
    const provider = ethers.provider;

    const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

    console.log("=== Manual Proxy Upgrade ===");
    console.log("Deployer:", deployer.address);
    console.log("Balance:", ethers.formatEther(await provider.getBalance(deployer.address)), "KAIA");

    // Current implementations
    const vcImplBefore = "0x" + (await provider.getStorage(d.vaultCore, implSlot)).slice(26);
    const svImplBefore = "0x" + (await provider.getStorage(d.shareVault, implSlot)).slice(26);
    console.log("\nCurrent VaultCore impl:", vcImplBefore);
    console.log("Current ShareVault impl:", svImplBefore);

    // ── Step 1: Deploy new VaultCore implementation ──
    console.log("\n[1/4] Deploying VaultCore implementation...");
    const VaultCore = await ethers.getContractFactory("VaultCore");
    const vcImplContract = await VaultCore.deploy();
    await vcImplContract.waitForDeployment();
    const vcImplAddr = await vcImplContract.getAddress();
    console.log("   New VaultCore impl:", vcImplAddr);

    // Verify new impl has the new selectors
    const vcCode = await provider.getCode(vcImplAddr);
    const vcSelCheck = vcCode.toLowerCase().includes(ethers.id("setInstantWithdrawFee(uint256)").slice(2, 10));
    console.log("   Has setInstantWithdrawFee:", vcSelCheck);
    if (!vcSelCheck) {
        console.error("   ERROR: New implementation missing setInstantWithdrawFee!");
        process.exit(1);
    }

    // ── Step 2: Deploy new ShareVault implementation ──
    console.log("\n[2/4] Deploying ShareVault implementation...");
    const ShareVault = await ethers.getContractFactory("ShareVault");
    const svImplContract = await ShareVault.deploy();
    await svImplContract.waitForDeployment();
    const svImplAddr = await svImplContract.getAddress();
    console.log("   New ShareVault impl:", svImplAddr);

    const svCode = await provider.getCode(svImplAddr);
    const svSelCheck = svCode.toLowerCase().includes(ethers.id("setTokenAddresses(address,address)").slice(2, 10));
    console.log("   Has setTokenAddresses:", svSelCheck);
    if (!svSelCheck) {
        console.error("   ERROR: New implementation missing setTokenAddresses!");
        process.exit(1);
    }

    // ── Step 3: Upgrade VaultCore proxy ──
    console.log("\n[3/4] Upgrading VaultCore proxy...");
    const upgradeAbi = ["function upgradeToAndCall(address newImplementation, bytes memory data) external"];
    const vcProxy = new ethers.Contract(d.vaultCore, upgradeAbi, deployer);
    try {
        const tx = await vcProxy.upgradeToAndCall(vcImplAddr, "0x", { gasLimit: 500000 });
        console.log("   TX:", tx.hash);
        const receipt = await tx.wait();
        console.log("   Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
    } catch (e) {
        console.error("   VaultCore upgrade failed:", e.message);
    }

    // Verify
    const vcImplAfter = "0x" + (await provider.getStorage(d.vaultCore, implSlot)).slice(26);
    console.log("   VaultCore impl after:", vcImplAfter);
    console.log("   Changed:", vcImplBefore !== vcImplAfter);

    // ── Step 4: Upgrade ShareVault proxy ──
    console.log("\n[4/4] Upgrading ShareVault proxy...");
    const svProxy = new ethers.Contract(d.shareVault, upgradeAbi, deployer);
    try {
        const tx = await svProxy.upgradeToAndCall(svImplAddr, "0x", { gasLimit: 500000 });
        console.log("   TX:", tx.hash);
        const receipt = await tx.wait();
        console.log("   Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
    } catch (e) {
        console.error("   ShareVault upgrade failed:", e.message);
    }

    // Verify
    const svImplAfter = "0x" + (await provider.getStorage(d.shareVault, implSlot)).slice(26);
    console.log("   ShareVault impl after:", svImplAfter);
    console.log("   Changed:", svImplBefore !== svImplAfter);

    // ── Final verification ──
    console.log("\n=== Verification ===");

    // Test new VaultCore function
    console.log("\nTesting VaultCore.setInstantWithdrawFee(10)...");
    const vcTestAbi = ["function setInstantWithdrawFee(uint256) external", "function instantWithdrawFeeBps() view returns (uint256)"];
    const vc = new ethers.Contract(d.vaultCore, vcTestAbi, deployer);
    try {
        const tx = await vc.setInstantWithdrawFee(10, { gasLimit: 200000 });
        await tx.wait();
        console.log("   SUCCESS");
        console.log("   instantWithdrawFeeBps:", (await vc.instantWithdrawFeeBps()).toString());
    } catch (e) {
        console.log("   FAILED:", e.message);
    }

    // Test new ShareVault function
    console.log("\nTesting ShareVault.setTokenAddresses(...)...");
    let wkaiaAddr;
    try {
        const wkaiaAbi = ["function wkaia() view returns (address)"];
        const vcRead = new ethers.Contract(d.vaultCore, wkaiaAbi, provider);
        wkaiaAddr = await vcRead.wkaia();
    } catch {
        wkaiaAddr = "0x043c471bEe060e00A56CcD02c0Ca286808a5A436";
    }
    const kokaiaAddr = "0xb15782EFbC2034E366670599F3997f94c7333FF9";

    const svTestAbi = [
        "function setTokenAddresses(address,address) external",
        "function kokaiaToken() view returns (address)",
        "function wkaiaToken() view returns (address)"
    ];
    const sv = new ethers.Contract(d.shareVault, svTestAbi, deployer);
    try {
        const tx = await sv.setTokenAddresses(kokaiaAddr, wkaiaAddr, { gasLimit: 200000 });
        await tx.wait();
        console.log("   SUCCESS");
        console.log("   kokaiaToken:", await sv.kokaiaToken());
        console.log("   wkaiaToken:", await sv.wkaiaToken());
    } catch (e) {
        console.log("   FAILED:", e.message);
    }

    console.log("\nBalance after:", ethers.formatEther(await provider.getBalance(deployer.address)), "KAIA");
    console.log("=== Done ===");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
