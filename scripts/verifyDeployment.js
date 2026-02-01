const { ethers } = require("hardhat");

/**
 * Comprehensive verification of the Instant Withdraw upgrade deployment.
 */
async function main() {
    const d = require("../deployments/testnet/audit-kairos.json");
    const provider = ethers.provider;
    const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

    console.log("=== Kairos Testnet Deployment Verification ===\n");

    // ── Implementation addresses ──
    const vcImpl = "0x" + (await provider.getStorage(d.vaultCore, implSlot)).slice(26);
    const svImpl = "0x" + (await provider.getStorage(d.shareVault, implSlot)).slice(26);
    console.log("VaultCore proxy:", d.vaultCore);
    console.log("VaultCore impl:", vcImpl);
    console.log("ShareVault proxy:", d.shareVault);
    console.log("ShareVault impl:", svImpl);

    // ── VaultCore checks ──
    console.log("\n--- VaultCore ---");
    const vcAbi = [
        "function owner() view returns (address)",
        "function shareVault() view returns (address)",
        "function wkaia() view returns (address)",
        "function instantWithdrawFeeBps() view returns (uint256)",
        "function getTotalAssets() view returns (uint256)",
        "function investRatio() view returns (uint256)",
        "function handleInstantWithdrawAsKoKAIA(uint256,address) external returns (uint256)",
        "function handleInstantWithdrawAsLPTokens(uint256,address) external returns (uint256,uint256,uint256)"
    ];
    const vc = new ethers.Contract(d.vaultCore, vcAbi, provider);

    const checks = [
        ["owner", () => vc.owner()],
        ["shareVault", () => vc.shareVault()],
        ["wkaia", () => vc.wkaia()],
        ["instantWithdrawFeeBps", () => vc.instantWithdrawFeeBps().then(v => v.toString())],
        ["getTotalAssets", () => vc.getTotalAssets().then(v => ethers.formatEther(v))],
        ["investRatio", () => vc.investRatio().then(v => v.toString())],
    ];

    for (const [name, fn] of checks) {
        try {
            console.log(`  ${name}: ${await fn()}`);
        } catch (e) {
            console.log(`  ${name}: ERROR - ${e.message.slice(0, 80)}`);
        }
    }

    // Check new function selectors in bytecode
    const vcCode = await provider.getCode(vcImpl);
    const newVcFns = [
        "setInstantWithdrawFee(uint256)",
        "handleInstantWithdrawAsKoKAIA(uint256,address)",
        "handleInstantWithdrawAsLPTokens(uint256,address)",
    ];
    for (const fn of newVcFns) {
        const sel = ethers.id(fn).slice(2, 10);
        const found = vcCode.toLowerCase().includes(sel);
        console.log(`  ${found ? "✓" : "✗"} ${fn}`);
    }

    // ── ShareVault checks ──
    console.log("\n--- ShareVault ---");
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
    const sv = new ethers.Contract(d.shareVault, svAbi, provider);

    const svChecks = [
        ["owner", () => sv.owner()],
        ["vaultCore", () => sv.vaultCore()],
        ["treasury", () => sv.treasury()],
        ["basisPointsFees", () => sv.basisPointsFees().then(v => v.toString())],
        ["kokaiaToken", () => sv.kokaiaToken()],
        ["wkaiaToken", () => sv.wkaiaToken()],
        ["totalAssets", () => sv.totalAssets().then(v => ethers.formatEther(v))],
        ["totalSupply", () => sv.totalSupply().then(v => ethers.formatEther(v))],
    ];

    for (const [name, fn] of svChecks) {
        try {
            console.log(`  ${name}: ${await fn()}`);
        } catch (e) {
            console.log(`  ${name}: ERROR - ${e.message.slice(0, 80)}`);
        }
    }

    // Check new function selectors in bytecode
    const svCode = await provider.getCode(svImpl);
    const newSvFns = [
        "setTokenAddresses(address,address)",
        "instantWithdrawAsKoKAIA(uint256,address,address)",
        "instantWithdrawAsKoKAIAWithProvider(uint256,address,address,address)",
        "instantWithdrawAsLPTokens(uint256,address,address)",
        "instantWithdrawAsLPTokensWithProvider(uint256,address,address,address)",
    ];
    for (const fn of newSvFns) {
        const sel = ethers.id(fn).slice(2, 10);
        const found = svCode.toLowerCase().includes(sel);
        console.log(`  ${found ? "✓" : "✗"} ${fn}`);
    }

    console.log("\n=== Verification Complete ===");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
