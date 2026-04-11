const { ethers } = require("hardhat");

async function main() {
    const d = require("../deployments/mainnet/audit-kaia.json");
    const [signer] = await ethers.getSigners();
    const handler = await ethers.getContractAt("DragonSwapHandler", d.dragonSwapHandler);
    
    // Check owner
    const owner = await handler.owner();
    console.log("Handler owner:", owner);
    console.log("Signer:", signer.address);
    console.log("Match:", owner.toLowerCase() === signer.address.toLowerCase());
    
    // Try with gasLimit
    const V3_SWAP_ROUTER = "0xA324880f884036E3d21a09B90269E1aC57c7EC8a";
    console.log("\nSetting router to:", V3_SWAP_ROUTER);
    
    const tx = await handler.setSwapRouter(V3_SWAP_ROUTER, { gasLimit: 200000 });
    console.log("TX:", tx.hash);
    const receipt = await tx.wait();
    console.log("Status:", receipt.status);
    
    console.log("New router:", await handler.swapRouter());
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
