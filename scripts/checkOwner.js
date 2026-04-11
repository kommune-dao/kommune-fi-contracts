const { ethers } = require("hardhat");

async function main() {
    const d = require("../deployments/testnet/audit-kairos.json");
    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);
    const sv = await ethers.getContractAt("ShareVault", d.shareVault);
    const [deployer] = await ethers.getSigners();

    console.log("Deployer:", deployer.address);
    console.log("VaultCore owner:", await vc.owner());
    console.log("ShareVault owner:", await sv.owner());
    console.log("VaultCore shareVault:", await vc.shareVault());
    console.log("ShareVault vaultCore:", await sv.vaultCore());

    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Deployer balance:", ethers.formatEther(balance), "KAIA");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
