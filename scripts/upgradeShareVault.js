const { ethers } = require("hardhat");

/**
 * Upgrade ShareVault implementation (performance fee).
 * Deploys once, upgrades all 3 profiles, configures performanceFeeBps.
 *
 * Usage:
 *   npx hardhat run scripts/upgradeShareVault.js --network kaia
 */
async function main() {
    const [deployer] = await ethers.getSigners();
    const provider = ethers.provider;
    const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

    console.log("=== ShareVault Performance Fee Upgrade ===");
    console.log("Deployer:", deployer.address);
    console.log("Balance:", ethers.formatEther(await provider.getBalance(deployer.address)), "KAIA\n");

    // Deploy new ShareVault implementation
    console.log("[1/3] Deploying ShareVault implementation...");
    const ShareVault = await ethers.getContractFactory("ShareVault");
    const svImpl = await ShareVault.deploy();
    await svImpl.waitForDeployment();
    const svImplAddr = await svImpl.getAddress();
    console.log("  New impl:", svImplAddr);

    // Verify: check for performanceFeeBps selector
    const svCode = await provider.getCode(svImplAddr);
    const hasPerformanceFee = svCode.toLowerCase().includes(
        ethers.id("setPerformanceFeeBps(uint256)").slice(2, 10)
    );
    const hasCalcFee = svCode.toLowerCase().includes(
        ethers.id("performanceFeeBps()").slice(2, 10)
    );
    console.log("  Has setPerformanceFeeBps:", hasPerformanceFee);
    console.log("  Has performanceFeeBps:", hasCalcFee);

    if (!hasPerformanceFee) {
        console.error("  ERROR: New function not found in bytecode!");
        process.exit(1);
    }

    const profiles = [
        { name: "stable",     sv: "0x7a801555A3c489652ce88D6E0768FA75E699088D" },
        { name: "balanced",   sv: "0x2ec03439830f5da9d539C4537846C3708F232c77" },
        { name: "aggressive", sv: "0x8663b23E3a4ECd9ED6424854656CC5463C11C197" },
    ];

    // Upgrade all profiles
    console.log("\n[2/3] Upgrading ShareVault proxies...\n");
    const upgradeAbi = ["function upgradeToAndCall(address,bytes) external"];

    for (const p of profiles) {
        const proxy = new ethers.Contract(p.sv, upgradeAbi, deployer);
        try {
            const tx = await proxy.upgradeToAndCall(svImplAddr, "0x", { gasLimit: 500000 });
            const receipt = await tx.wait();
            const implAfter = "0x" + (await provider.getStorage(p.sv, implSlot)).slice(26);
            console.log(`  ${p.name}: ${receipt.status === 1 ? "SUCCESS" : "FAILED"} → ${implAfter}`);
        } catch (e) {
            console.error(`  ${p.name}: FAILED - ${e.message.slice(0, 80)}`);
        }
    }

    // Configure: set performanceFeeBps=1000 (10%), basisPointsFees=0
    console.log("\n[3/3] Configuring performance fee...\n");
    const configAbi = [
        "function setPerformanceFeeBps(uint256) external",
        "function setFees(uint256) external",
        "function performanceFeeBps() view returns (uint256)",
        "function basisPointsFees() view returns (uint256)",
        "function version() view returns (string)",
    ];

    for (const p of profiles) {
        const sv = new ethers.Contract(p.sv, configAbi, deployer);
        try {
            // Set performance fee to 10%
            const tx1 = await sv.setPerformanceFeeBps(1000, { gasLimit: 100000 });
            await tx1.wait();

            // Disable flat fee
            const tx2 = await sv.setFees(0, { gasLimit: 100000 });
            await tx2.wait();

            const perfFee = await sv.performanceFeeBps();
            const flatFee = await sv.basisPointsFees();
            const ver = await sv.version();
            console.log(`  ${p.name}: performanceFeeBps=${perfFee}, basisPointsFees=${flatFee}, version=${ver}`);
        } catch (e) {
            console.error(`  ${p.name}: CONFIG FAILED - ${e.message.slice(0, 80)}`);
        }
    }

    console.log("\nBalance after:", ethers.formatEther(await provider.getBalance(deployer.address)), "KAIA");
    console.log("=== Done ===");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
