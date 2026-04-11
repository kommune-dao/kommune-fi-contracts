const { ethers } = require("hardhat");

async function main() {
    const [signer] = await ethers.getSigners();
    console.log("Signer:", signer.address);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(signer.address)), "KAIA\n");

    const vaults = [
        // { profile: "stable", amount: "100" },  // Already deposited
        { profile: "balanced", amount: "2000" },
        { profile: "aggressive", amount: "1000" },
    ];

    for (const v of vaults) {
        const d = require(`../deployments/mainnet/audit-kaia-${v.profile}.json`);
        const sv = await ethers.getContractAt("ShareVault", d.shareVault);
        const vc = await ethers.getContractAt("VaultCore", d.vaultCore);

        const amount = ethers.parseEther(v.amount);
        const currentLimit = await sv.depositLimit();
        const existingDeposit = await sv.deposits(signer.address);
        const needed = existingDeposit.amount + amount;

        // Increase deposit limit to cover existing + new deposit
        if (currentLimit < needed) {
            const newLimit = needed + ethers.parseEther("1"); // 1 KAIA buffer
            console.log(`[${v.profile}] Setting depositLimit to ${ethers.formatEther(newLimit)} KAIA (existing: ${ethers.formatEther(existingDeposit.amount)})...`);
            const tx = await sv.setDepositLimit(newLimit, { gasLimit: 200000 });
            await tx.wait();
        }

        console.log(`[${v.profile}] Depositing ${v.amount} KAIA...`);
        const tx = await sv.depositKAIA(signer.address, {
            value: amount,
            gasLimit: 3_000_000
        });
        const receipt = await tx.wait();
        console.log(`[${v.profile}] TX: ${receipt.hash}`);
        console.log(`[${v.profile}] Gas: ${receipt.gasUsed.toString()}`);

        const shares = await sv.balanceOf(signer.address);
        const total = await sv.totalAssets();
        console.log(`[${v.profile}] Shares: ${ethers.formatEther(shares)}`);
        console.log(`[${v.profile}] TotalAssets: ${ethers.formatEther(total)}\n`);
    }

    console.log("Remaining balance:", ethers.formatEther(await ethers.provider.getBalance(signer.address)), "KAIA");
}

main()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
