const { ethers, upgrades } = require("hardhat");

async function main() {
    const d = require("../deployments/mainnet/audit-kaia-aggressive.json");

    console.log("=== Aggressive VaultCore Upgrade ===");
    console.log("   Proxy:", d.vaultCore);

    // Step 1: Upgrade VaultCore implementation
    const VaultCore = await ethers.getContractFactory("VaultCore");

    console.log("\n[1/3] Upgrading VaultCore proxy...");
    const upgraded = await upgrades.upgradeProxy(d.vaultCore, VaultCore, {
        unsafeAllow: ["delegatecall"]
    });
    await upgraded.waitForDeployment();
    console.log("   VaultCore upgraded successfully");

    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);

    // Step 2: Set stKAIA addresses (new storage slots 22-23)
    const STKAIA_TOKEN = "0x42952b873ed6f7f0a7e4992e2a9818e3a9001995";
    const STKAIA_RATE_PROVIDER = "0xefBDe60d5402a570DF7CA0d26Ddfedc413260146";

    const currentStKaia = await vc.stKaiaToken();
    if (currentStKaia === ethers.ZeroAddress) {
        console.log("\n[2/3] Setting stKAIA addresses...");
        const tx = await vc.setStKaiaAddresses(STKAIA_TOKEN, STKAIA_RATE_PROVIDER);
        await tx.wait();
        console.log("   stKaiaToken:", STKAIA_TOKEN);
        console.log("   stKaiaRateProvider:", STKAIA_RATE_PROVIDER);
    } else {
        console.log("\n[2/3] stKAIA addresses already set:", currentStKaia);
    }

    // Step 3: Verify state preserved
    console.log("\n[3/3] Verifying state...");
    console.log("   shareVault:", await vc.shareVault());
    console.log("   claimManager:", await vc.claimManager());
    console.log("   agentAddress:", await vc.agentAddress());
    console.log("   stKaiaToken:", await vc.stKaiaToken());
    console.log("   stKaiaRateProvider:", await vc.stKaiaRateProvider());
    console.log("   investRatio:", (await vc.investRatio()).toString());

    // Verify new functions exist
    console.log("\n   Verifying new functions...");
    const unstakeSelector = vc.interface.getFunction("unstake").selector;
    const buyStKaiaSelector = vc.interface.getFunction("agentBuyStKaia").selector;
    const reqUnstakeSelector = vc.interface.getFunction("agentRequestUnstake").selector;
    const claimUnstakeSelector = vc.interface.getFunction("agentClaimUnstake").selector;
    console.log("   unstake selector:", unstakeSelector);
    console.log("   agentBuyStKaia selector:", buyStKaiaSelector);
    console.log("   agentRequestUnstake selector:", reqUnstakeSelector);
    console.log("   agentClaimUnstake selector:", claimUnstakeSelector);

    console.log("\n=== Upgrade Complete ===");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
