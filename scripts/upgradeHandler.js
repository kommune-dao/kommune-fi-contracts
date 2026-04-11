const { ethers, upgrades } = require("hardhat");

async function main() {
    const d = require("../deployments/mainnet/audit-kaia.json");
    
    // 1. Upgrade Handler proxy
    console.log("🔄 Upgrading DragonSwapHandler...");
    console.log("   Proxy:", d.dragonSwapHandler);
    
    const DragonSwapHandler = await ethers.getContractFactory("DragonSwapHandler");
    const upgraded = await upgrades.upgradeProxy(d.dragonSwapHandler, DragonSwapHandler);
    await upgraded.waitForDeployment();
    console.log("   ✅ Handler upgraded");
    
    // 2. Switch router to V3SwapRouter
    const handler = await ethers.getContractAt("DragonSwapHandler", d.dragonSwapHandler);
    const V3_SWAP_ROUTER = "0xA324880f884036E3d21a09B90269E1aC57c7EC8a";
    
    console.log("   Current router:", await handler.swapRouter());
    console.log("   Setting router to V3SwapRouter:", V3_SWAP_ROUTER);
    
    const tx = await handler.setSwapRouter(V3_SWAP_ROUTER);
    await tx.wait();
    
    console.log("   New router:", await handler.swapRouter());
    console.log("   ✅ Router updated");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
