const { ethers } = require("hardhat");

/**
 * Standalone script to set token addresses on ShareVault
 * and instantWithdrawFeeBps on VaultCore after upgrade.
 *
 * Uses inline ABIs to avoid Kaia EVM proxy ABI resolution issues.
 *
 * Usage:
 *   npx hardhat run scripts/configureTokens.js --network kairos
 */
async function main() {
    const network = hre.network.name;
    let deploymentPath;
    if (network === "kaia") {
        const profile = process.env.PROFILE || "stable";
        deploymentPath = `../deployments/mainnet/audit-kaia-${profile}.json`;
    } else {
        deploymentPath = `../deployments/testnet/audit-kairos.json`;
    }

    const d = require(deploymentPath);
    const [deployer] = await ethers.getSigners();

    console.log(`=== Configure Tokens (${network}) ===`);
    console.log("   Deployer:", deployer.address);
    console.log("   VaultCore:", d.vaultCore);
    console.log("   ShareVault:", d.shareVault);

    // ── Read token addresses from VaultCore ──
    const vcAbi = [
        "function wkaia() view returns (address)",
        "function tokensInfo(uint256) view returns (address asset, address strategy, uint256 balance)",
        "function instantWithdrawFeeBps() view returns (uint256)",
        "function setInstantWithdrawFee(uint256 _feeBps) external",
        "function owner() view returns (address)"
    ];
    const vc = new ethers.Contract(d.vaultCore, vcAbi, deployer);

    let wkaiaAddr, kokaiaAddr;
    try {
        wkaiaAddr = await vc.wkaia();
    } catch {
        console.log("   wkaia() read failed, using hardcoded address");
        wkaiaAddr = network === "kaia"
            ? "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432"
            : "0x043c471bEe060e00A56CcD02c0Ca286808a5A436";
    }

    try {
        const info = await vc.tokensInfo(0);
        kokaiaAddr = info.asset;
    } catch {
        console.log("   tokensInfo() read failed, using hardcoded address");
        kokaiaAddr = network === "kaia"
            ? "0xA1338309658D3Da331C747518d0bb414031F22fd"
            : "0xb15782EFbC2034E366670599F3997f94c7333FF9";
    }

    console.log("   WKAIA:", wkaiaAddr);
    console.log("   KoKAIA:", kokaiaAddr);

    // ── Step 1: setTokenAddresses on ShareVault ──
    console.log("\n[1/2] Setting token addresses on ShareVault...");
    const svAbi = [
        "function kokaiaToken() view returns (address)",
        "function wkaiaToken() view returns (address)",
        "function setTokenAddresses(address _kokaia, address _wkaia) external",
        "function owner() view returns (address)"
    ];
    const sv = new ethers.Contract(d.shareVault, svAbi, deployer);

    // Verify owner
    try {
        const svOwner = await sv.owner();
        console.log("   ShareVault owner:", svOwner);
        if (svOwner.toLowerCase() !== deployer.address.toLowerCase()) {
            console.error("   ERROR: deployer is not the owner!");
            process.exit(1);
        }
    } catch (e) {
        console.log("   Warning: could not read owner():", e.message);
    }

    let currentKokaia;
    try {
        currentKokaia = await sv.kokaiaToken();
        console.log("   Current kokaiaToken:", currentKokaia);
    } catch {
        currentKokaia = ethers.ZeroAddress;
        console.log("   kokaiaToken read failed, assuming not set");
    }

    if (currentKokaia === ethers.ZeroAddress || currentKokaia === "0x0000000000000000000000000000000000000000") {
        // Manually encode to debug
        const iface = new ethers.Interface(svAbi);
        const calldata = iface.encodeFunctionData("setTokenAddresses", [kokaiaAddr, wkaiaAddr]);
        console.log("   Encoded calldata:", calldata);

        try {
            const tx = await deployer.sendTransaction({
                to: d.shareVault,
                data: calldata,
                gasLimit: 200000
            });
            console.log("   TX hash:", tx.hash);
            const receipt = await tx.wait();
            console.log("   TX status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
        } catch (e) {
            console.error("   setTokenAddresses failed:", e.message);
            // Try with higher gas
            console.log("   Retrying with higher gas...");
            try {
                const tx = await deployer.sendTransaction({
                    to: d.shareVault,
                    data: calldata,
                    gasLimit: 500000
                });
                const receipt = await tx.wait();
                console.log("   Retry TX status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
            } catch (e2) {
                console.error("   Retry also failed:", e2.message);
            }
        }
    } else {
        console.log("   Already configured, skipping");
    }

    // Verify
    try {
        console.log("   Verify kokaiaToken:", await sv.kokaiaToken());
        console.log("   Verify wkaiaToken:", await sv.wkaiaToken());
    } catch (e) {
        console.log("   Verification read error:", e.message);
    }

    // ── Step 2: Set instantWithdrawFeeBps on VaultCore ──
    console.log("\n[2/2] Setting instantWithdrawFeeBps on VaultCore...");
    try {
        const vcOwner = await vc.owner();
        console.log("   VaultCore owner:", vcOwner);
    } catch (e) {
        console.log("   Warning: could not read VaultCore owner():", e.message);
    }

    let currentFee;
    try {
        currentFee = await vc.instantWithdrawFeeBps();
        console.log("   Current instantWithdrawFeeBps:", currentFee.toString());
    } catch {
        currentFee = 0n;
        console.log("   instantWithdrawFeeBps read failed, assuming 0");
    }

    if (currentFee === 0n || currentFee === 0) {
        const vcIface = new ethers.Interface(vcAbi);
        const calldata = vcIface.encodeFunctionData("setInstantWithdrawFee", [10]);
        console.log("   Encoded calldata:", calldata);

        try {
            const tx = await deployer.sendTransaction({
                to: d.vaultCore,
                data: calldata,
                gasLimit: 200000
            });
            console.log("   TX hash:", tx.hash);
            const receipt = await tx.wait();
            console.log("   TX status:", receipt.status === 1 ? "SUCCESS" : "FAILED");
        } catch (e) {
            console.error("   setInstantWithdrawFee failed:", e.message);
        }
    } else {
        console.log("   Fee already set to", currentFee.toString(), ", skipping");
    }

    // Verify
    try {
        console.log("   Verify instantWithdrawFeeBps:", (await vc.instantWithdrawFeeBps()).toString());
    } catch (e) {
        console.log("   Verification read error:", e.message);
    }

    console.log(`\n=== Configuration Complete (${network}) ===`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
