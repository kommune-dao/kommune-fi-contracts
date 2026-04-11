const { ethers } = require("hardhat");

async function main() {
    console.log("🧪 SMOKE TEST - Mainnet (0.1 KAIA)");
    console.log("══════════════════════════════════════════");

    const d = require("../deployments/mainnet/audit-kaia.json");
    const [signer] = await ethers.getSigners();
    console.log("Tester:", signer.address);
    const balance = await ethers.provider.getBalance(signer.address);
    console.log("Balance:", ethers.formatEther(balance), "KAIA");

    const sv = await ethers.getContractAt("ShareVault", d.shareVault);
    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);

    // Pre-state
    const initialShares = await sv.balanceOf(signer.address);
    const initialAssets = await sv.totalAssets();
    console.log("\n📊 Pre-state:");
    console.log("  Shares:", ethers.formatEther(initialShares));
    console.log("  Total Assets:", ethers.formatEther(initialAssets));

    // === Test 1: Deposit 0.1 KAIA ===
    const amount = ethers.parseEther("0.1");
    console.log("\n🚀 Test 1: Deposit", ethers.formatEther(amount), "KAIA (native path)...");

    const txDeposit = await sv.depositKAIA(signer.address, { value: amount, gasLimit: 3_000_000 });
    console.log("  TX:", txDeposit.hash);
    const receipt = await txDeposit.wait();
    console.log("  Gas used:", receipt.gasUsed.toString());
    console.log("  ✅ Deposit confirmed");

    // Post-deposit state
    const postShares = await sv.balanceOf(signer.address);
    const postAssets = await sv.totalAssets();
    console.log("\n📊 Post-deposit:");
    console.log("  Shares:", ethers.formatEther(postShares), "(+" + ethers.formatEther(postShares - initialShares) + ")");
    console.log("  Total Assets:", ethers.formatEther(postAssets));

    // Check vault assets
    const vaultAssets = await vc.getVaultAssets();
    const assetNames = await vc.getAssetNames();
    console.log("\n  Vault breakdown:");
    for (let i = 0; i < 6; i++) {
        if (vaultAssets[i] > 0n) {
            console.log("    " + assetNames[i] + ": " + ethers.formatEther(vaultAssets[i]));
        }
    }

    // === Test 2: Redeem 50% ===
    const sharesToRedeem = (postShares - initialShares) / 2n;
    console.log("\n🔻 Test 2: Redeem", ethers.formatEther(sharesToRedeem), "shares (50%)...");

    const balanceBefore = await ethers.provider.getBalance(signer.address);
    const txRedeem = await sv.redeem(sharesToRedeem, signer.address, signer.address, { gasLimit: 3_000_000 });
    console.log("  TX:", txRedeem.hash);
    const receipt2 = await txRedeem.wait();
    console.log("  Gas used:", receipt2.gasUsed.toString());
    const balanceAfter = await ethers.provider.getBalance(signer.address);
    console.log("  ✅ Redeem confirmed");
    console.log("  KAIA returned:", ethers.formatEther(balanceAfter - balanceBefore));

    // Final state
    const finalShares = await sv.balanceOf(signer.address);
    const finalAssets = await sv.totalAssets();
    console.log("\n📊 Final state:");
    console.log("  Shares:", ethers.formatEther(finalShares));
    console.log("  Total Assets:", ethers.formatEther(finalAssets));

    console.log("\n✅ SMOKE TEST COMPLETE");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
