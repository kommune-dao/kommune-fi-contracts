const { ethers } = require("hardhat");

async function main() {
    const profile = process.env.PROFILE;
    if (!profile) throw new Error("Set PROFILE env var");

    const invest = parseInt(process.env.INVEST || "10000");
    const balanced = parseInt(process.env.BALANCED || "0");
    const aggressive = parseInt(process.env.AGGRESSIVE || "0");

    const d = require(`../deployments/mainnet/audit-kaia-${profile}.json`);
    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);

    console.log(`Setting ${profile} vault ratios: invest=${invest}, balanced=${balanced}, aggressive=${aggressive}`);
    const tx = await vc.setInvestmentRatios(invest, balanced, aggressive, { gasLimit: 200000 });
    await tx.wait();

    console.log("investRatio:", (await vc.investRatio()).toString());
    console.log("balancedRatio:", (await vc.balancedRatio()).toString());
    console.log("aggressiveRatio:", (await vc.aggressiveRatio()).toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
