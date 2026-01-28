const { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const { contracts, basisPointsFees } = require("../config/constants");
const { ChainId } = require("../config/config");

async function main() {
    console.log("🔐 AUDIT DEPLOYMENT (Clean State)");
    console.log("════════════════════════════════════════════════\n");

    const [deployer] = await ethers.getSigners();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const networkName = chainId === 8217n ? "kaia" : "kairos";
    const chainIdEnum = chainId === 8217n ? ChainId.KAIA : ChainId.KAIROS;

    // Profile: Stable (Audit Baseline)
    // 100% Invested in LSTs, 0% in Liquidity Pools
    const currentInvestRatio = 10000;
    const currentBalancedRatio = 0;

    // Constants
    const WKAIA = contracts.wkaia[chainIdEnum];
    const TREASURY = contracts.treasury[chainIdEnum];
    const ROUTER = contracts.dragonSwapRouter[chainIdEnum];
    const MANAGER = contracts.dragonSwapPositionManager[chainIdEnum];

    console.log("📍 Configuration:");
    console.log("  Network:", networkName);
    console.log("  Deployer:", deployer.address);
    console.log("  WKAIA:", WKAIA);
    console.log("  Treasury:", TREASURY);
    console.log("");

    const newDeployments = {};

    // 1. Deploy ClaimManager
    console.log("1️⃣ Deploying ClaimManager...");
    const ClaimManager = await ethers.getContractFactory("ClaimManager");
    const claimManager = await ClaimManager.deploy();
    await claimManager.waitForDeployment();
    newDeployments.claimManager = await claimManager.getAddress();
    console.log("   ✅ ClaimManager:", newDeployments.claimManager);

    // 2. Deploy DragonSwapHandler
    console.log("\n2️⃣ Deploying DragonSwapHandler...");
    const DragonSwapHandler = await ethers.getContractFactory("DragonSwapHandler");
    const dragonSwapHandler = await upgrades.deployProxy(
        DragonSwapHandler,
        [ROUTER, MANAGER],
        { initializer: 'initialize', kind: 'uups' }
    );
    await dragonSwapHandler.waitForDeployment();
    newDeployments.dragonSwapHandler = await dragonSwapHandler.getAddress();
    console.log("   ✅ DragonSwapHandler:", newDeployments.dragonSwapHandler);

    // 3. Deploy VaultCore
    console.log("\n3️⃣ Deploying VaultCore...");
    const VaultCore = await ethers.getContractFactory("VaultCore");
    const vaultCore = await upgrades.deployProxy(
        VaultCore,
        [WKAIA, newDeployments.dragonSwapHandler, currentInvestRatio],
        {
            initializer: 'initialize',
            kind: 'uups',
            unsafeAllow: ["delegatecall"]
        }
    );
    await vaultCore.waitForDeployment();
    newDeployments.vaultCore = await vaultCore.getAddress();
    console.log("   ✅ VaultCore:", newDeployments.vaultCore);

    // 4. Deploy ShareVault
    console.log("\n4️⃣ Deploying ShareVault...");
    const ShareVault = await ethers.getContractFactory("ShareVault");
    const shareVault = await upgrades.deployProxy(
        ShareVault,
        [WKAIA, newDeployments.vaultCore, basisPointsFees, TREASURY],
        { initializer: 'initialize', kind: 'uups' }
    );
    await shareVault.waitForDeployment();
    newDeployments.shareVault = await shareVault.getAddress();
    console.log("   ✅ ShareVault:", newDeployments.shareVault);

    // 5. Wiring Contracts
    console.log("\n5️⃣ Wiring Contracts...");

    console.log("   Setting ShareVault in VaultCore...");
    await vaultCore.setShareVault(newDeployments.shareVault);

    console.log("   Setting ClaimManager in VaultCore...");
    await vaultCore.setClaimManager(newDeployments.claimManager);

    console.log("   Authorizing VaultCore in Handler...");
    await dragonSwapHandler.setAuthorizedCaller(newDeployments.vaultCore, true);

    // 6. Save Deployments
    const filename = `deployments/${networkName === 'kaia' ? 'mainnet' : 'testnet'}/audit-${networkName}.json`;
    const deploymentData = {
        ...newDeployments,
        chainId: chainId.toString(),
        network: networkName,
        deployedAt: new Date().toISOString(),
        configuration: {
            investRatio: currentInvestRatio,
            basisPointsFees
        }
    };

    fs.mkdirSync(filename.substring(0, filename.lastIndexOf('/')), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(deploymentData, null, 2));
    console.log(`\n✅ Deployment saved to ${filename}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
