const { ethers } = require("hardhat");

async function main() {
    const profile = process.env.PROFILE || "aggressive";
    const d = require(`../deployments/mainnet/audit-kaia-${profile}.json`);

    const stKaiaToken = "0x42952b873ed6f7f0a7e4992e2a9818e3a9001995";
    const stKaiaRateProvider = "0xefBDe60d5402a570DF7CA0d26Ddfedc413260146";

    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);

    console.log(`Setting stKAIA addresses on ${profile} vault...`);
    console.log("  VaultCore:", d.vaultCore);
    console.log("  stKaiaToken:", stKaiaToken);
    console.log("  stKaiaRateProvider:", stKaiaRateProvider);

    const tx = await vc.setStKaiaAddresses(stKaiaToken, stKaiaRateProvider, { gasLimit: 200000 });
    await tx.wait();

    console.log("  stKaiaToken:", await vc.stKaiaToken());
    console.log("  stKaiaRateProvider:", await vc.stKaiaRateProvider());
    console.log("Done.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
