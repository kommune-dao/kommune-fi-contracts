const { ethers } = require("hardhat");

/**
 * Mainnet upgrade: deploy implementations once, upgrade all 3 profiles.
 * Uses manual upgradeToAndCall() (bypasses OZ Upgrades plugin).
 *
 * Usage:
 *   npx hardhat run scripts/upgradeMainnet.js --network kaia
 */
async function main() {
    const network = hre.network.name;
    if (network !== "kaia") {
        console.error("This script is for mainnet only. Use --network kaia");
        process.exit(1);
    }

    const [deployer] = await ethers.getSigners();
    const provider = ethers.provider;
    const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

    console.log("=== Mainnet Instant Withdraw Upgrade ===");
    console.log("Deployer:", deployer.address);
    console.log("Balance:", ethers.formatEther(await provider.getBalance(deployer.address)), "KAIA\n");

    // Mainnet token addresses
    const WKAIA = "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432";
    const KOKAIA = "0xA1338309658D3Da331C747518d0bb414031F22fd";

    const profiles = [
        { name: "stable", file: "../deployments/mainnet/audit-kaia-stable.json" },
        { name: "balanced", file: "../deployments/mainnet/audit-kaia-balanced.json" },
        { name: "aggressive", file: "../deployments/mainnet/audit-kaia-aggressive.json" },
    ];

    // ── Step 1: Deploy implementations ONCE ──
    console.log("[1/3] Deploying new implementations...\n");

    console.log("  Deploying VaultCore implementation...");
    const VaultCore = await ethers.getContractFactory("VaultCore");
    const vcImpl = await VaultCore.deploy();
    await vcImpl.waitForDeployment();
    const vcImplAddr = await vcImpl.getAddress();
    console.log("  VaultCore impl:", vcImplAddr);

    // Verify new selectors exist
    const vcCode = await provider.getCode(vcImplAddr);
    const vcHasNew = vcCode.toLowerCase().includes(ethers.id("setInstantWithdrawFee(uint256)").slice(2, 10));
    console.log("  Has setInstantWithdrawFee:", vcHasNew);
    if (!vcHasNew) { console.error("  ABORT: missing new functions!"); process.exit(1); }

    console.log("\n  Deploying ShareVault implementation...");
    const ShareVault = await ethers.getContractFactory("ShareVault");
    const svImpl = await ShareVault.deploy();
    await svImpl.waitForDeployment();
    const svImplAddr = await svImpl.getAddress();
    console.log("  ShareVault impl:", svImplAddr);

    const svCode = await provider.getCode(svImplAddr);
    const svHasNew = svCode.toLowerCase().includes(ethers.id("setTokenAddresses(address,address)").slice(2, 10));
    console.log("  Has setTokenAddresses:", svHasNew);
    if (!svHasNew) { console.error("  ABORT: missing new functions!"); process.exit(1); }

    // ── Step 2: Upgrade all profiles ──
    console.log("\n[2/3] Upgrading all profiles...\n");

    const upgradeAbi = ["function upgradeToAndCall(address newImplementation, bytes memory data) external"];
    const ownerAbi = ["function owner() view returns (address)"];

    for (const profile of profiles) {
        const d = require(profile.file);
        console.log(`--- ${profile.name.toUpperCase()} ---`);
        console.log("  VaultCore:", d.vaultCore);
        console.log("  ShareVault:", d.shareVault);

        // Verify ownership
        const vcOwner = await new ethers.Contract(d.vaultCore, ownerAbi, provider).owner();
        if (vcOwner.toLowerCase() !== deployer.address.toLowerCase()) {
            console.error(`  SKIP: VaultCore owner ${vcOwner} != deployer`);
            continue;
        }

        // Current impls
        const vcImplBefore = "0x" + (await provider.getStorage(d.vaultCore, implSlot)).slice(26);
        const svImplBefore = "0x" + (await provider.getStorage(d.shareVault, implSlot)).slice(26);
        console.log("  Current VC impl:", vcImplBefore);
        console.log("  Current SV impl:", svImplBefore);

        // Upgrade VaultCore
        console.log("  Upgrading VaultCore...");
        try {
            const vcProxy = new ethers.Contract(d.vaultCore, upgradeAbi, deployer);
            const tx = await vcProxy.upgradeToAndCall(vcImplAddr, "0x", { gasLimit: 500000 });
            const receipt = await tx.wait();
            const vcImplAfter = "0x" + (await provider.getStorage(d.vaultCore, implSlot)).slice(26);
            console.log("  VaultCore:", receipt.status === 1 ? "SUCCESS" : "FAILED", "→", vcImplAfter);
        } catch (e) {
            console.error("  VaultCore upgrade FAILED:", e.message.slice(0, 100));
        }

        // Upgrade ShareVault
        console.log("  Upgrading ShareVault...");
        try {
            const svProxy = new ethers.Contract(d.shareVault, upgradeAbi, deployer);
            const tx = await svProxy.upgradeToAndCall(svImplAddr, "0x", { gasLimit: 500000 });
            const receipt = await tx.wait();
            const svImplAfter = "0x" + (await provider.getStorage(d.shareVault, implSlot)).slice(26);
            console.log("  ShareVault:", receipt.status === 1 ? "SUCCESS" : "FAILED", "→", svImplAfter);
        } catch (e) {
            console.error("  ShareVault upgrade FAILED:", e.message.slice(0, 100));
        }

        console.log();
    }

    // ── Step 3: Configure all profiles ──
    console.log("[3/3] Configuring all profiles...\n");

    const configAbi = [
        "function setInstantWithdrawFee(uint256) external",
        "function instantWithdrawFeeBps() view returns (uint256)",
        "function setTokenAddresses(address,address) external",
        "function kokaiaToken() view returns (address)",
        "function wkaiaToken() view returns (address)",
    ];

    for (const profile of profiles) {
        const d = require(profile.file);
        console.log(`--- ${profile.name.toUpperCase()} ---`);

        // VaultCore: set instantWithdrawFeeBps
        const vc = new ethers.Contract(d.vaultCore, configAbi, deployer);
        try {
            const currentFee = await vc.instantWithdrawFeeBps();
            if (currentFee === 0n) {
                const tx = await vc.setInstantWithdrawFee(10, { gasLimit: 200000 });
                await tx.wait();
                console.log("  instantWithdrawFeeBps: set to 10");
            } else {
                console.log("  instantWithdrawFeeBps: already", currentFee.toString());
            }
        } catch {
            console.log("  Setting instantWithdrawFeeBps to 10...");
            try {
                const tx = await vc.setInstantWithdrawFee(10, { gasLimit: 200000 });
                await tx.wait();
                console.log("  instantWithdrawFeeBps: set to 10");
            } catch (e2) {
                console.error("  FAILED:", e2.message.slice(0, 80));
            }
        }

        // ShareVault: set token addresses
        const sv = new ethers.Contract(d.shareVault, configAbi, deployer);
        let currentKokaia;
        try {
            currentKokaia = await sv.kokaiaToken();
        } catch {
            currentKokaia = ethers.ZeroAddress;
        }

        if (currentKokaia === ethers.ZeroAddress || currentKokaia === "0x0000000000000000000000000000000000000000") {
            try {
                const tx = await sv.setTokenAddresses(KOKAIA, WKAIA, { gasLimit: 200000 });
                await tx.wait();
                console.log("  Token addresses: set (KoKAIA:", KOKAIA, ", WKAIA:", WKAIA, ")");
            } catch (e) {
                console.error("  setTokenAddresses FAILED:", e.message.slice(0, 80));
            }
        } else {
            console.log("  Token addresses: already set (KoKAIA:", currentKokaia, ")");
        }

        // Verify
        try {
            console.log("  Verify kokaiaToken:", await sv.kokaiaToken());
            console.log("  Verify wkaiaToken:", await sv.wkaiaToken());
            console.log("  Verify feeBps:", (await vc.instantWithdrawFeeBps()).toString());
        } catch (e) {
            console.log("  Verify error:", e.message.slice(0, 60));
        }

        console.log();
    }

    console.log("Balance after:", ethers.formatEther(await provider.getBalance(deployer.address)), "KAIA");
    console.log("=== Mainnet Upgrade Complete ===");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
