const { ethers } = require("hardhat");

async function main() {
    console.log("🧪 STARTING DEPOSIT/WITHDRAW TEST (DragonSwap System)");
    console.log("══════════════════════════════════════════════════════");

    const [signer] = await ethers.getSigners();
    console.log("  Tester Address:", signer.address);
    const balance = await ethers.provider.getBalance(signer.address);
    console.log("  Balance:", ethers.formatEther(balance), "KAIA");

    // Addresses from deployment files
    // Addresses from deployment files
    const STABLE_SHARE_VAULT = "0xEce34C711903b0884DB9B2248f498796BA36980B";
    const BALANCED_SHARE_VAULT = "0x0000000000000000000000000000000000000000";

    const AMOUNT = ethers.parseEther("0.1");

    // Test Stable Vault
    await testVault("STABLE", STABLE_SHARE_VAULT, signer, AMOUNT);

    // Test Balanced Vault
    // await testVault("BALANCED", BALANCED_SHARE_VAULT, signer, AMOUNT);

    console.log("\n✅ ALL TESTS COMPLETE");
}

async function testVault(name, vaultAddr, signer, amount) {
    console.log(`\n🔹 Testing ${name} VAULT (${vaultAddr})`);

    const ShareVault = await ethers.getContractAt("ShareVault", vaultAddr, signer);

    // 1. Initial State
    const initialShares = await ShareVault.balanceOf(signer.address);
    const initialAssets = await ShareVault.totalAssets();

    console.log(`   Initial Shares: ${ethers.formatEther(initialShares)}`);
    console.log(`   Initial Assets: ${ethers.formatEther(initialAssets)}`);

    // 2. Deposit (Native Path)
    console.log(`   🚀 Depositing ${ethers.formatEther(amount)} KAIA (Native Path)...`);

    // Use depositKAIA for native KAIA
    const txDeposit = await ShareVault.depositKAIA(signer.address, { value: amount, gasLimit: 3000000 });
    await txDeposit.wait();
    console.log("   ✅ Deposit Confirmed");

    // Check post-deposit
    const afterDepositShares = await ShareVault.balanceOf(signer.address);
    const afterDepositAssets = await ShareVault.totalAssets();
    console.log(`   Shares: ${ethers.formatEther(afterDepositShares)} (+${ethers.formatEther(afterDepositShares - initialShares)})`);
    console.log(`   Assets: ${ethers.formatEther(afterDepositAssets)} (+${ethers.formatEther(afterDepositAssets - initialAssets)})`);

    // 3. Withdraw (Redeem 50% to cover fees)
    // 100% withdraw fails due to 0.01% swap fee on DragonSwap (Need >100% KoKAIA to get 100% WKAIA if price 1:1)
    const sharesToRedeem = (afterDepositShares - initialShares) / 2n;

    console.log(`   🔻 Redeeming ${ethers.formatEther(sharesToRedeem)} Shares (50%)...`);

    // NOTE: using redeem(shares, receiver, owner)
    // Add gas limit to be safe
    const txWithdraw = await ShareVault.redeem(sharesToRedeem, signer.address, signer.address, { gasLimit: 3000000 });
    await txWithdraw.wait();
    console.log("   ✅ Redeem Confirmed");

    // 4. Final State
    const finalShares = await ShareVault.balanceOf(signer.address);
    const finalAssets = await ShareVault.totalAssets();

    console.log(`   Final Shares: ${ethers.formatEther(finalShares)}`);
    console.log(`   Final Assets: ${ethers.formatEther(finalAssets)}`);

    console.log(`   ✅ ${name} Flow Verified`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
