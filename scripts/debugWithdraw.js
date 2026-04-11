const { ethers } = require("hardhat");

async function main() {
    const d = require("../deployments/mainnet/audit-kaia.json");
    const [signer] = await ethers.getSigners();
    
    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);
    const sv = await ethers.getContractAt("ShareVault", d.shareVault);
    const handler = await ethers.getContractAt("DragonSwapHandler", d.dragonSwapHandler);
    
    // Check VaultCore balances
    const assets = await vc.getVaultAssets();
    const names = await vc.getAssetNames();
    console.log("=== Vault Assets ===");
    for (let i = 0; i < 6; i++) {
        if (assets[i] > 0n) console.log(names[i] + ":", ethers.formatEther(assets[i]));
    }
    
    // Check Handler state
    console.log("\n=== DragonSwapHandler ===");
    console.log("Handler address:", d.dragonSwapHandler);
    const router = await handler.router();
    console.log("Router:", router);
    const pm = await handler.positionManager();
    console.log("PositionManager:", pm);
    
    // Check WKAIA balance on VaultCore
    const wkaiaAddr = "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432";
    const wkaia = await ethers.getContractAt("IERC20", wkaiaAddr);
    const vcWkaiaBalance = await wkaia.balanceOf(d.vaultCore);
    console.log("\nVaultCore WKAIA balance:", ethers.formatEther(vcWkaiaBalance));
    
    // Check KoKAIA balance on VaultCore
    const kokaiaAddr = "0xA1338309658D3Da331C747518d0bb414031F22fd";
    const kokaia = await ethers.getContractAt("IERC20", kokaiaAddr);
    const vcKokaiaBalance = await kokaia.balanceOf(d.vaultCore);
    console.log("VaultCore KoKAIA balance:", ethers.formatEther(vcKokaiaBalance));
    
    // Try a direct swap simulation: KoKAIA -> WKAIA via DragonSwap router
    console.log("\n=== Swap Simulation ===");
    const routerAddr = router;
    console.log("Testing swap KoKAIA -> WKAIA via router:", routerAddr);
    
    // Check if router has exactOutputSingle
    const swapRouterIface = new ethers.Interface([
        "function exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) payable returns (uint256)",
        "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) payable returns (uint256)"
    ]);
    
    // Test with exactInputSingle (simpler)
    const routerCode = await ethers.provider.getCode(routerAddr);
    console.log("Router has code:", routerCode !== "0x", "length:", routerCode.length);
    
    // Check the exact function selector we're calling
    console.log("exactOutputSingle selector:", ethers.id("exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))").slice(0, 10));
    console.log("exactInputSingle selector:", ethers.id("exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))").slice(0, 10));
    
    // Shares and assets
    const shares = await sv.balanceOf(signer.address);
    const previewedAssets = await sv.previewRedeem(shares);
    console.log("\nUser shares:", ethers.formatEther(shares));
    console.log("Preview redeem assets:", ethers.formatEther(previewedAssets));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
