const { ethers } = require("hardhat");

async function main() {
    for (const p of ["stable", "balanced", "aggressive"]) {
        const d = require(`../deployments/mainnet/audit-kaia-${p}.json`);
        const vc = await ethers.getContractAt("VaultCore", d.vaultCore);
        const invest = (await vc.investRatio()).toString();
        const balanced = (await vc.balancedRatio()).toString();
        const aggressive = (await vc.aggressiveRatio()).toString();
        console.log(`[${p}] invest=${invest} balanced=${balanced} aggressive=${aggressive}`);
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
