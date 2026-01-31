const { ethers } = require("hardhat");

async function main() {
    const d = require("../deployments/mainnet/audit-kaia.json");
    const sv = await ethers.getContractAt("ShareVault", d.shareVault);
    
    const currentLimit = await sv.depositLimit();
    console.log("Current depositLimit:", ethers.formatEther(currentLimit), "KAIA");
    
    // Set to 10 KAIA
    const newLimit = ethers.parseEther("10");
    console.log("Setting depositLimit to:", ethers.formatEther(newLimit), "KAIA");
    const tx = await sv.setDepositLimit(newLimit);
    console.log("TX:", tx.hash);
    await tx.wait();
    
    const updatedLimit = await sv.depositLimit();
    console.log("✅ New depositLimit:", ethers.formatEther(updatedLimit), "KAIA");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
