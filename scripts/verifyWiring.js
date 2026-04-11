const { ethers } = require("hardhat");

async function main() {
    const profile = process.env.PROFILE || "aggressive";
    const d = require(`../deployments/mainnet/audit-kaia-${profile}.json`);

    console.log(`Verifying wiring for ${profile} vault...`);

    const handler = await ethers.getContractAt("DragonSwapHandler", d.dragonSwapHandler);
    const vaultCore = await ethers.getContractAt("VaultCore", d.vaultCore);
    const shareVault = await ethers.getContractAt("ShareVault", d.shareVault);

    console.log("\n--- DragonSwapHandler ---");
    console.log("VaultCore authorized:", await handler.authorizedCallers(d.vaultCore));
    console.log("SwapRouter:", await handler.swapRouter());

    console.log("\n--- VaultCore ---");
    console.log("shareVault:", await vaultCore.shareVault());
    console.log("claimManager:", await vaultCore.claimManager());
    console.log("wkaia:", await vaultCore.wkaia());
    console.log("isMainnet:", await vaultCore.isMainnet());
    console.log("investRatio:", (await vaultCore.investRatio()).toString());

    console.log("\n--- ShareVault ---");
    console.log("vaultCore:", await shareVault.vaultCore());
    console.log("name:", await shareVault.name());
    console.log("symbol:", await shareVault.symbol());
    console.log("depositLimit:", ethers.formatEther(await shareVault.depositLimit()));
    console.log("basisPointsFees:", (await shareVault.basisPointsFees()).toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
