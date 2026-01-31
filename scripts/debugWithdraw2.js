const { ethers } = require("hardhat");

async function main() {
    const d = require("../deployments/mainnet/audit-kaia.json");
    const [signer] = await ethers.getSigners();
    
    // Handler uses swapRouter, not router
    const handler = await ethers.getContractAt("DragonSwapHandler", d.dragonSwapHandler);
    const routerAddr = await handler.swapRouter();
    const pmAddr = await handler.positionManager();
    console.log("SwapRouter:", routerAddr);
    console.log("PositionManager:", pmAddr);
    
    // Check KoKAIA approval from VaultCore to Handler
    const kokaiaAddr = "0xA1338309658D3Da331C747518d0bb414031F22fd";
    const kokaia = await ethers.getContractAt("IERC20", kokaiaAddr);
    const allowance = await kokaia.allowance(d.vaultCore, d.dragonSwapHandler);
    console.log("\nKoKAIA allowance (VaultCore -> Handler):", ethers.formatEther(allowance));
    
    // Check VaultCore KoKAIA balance
    const vcKokaiaBalance = await kokaia.balanceOf(d.vaultCore);
    console.log("VaultCore KoKAIA balance:", ethers.formatEther(vcKokaiaBalance));
    
    // The swap goes: VaultCore approves Handler, Handler calls Router
    // Let's check if the router has exactOutputSingle with deadline in struct
    // IDragonSwap.sol uses deadline in ExactOutputSingleParams
    // SmartRouter (0x5EA3...) uses a different ABI - it's a multi-path router
    // The correct V3 SwapRouter is 0xA324880f884036E3d21a09B90269E1aC57c7EC8a
    
    // Check both routers
    const smartRouter = "0x5EA3e22C41B08DD7DC7217549939d987ED410354";
    const v3SwapRouter = "0xA324880f884036E3d21a09B90269E1aC57c7EC8a";
    
    console.log("\n=== Router Check ===");
    console.log("SmartRouter code:", (await ethers.provider.getCode(smartRouter)).length);
    console.log("V3SwapRouter code:", (await ethers.provider.getCode(v3SwapRouter)).length);
    
    // Our handler is using SmartRouter (0x5EA3...)
    // Let's check if SmartRouter supports exactOutputSingle with deadline struct
    // Function selector for exactOutputSingle with deadline in struct:
    const sigWithDeadline = ethers.id("exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))").slice(0, 10);
    console.log("exactOutputSingle (with deadline) selector:", sigWithDeadline);
    
    // PancakeSwap SmartRouter's exactInputSingle with deadline:
    // 0x414bf389 = exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
    // 0xdb3e2198 = exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
    console.log("\nExpected selectors:");
    console.log("  exactInputSingle: 0x414bf389");
    console.log("  exactOutputSingle: 0xdb3e2198");
    
    // Check if smartRouter has these selectors
    // Try calling with empty params to see if it reverts with "wrong selector" or something
    try {
        await ethers.provider.call({
            to: smartRouter,
            data: "0xdb3e2198" + "0".repeat(512), // exactOutputSingle with dummy params
        });
        console.log("SmartRouter supports exactOutputSingle: YES");
    } catch (e) {
        const msg = e.message.substring(0, 100);
        console.log("SmartRouter exactOutputSingle call:", msg);
    }
    
    try {
        await ethers.provider.call({
            to: v3SwapRouter,
            data: "0xdb3e2198" + "0".repeat(512),
        });
        console.log("V3SwapRouter supports exactOutputSingle: YES");
    } catch (e) {
        const msg = e.message.substring(0, 100);
        console.log("V3SwapRouter exactOutputSingle call:", msg);
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
