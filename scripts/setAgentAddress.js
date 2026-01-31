const { ethers } = require("hardhat");

async function main() {
    const d = require("../deployments/mainnet/audit-kaia-aggressive.json");
    const agentAddr = process.env.AGENT_ADDRESS || "0x3797E85c0837C9d2aa3Df1D42fF397FDff274271";

    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);

    console.log("VaultCore:", d.vaultCore);
    console.log("Current agentAddress:", await vc.agentAddress());
    console.log("Setting agentAddress to:", agentAddr);

    const tx = await vc.setAgentAddress(agentAddr);
    console.log("TX:", tx.hash);
    await tx.wait();

    console.log("Confirmed. New agentAddress:", await vc.agentAddress());
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
