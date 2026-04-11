const { ethers } = require("hardhat");

/**
 * Set basisPointsFees on all 3 ShareVault profiles.
 *
 * Usage:
 *   npx hardhat run scripts/setFees.js --network kaia
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const provider = ethers.provider;

    const NEW_FEE = 10; // 0.1%

    console.log("=== Set ShareVault basisPointsFees ===");
    console.log("Deployer:", deployer.address);
    console.log("New fee:", NEW_FEE, `(${NEW_FEE / 100}%)\n`);

    const profiles = [
        { name: "stable",     sv: "0x7a801555A3c489652ce88D6E0768FA75E699088D" },
        { name: "balanced",   sv: "0x2ec03439830f5da9d539C4537846C3708F232c77" },
        { name: "aggressive", sv: "0x8663b23E3a4ECd9ED6424854656CC5463C11C197" },
    ];

    const abi = [
        "function basisPointsFees() view returns (uint256)",
        "function setFees(uint256) external",
    ];

    for (const p of profiles) {
        const sv = new ethers.Contract(p.sv, abi, deployer);
        const before = await sv.basisPointsFees();
        console.log(`  ${p.name}: current = ${before} (${Number(before) / 100}%)`);

        if (Number(before) === NEW_FEE) {
            console.log(`  ${p.name}: already ${NEW_FEE}, skip\n`);
            continue;
        }

        const tx = await sv.setFees(NEW_FEE, { gasLimit: 100000 });
        const receipt = await tx.wait();
        const after = await sv.basisPointsFees();
        console.log(`  ${p.name}: ${receipt.status === 1 ? "SUCCESS" : "FAILED"} → ${after} (${Number(after) / 100}%)\n`);
    }

    console.log("=== Done ===");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
