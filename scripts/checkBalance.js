const { ethers } = require("hardhat");

async function main() {
    const [signer] = await ethers.getSigners();
    const bal = await ethers.provider.getBalance(signer.address);
    console.log("KAIA Balance:", ethers.formatEther(bal));

    // Check WKAIA too
    const WKAIA = "0x043c471bEe060e00A56CcD02c0Ca286808a5A436";
    const wkaia = await ethers.getContractAt("IWKaia", WKAIA, signer);
    const wbal = await wkaia.balanceOf(signer.address);
    console.log("WKAIA Balance:", ethers.formatEther(wbal));
}

main().catch(console.error);
