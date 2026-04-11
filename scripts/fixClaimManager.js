const { ethers } = require("hardhat");

async function main() {
    const d = require("../deployments/mainnet/audit-kaia.json");
    
    // Check ClaimManager has code
    const cmCode = await ethers.provider.getCode(d.claimManager);
    console.log("ClaimManager has code:", cmCode !== "0x", "length:", cmCode.length);
    
    const vc = await ethers.getContractAt("VaultCore", d.vaultCore);
    
    // Check current state
    console.log("Current claimManager:", await vc.claimManager());
    
    // Set ClaimManager
    console.log("Setting ClaimManager to:", d.claimManager);
    const tx = await vc.setClaimManager(d.claimManager);
    console.log("TX:", tx.hash);
    await tx.wait();
    
    // Verify
    console.log("New claimManager:", await vc.claimManager());
    console.log("✅ ClaimManager set");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
