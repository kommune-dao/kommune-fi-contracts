const { ethers } = require("hardhat");

/**
 * Comprehensive mainnet verification for all 3 profiles.
 */
async function main() {
    const provider = ethers.provider;
    const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

    const profiles = [
        { name: "stable", file: "../deployments/mainnet/audit-kaia-stable.json" },
        { name: "balanced", file: "../deployments/mainnet/audit-kaia-balanced.json" },
        { name: "aggressive", file: "../deployments/mainnet/audit-kaia-aggressive.json" },
    ];

    const vcAbi = [
        "function owner() view returns (address)",
        "function shareVault() view returns (address)",
        "function wkaia() view returns (address)",
        "function instantWithdrawFeeBps() view returns (uint256)",
        "function getTotalAssets() view returns (uint256)",
        "function investRatio() view returns (uint256)",
    ];

    const svAbi = [
        "function owner() view returns (address)",
        "function vaultCore() view returns (address)",
        "function treasury() view returns (address)",
        "function basisPointsFees() view returns (uint256)",
        "function kokaiaToken() view returns (address)",
        "function wkaiaToken() view returns (address)",
        "function totalAssets() view returns (uint256)",
        "function totalSupply() view returns (uint256)",
    ];

    const newVcFns = [
        "setInstantWithdrawFee(uint256)",
        "handleInstantWithdrawAsKoKAIA(uint256,address)",
        "handleInstantWithdrawAsLPTokens(uint256,address)",
    ];
    const newSvFns = [
        "setTokenAddresses(address,address)",
        "instantWithdrawAsKoKAIA(uint256,address,address)",
        "instantWithdrawAsKoKAIAWithProvider(uint256,address,address,address)",
        "instantWithdrawAsLPTokens(uint256,address,address)",
        "instantWithdrawAsLPTokensWithProvider(uint256,address,address,address)",
    ];

    console.log("=== Mainnet Deployment Verification ===\n");

    for (const profile of profiles) {
        const d = require(profile.file);
        console.log(`${"=".repeat(50)}`);
        console.log(`  ${profile.name.toUpperCase()} VAULT`);
        console.log(`${"=".repeat(50)}`);

        const vcImpl = "0x" + (await provider.getStorage(d.vaultCore, implSlot)).slice(26);
        const svImpl = "0x" + (await provider.getStorage(d.shareVault, implSlot)).slice(26);

        console.log("\n  VaultCore proxy:", d.vaultCore);
        console.log("  VaultCore impl:", vcImpl);

        const vc = new ethers.Contract(d.vaultCore, vcAbi, provider);
        for (const [name, fn] of [
            ["owner", () => vc.owner()],
            ["shareVault", () => vc.shareVault()],
            ["wkaia", () => vc.wkaia()],
            ["instantWithdrawFeeBps", () => vc.instantWithdrawFeeBps().then(v => v.toString())],
            ["getTotalAssets", () => vc.getTotalAssets().then(v => ethers.formatEther(v) + " KAIA")],
        ]) {
            try { console.log(`    ${name}: ${await fn()}`); }
            catch { console.log(`    ${name}: ERROR`); }
        }

        // Check VaultCore new selectors
        const vcCode = await provider.getCode(vcImpl);
        for (const fn of newVcFns) {
            const sel = ethers.id(fn).slice(2, 10);
            console.log(`    ${vcCode.toLowerCase().includes(sel) ? "✓" : "✗"} ${fn}`);
        }

        console.log("\n  ShareVault proxy:", d.shareVault);
        console.log("  ShareVault impl:", svImpl);

        const sv = new ethers.Contract(d.shareVault, svAbi, provider);
        for (const [name, fn] of [
            ["owner", () => sv.owner()],
            ["vaultCore", () => sv.vaultCore()],
            ["treasury", () => sv.treasury()],
            ["basisPointsFees", () => sv.basisPointsFees().then(v => v.toString())],
            ["kokaiaToken", () => sv.kokaiaToken()],
            ["wkaiaToken", () => sv.wkaiaToken()],
            ["totalAssets", () => sv.totalAssets().then(v => ethers.formatEther(v) + " KAIA")],
            ["totalSupply", () => sv.totalSupply().then(v => ethers.formatEther(v) + " shares")],
        ]) {
            try { console.log(`    ${name}: ${await fn()}`); }
            catch { console.log(`    ${name}: ERROR`); }
        }

        // Check ShareVault new selectors
        const svCode = await provider.getCode(svImpl);
        for (const fn of newSvFns) {
            const sel = ethers.id(fn).slice(2, 10);
            console.log(`    ${svCode.toLowerCase().includes(sel) ? "✓" : "✗"} ${fn}`);
        }

        console.log();
    }

    console.log("=== Verification Complete ===");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
