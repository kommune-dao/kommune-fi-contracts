const { ethers } = require("hardhat");

async function main() {
    const d = require("../deployments/mainnet/audit-kaia.json");
    const [signer] = await ethers.getSigners();
    console.log("Deployer:", signer.address);
    const bal = await ethers.provider.getBalance(signer.address);
    console.log("Balance:", ethers.formatEther(bal), "KAIA");
    const network = await ethers.provider.getNetwork();
    console.log("ChainId:", network.chainId.toString());

    // Check contract code exists
    const vcCode = await ethers.provider.getCode(d.vaultCore);
    console.log("\nVaultCore has code:", vcCode !== "0x", "length:", vcCode.length);
    const svCode = await ethers.provider.getCode(d.shareVault);
    console.log("ShareVault has code:", svCode !== "0x", "length:", svCode.length);

    if (vcCode === "0x") {
        console.log("\n⛔ VaultCore has no code on chain! Deployment may have failed.");
        return;
    }

    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);
    const sv = await ethers.getContractAt("ShareVault", d.shareVault);

    console.log("\n=== VaultCore Verification ===");
    console.log("shareVault:", await vc.shareVault());
    console.log("claimManager:", await vc.claimManager());
    console.log("wkaia:", await vc.wkaia());
    console.log("isMainnet:", await vc.isMainnet());
    console.log("investRatio:", (await vc.investRatio()).toString());
    console.log("balancedRatio:", (await vc.balancedRatio()).toString());
    console.log("aggressiveRatio:", (await vc.aggressiveRatio()).toString());
    console.log("agentAddress:", await vc.agentAddress());

    console.log("\n=== ShareVault Verification ===");
    console.log("vaultCore:", await sv.vaultCore());
    console.log("name:", await sv.name());
    console.log("symbol:", await sv.symbol());
    console.log("basisPointsFees:", (await sv.basisPointsFees()).toString());
    console.log("treasury:", await sv.treasury());
    console.log("depositLimit:", ethers.formatEther(await sv.depositLimit()));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
