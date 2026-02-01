const { ethers, upgrades } = require("hardhat");

/**
 * Force-import existing proxies into OpenZeppelin manifest.
 * Required before upgradeProxy() can be used on proxies
 * that were deployed outside the current OZ manifest.
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
    console.log(`=== Force Import Proxies (${network}) ===`);
    console.log("   VaultCore:", d.vaultCore);
    console.log("   ShareVault:", d.shareVault);

    const VaultCore = await ethers.getContractFactory("VaultCore");
    const ShareVault = await ethers.getContractFactory("ShareVault");

    console.log("\n[1/2] Importing VaultCore proxy...");
    try {
        await upgrades.forceImport(d.vaultCore, VaultCore, {
            kind: "uups"
        });
        console.log("   VaultCore imported");
    } catch (e) {
        if (e.message.includes("already registered")) {
            console.log("   VaultCore already registered");
        } else {
            throw e;
        }
    }

    console.log("\n[2/2] Importing ShareVault proxy...");
    try {
        await upgrades.forceImport(d.shareVault, ShareVault, {
            kind: "uups"
        });
        console.log("   ShareVault imported");
    } catch (e) {
        if (e.message.includes("already registered")) {
            console.log("   ShareVault already registered");
        } else {
            throw e;
        }
    }

    console.log("\n=== Import Complete ===");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
