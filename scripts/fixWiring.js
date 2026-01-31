const { ethers } = require("hardhat");

async function main() {
    const profile = process.env.PROFILE || "balanced";
    const d = require(`../deployments/mainnet/audit-kaia-${profile}.json`);

    console.log(`Fixing wiring for ${profile} vault...`);
    console.log("DragonSwapHandler:", d.dragonSwapHandler);
    console.log("VaultCore:", d.vaultCore);

    const handler = await ethers.getContractAt("DragonSwapHandler", d.dragonSwapHandler);
    const vaultCore = await ethers.getContractAt("VaultCore", d.vaultCore);

    // Check current state
    const isAuthorized = await handler.authorizedCallers(d.vaultCore);
    console.log("VaultCore authorized in Handler:", isAuthorized);

    if (!isAuthorized) {
        console.log("Authorizing VaultCore in Handler...");
        const tx = await handler.setAuthorizedCaller(d.vaultCore, true, { gasLimit: 200000 });
        await tx.wait();
        console.log("Done. Authorized:", await handler.authorizedCallers(d.vaultCore));
    }

    // Verify ShareVault and ClaimManager
    const shareVault = await vaultCore.shareVault();
    const claimManager = await vaultCore.claimManager();
    console.log("ShareVault set:", shareVault);
    console.log("ClaimManager set:", claimManager);

    if (shareVault === "0x0000000000000000000000000000000000000000") {
        console.log("Setting ShareVault...");
        const tx = await vaultCore.setShareVault(d.shareVault, { gasLimit: 200000 });
        await tx.wait();
        console.log("ShareVault set to:", d.shareVault);
    }

    if (claimManager === "0x0000000000000000000000000000000000000000") {
        console.log("Setting ClaimManager...");
        const tx = await vaultCore.setClaimManager(d.claimManager, { gasLimit: 200000 });
        await tx.wait();
        console.log("ClaimManager set to:", d.claimManager);
    }

    console.log("\nWiring complete for", profile, "vault!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
