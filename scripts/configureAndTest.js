const { ethers } = require("hardhat");

async function main() {
    const profile = process.env.PROFILE;
    if (!profile) throw new Error("Set PROFILE env var (stable/balanced/aggressive)");

    const d = require(`../deployments/mainnet/audit-kaia-${profile}.json`);
    const [signer] = await ethers.getSigners();

    console.log(`\n=== ${profile.toUpperCase()} VAULT ===`);
    console.log("VaultCore:", d.vaultCore);
    console.log("ShareVault:", d.shareVault);
    console.log("Signer:", signer.address);

    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);
    const sv = await ethers.getContractAt("ShareVault", d.shareVault);

    // --- STEP 1: Configure Ratios ---
    console.log("\n--- Step 1: Configure Ratios ---");

    let investRatio, balancedRatio, aggressiveRatio;
    if (profile === "stable") {
        investRatio = 10000;
        balancedRatio = 0;
        aggressiveRatio = 0;
    } else if (profile === "balanced") {
        investRatio = 10000;
        balancedRatio = 3000;  // 30% LP
        aggressiveRatio = 0;
    } else if (profile === "aggressive") {
        investRatio = 10000;
        balancedRatio = 2000;   // 20% LP
        aggressiveRatio = 1000; // 10% Agent (needs agentAddress)
    }

    const currentInvest = await vc.investRatio();
    const currentBalanced = await vc.balancedRatio();
    const currentAggressive = await vc.aggressiveRatio();

    if (currentInvest != BigInt(investRatio) || currentBalanced != BigInt(balancedRatio) || currentAggressive != BigInt(aggressiveRatio)) {
        console.log(`Setting ratios: invest=${investRatio}, balanced=${balancedRatio}, aggressive=${aggressiveRatio}`);
        const tx = await vc.setInvestmentRatios(investRatio, balancedRatio, aggressiveRatio, { gasLimit: 200000 });
        await tx.wait();
        console.log("Ratios set!");
    } else {
        console.log("Ratios already correct.");
    }

    // Verify
    console.log("investRatio:", (await vc.investRatio()).toString());
    console.log("balancedRatio:", (await vc.balancedRatio()).toString());
    console.log("aggressiveRatio:", (await vc.aggressiveRatio()).toString());

    // --- STEP 2: Smoke Test - Deposit ---
    console.log("\n--- Step 2: Deposit 0.1 KAIA ---");

    const depositAmount = ethers.parseEther("0.1");
    const sharesBefore = await sv.balanceOf(signer.address);
    console.log("Shares before:", ethers.formatEther(sharesBefore));

    const depositTx = await sv.depositKAIA(signer.address, {
        value: depositAmount,
        gasLimit: 3_000_000
    });
    const depositReceipt = await depositTx.wait();
    console.log("Deposit TX:", depositReceipt.hash);
    console.log("Gas used:", depositReceipt.gasUsed.toString());

    const sharesAfter = await sv.balanceOf(signer.address);
    console.log("Shares after:", ethers.formatEther(sharesAfter));
    console.log("Shares minted:", ethers.formatEther(sharesAfter - sharesBefore));

    // Check vault assets
    const assets = await vc.getVaultAssets();
    const names = await vc.getAssetNames();
    console.log("\nVault Assets:");
    for (let i = 0; i < 6; i++) {
        if (assets[i] > 0n) {
            console.log(`  ${names[i]}: ${ethers.formatEther(assets[i])}`);
        }
    }

    const totalAssets = await sv.totalAssets();
    console.log("Total Assets:", ethers.formatEther(totalAssets));

    // --- STEP 3: Smoke Test - Redeem 50% ---
    console.log("\n--- Step 3: Redeem 50% ---");

    const sharesToRedeem = (sharesAfter - sharesBefore) / 2n;
    if (sharesToRedeem > 0n) {
        const kaiaBefore = await ethers.provider.getBalance(signer.address);

        const redeemTx = await sv.redeem(sharesToRedeem, signer.address, signer.address, {
            gasLimit: 3_000_000
        });
        const redeemReceipt = await redeemTx.wait();
        console.log("Redeem TX:", redeemReceipt.hash);
        console.log("Gas used:", redeemReceipt.gasUsed.toString());

        const kaiaAfter = await ethers.provider.getBalance(signer.address);
        const gasCost = redeemReceipt.gasUsed * redeemReceipt.gasPrice;
        const kaiaReceived = kaiaAfter - kaiaBefore + gasCost;
        console.log("KAIA received (net of gas):", ethers.formatEther(kaiaReceived));

        const sharesRemaining = await sv.balanceOf(signer.address);
        console.log("Shares remaining:", ethers.formatEther(sharesRemaining));
    } else {
        console.log("No new shares to redeem.");
    }

    // Final state
    console.log("\n--- Final State ---");
    const finalAssets = await vc.getVaultAssets();
    const finalTotal = await sv.totalAssets();
    console.log("Total Assets:", ethers.formatEther(finalTotal));
    for (let i = 0; i < 6; i++) {
        if (finalAssets[i] > 0n) {
            console.log(`  ${names[i]}: ${ethers.formatEther(finalAssets[i])}`);
        }
    }

    console.log(`\n=== ${profile.toUpperCase()} VAULT TEST COMPLETE ===\n`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
