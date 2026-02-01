const { ethers, upgrades } = require("hardhat");

/**
 * Upgrade VaultCore + ShareVault for Instant Withdraw token output modes.
 *
 * Usage:
 *   npx hardhat run scripts/upgradeInstantWithdraw.js --network kairos
 *   PROFILE=stable npx hardhat run scripts/upgradeInstantWithdraw.js --network kaia
 */
async function main() {
    const profile = process.env.PROFILE || "stable";
    const network = hre.network.name;

    let deploymentPath;
    if (network === "kaia") {
        deploymentPath = `../deployments/mainnet/audit-kaia-${profile}.json`;
    } else {
        deploymentPath = `../deployments/testnet/audit-kairos.json`;
    }

    console.log(`=== Instant Withdraw Upgrade (${profile}) ===`);
    console.log("   Network:", network);
    console.log("   Deployment:", deploymentPath);

    const d = require(deploymentPath);
    console.log("   VaultCore proxy:", d.vaultCore);
    console.log("   ShareVault proxy:", d.shareVault);

    // ── Step 1: Upgrade VaultCore ──
    console.log("\n[1/4] Upgrading VaultCore...");
    const VaultCore = await ethers.getContractFactory("VaultCore");

    let vcAlreadyUpgraded = false;
    try {
        const upgradedVC = await upgrades.upgradeProxy(d.vaultCore, VaultCore, {
            unsafeAllow: ["delegatecall"]
        });
        await upgradedVC.waitForDeployment();
        console.log("   VaultCore upgraded");
    } catch (e) {
        if (e.message.includes("already been upgraded")) {
            console.log("   VaultCore already at latest version");
            vcAlreadyUpgraded = true;
        } else {
            throw e;
        }
    }

    // Verify state (with error handling for Kaia EVM quirks)
    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);
    console.log("   shareVault:", await vc.shareVault());
    try {
        console.log("   instantWithdrawFeeBps:", (await vc.instantWithdrawFeeBps()).toString());
    } catch { console.log("   instantWithdrawFeeBps: (not set or read error)"); }
    try {
        const totalAssets = await vc.getTotalAssets();
        console.log("   getTotalAssets:", ethers.formatEther(totalAssets));
    } catch { console.log("   getTotalAssets: (read error)"); }

    // ── Step 2: Upgrade ShareVault ──
    console.log("\n[2/4] Upgrading ShareVault...");
    const ShareVault = await ethers.getContractFactory("ShareVault");
    try {
        const upgradedSV = await upgrades.upgradeProxy(d.shareVault, ShareVault);
        await upgradedSV.waitForDeployment();
        console.log("   ShareVault upgraded");
    } catch (e) {
        if (e.message.includes("already been upgraded")) {
            console.log("   ShareVault already at latest version");
        } else {
            throw e;
        }
    }

    // Verify state
    const sv = await ethers.getContractAt("ShareVault", d.shareVault);
    console.log("   vaultCore:", await sv.vaultCore());
    try { console.log("   treasury:", await sv.treasury()); } catch {}
    try { console.log("   basisPointsFees:", (await sv.basisPointsFees()).toString()); } catch {}

    // ── Step 3: Set token addresses on ShareVault ──
    console.log("\n[3/4] Setting token addresses on ShareVault...");
    let wkaiaAddr, kokaiaAddr;
    try {
        wkaiaAddr = await vc.wkaia();
        const info = await vc.tokensInfo(0);
        kokaiaAddr = info.asset;
    } catch {
        // Fallback: use raw staticcall
        const wkaiaAbi = ['function wkaia() view returns (address)'];
        const vcRaw = new ethers.Contract(d.vaultCore, wkaiaAbi, ethers.provider);
        wkaiaAddr = await vcRaw.wkaia();
        // Hardcode testnet KoKAIA if tokensInfo fails
        kokaiaAddr = network === "kaia"
            ? "0xA1338309658D3Da331C747518d0bb414031F22fd"
            : "0xb15782EFbC2034E366670599F3997f94c7333FF9";
    }

    console.log("   WKAIA:", wkaiaAddr);
    console.log("   KoKAIA:", kokaiaAddr);

    let currentKokaia;
    try {
        currentKokaia = await sv.kokaiaToken();
    } catch {
        currentKokaia = ethers.ZeroAddress;
    }

    if (currentKokaia === ethers.ZeroAddress) {
        const tx = await sv.setTokenAddresses(kokaiaAddr, wkaiaAddr, { gasLimit: 200000 });
        await tx.wait();
        console.log("   Token addresses set");
    } else {
        console.log("   Already configured:", currentKokaia);
    }

    // ── Step 4: Verify new functions exist ──
    console.log("\n[4/4] Verifying new functions...");
    try { console.log("   kokaiaToken:", await sv.kokaiaToken()); } catch { console.log("   kokaiaToken: read error"); }
    try { console.log("   wkaiaToken:", await sv.wkaiaToken()); } catch { console.log("   wkaiaToken: read error"); }

    // Set instantWithdrawFeeBps if not set
    try {
        const feeBps = await vc.instantWithdrawFeeBps();
        if (feeBps === 0n) {
            console.log("\n   Setting instantWithdrawFeeBps to 10 (0.1%)...");
            const tx = await vc.setInstantWithdrawFee(10, { gasLimit: 200000 });
            await tx.wait();
            console.log("   Fee set");
        }
    } catch {
        console.log("\n   Setting instantWithdrawFeeBps to 10 (0.1%)...");
        try {
            const tx = await vc.setInstantWithdrawFee(10, { gasLimit: 200000 });
            await tx.wait();
            console.log("   Fee set");
        } catch (e2) { console.log("   Fee set failed:", e2.message); }
    }

    console.log(`\n=== Upgrade Complete (${network}/${profile}) ===`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
