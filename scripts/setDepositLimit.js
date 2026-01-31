const { ethers } = require("hardhat");

async function main() {
    const profile = process.env.PROFILE || "stable";
    const d = require(`../deployments/mainnet/audit-kaia-${profile}.json`);

    console.log(`Setting deposit limit for ${profile} vault...`);
    const sv = await ethers.getContractAt("ShareVault", d.shareVault);

    const limit = ethers.parseEther("10"); // 10 KAIA
    const tx = await sv.setDepositLimit(limit, { gasLimit: 200000 });
    await tx.wait();

    console.log("Deposit limit set to:", ethers.formatEther(await sv.depositLimit()), "KAIA");
}

main()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
