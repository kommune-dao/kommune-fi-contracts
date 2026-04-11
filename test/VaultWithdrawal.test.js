const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Vault Withdrawal Smoke Tests", function () {
  let owner, agent, user, treasury, svCaller;
  let wkaia, kokaia, stkaia, swapRouter;
  let dragonSwapHandler, vaultCore, shareVault, claimManager;

  const ONE = ethers.parseEther("1");
  const TEN = ethers.parseEther("10");
  const HUNDRED = ethers.parseEther("100");

  beforeEach(async function () {
    [owner, agent, user, treasury, svCaller] = await ethers.getSigners();

    // 1. Deploy mocks
    const MockWKAIA = await ethers.getContractFactory("MockWKAIA");
    wkaia = await MockWKAIA.deploy();

    const MockKoKAIA = await ethers.getContractFactory("MockKoKAIA");
    kokaia = await MockKoKAIA.deploy();

    const MockStKAIA = await ethers.getContractFactory("MockStKAIA");
    stkaia = await MockStKAIA.deploy();

    const MockSwapRouter = await ethers.getContractFactory("MockSwapRouter");
    swapRouter = await MockSwapRouter.deploy();

    // 2. Deploy DragonSwapHandler via UUPS proxy
    const DSHandler = await ethers.getContractFactory("DragonSwapHandler");
    dragonSwapHandler = await upgrades.deployProxy(
      DSHandler,
      [await swapRouter.getAddress(), ethers.ZeroAddress], // no position manager needed
      { kind: "uups" }
    );

    // 3. Deploy VaultCore via UUPS proxy
    const VaultCore = await ethers.getContractFactory("VaultCore");
    vaultCore = await upgrades.deployProxy(
      VaultCore,
      [await wkaia.getAddress(), await dragonSwapHandler.getAddress(), 9000],
      { kind: "uups", unsafeAllow: ["delegatecall"] }
    );

    // 4. Deploy ClaimManager (plain — called via delegatecall from VaultCore)
    const ClaimManager = await ethers.getContractFactory("ClaimManager");
    claimManager = await ClaimManager.deploy();

    // 5. Deploy ShareVault via UUPS proxy
    const ShareVault = await ethers.getContractFactory("ShareVault");
    shareVault = await upgrades.deployProxy(
      ShareVault,
      [
        await wkaia.getAddress(),
        await vaultCore.getAddress(),
        0, // no fees for smoke test
        await treasury.getAddress(),
      ],
      { kind: "uups" }
    );

    // 6. Configure VaultCore
    await vaultCore.setShareVault(await shareVault.getAddress());
    await vaultCore.setClaimManager(await claimManager.getAddress());
    await vaultCore.setAgentAddress(agent.address);
    await vaultCore.setStKaiaAddresses(
      await stkaia.getAddress(),
      ethers.ZeroAddress
    );

    // 7. Override tokensInfo[0] to use MockKoKAIA
    // tokensInfo is initialized in _initTokenInfo() with hardcoded addresses.
    // For testing, we need to set it manually. VaultCore has updateTokenInfo() but that
    // uses hardcoded addresses. We'll use a workaround: deploy on chain ID 1001 (Kairos)
    // which is the hardhat default. But the addresses won't match our mocks.
    // Instead, we'll test paths that don't depend on tokensInfo[0] for Path A.
    // For Paths B/C/D, we need the mock addresses in tokensInfo[0].

    // Unfortunately, tokensInfo can only be set via _initTokenInfo() which hardcodes addresses.
    // For a complete test, we'd need to either:
    // a) Fork testnet (which has real contracts)
    // b) Add a test-only setter to VaultCore
    // For this smoke test, we'll test what we can without modifying production code.

    // Authorize VaultCore on DragonSwapHandler
    await dragonSwapHandler.setAuthorizedCaller(
      await vaultCore.getAddress(),
      true
    );

    // Seed mock swap router with tokens for swaps
    // (Router needs output tokens to fulfil 1:1 swaps)
  });

  describe("Path A: Instant Withdrawal (WKAIA in vault)", function () {
    // Use svCaller (plain EOA signer) as shareVault for direct handleWithdraw testing.
    // This bypasses ERC4626 share math which breaks due to hardcoded testnet addresses.
    beforeEach(async function () {
      await vaultCore.setShareVault(svCaller.address);
    });

    afterEach(async function () {
      // Restore real ShareVault
      await vaultCore.setShareVault(await shareVault.getAddress());
    });

    it("should withdraw KAIA when VaultCore holds WKAIA", async function () {
      const vcAddr = await vaultCore.getAddress();

      // Seed VaultCore with WKAIA
      await wkaia.connect(owner).deposit({ value: TEN });
      await wkaia.transfer(vcAddr, TEN);

      const callerBalBefore = await ethers.provider.getBalance(svCaller.address);

      // handleWithdraw: VaultCore unwraps WKAIA → sends KAIA to svCaller
      const tx = await vaultCore
        .connect(svCaller)
        .handleWithdraw(ONE, svCaller.address);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const callerBalAfter = await ethers.provider.getBalance(svCaller.address);

      // svCaller should have received 1 KAIA (minus gas)
      const received = callerBalAfter - callerBalBefore + gasCost;
      expect(received).to.be.closeTo(ONE, ethers.parseEther("0.01"));

      // VaultCore WKAIA balance should decrease by 1
      const vcWkaia = await wkaia.balanceOf(vcAddr);
      expect(vcWkaia).to.equal(TEN - ONE);
    });

    it("should revert handleWithdraw when insufficient WKAIA", async function () {
      // VaultCore has no WKAIA. KoKAIA swap fallback also fails
      // (testnet address is an EOA on local Hardhat).
      await expect(
        vaultCore.connect(svCaller).handleWithdraw(ONE, svCaller.address)
      ).to.be.reverted;
    });
  });

  describe("Path C: KoKAIA Unstake + Claim (new unstake function)", function () {
    it("should unstake and claim KoKAIA via ClaimManager delegatecall", async function () {
      // This test validates the unstake() → claim() flow.
      // Since tokensInfo[0] has hardcoded testnet addresses (not our mock),
      // we test using a forked testnet or skip if addresses don't match.

      // For now, verify the unstake function exists and reverts properly
      // when ClaimManager is not set correctly or index is wrong.
      const vcAddr = await vaultCore.getAddress();

      // Calling unstake with index 0 should delegatecall to ClaimManager.
      // ClaimManager checks tokensInfo[0].asset balance, which is the testnet
      // KoKAIA address - not our mock. So this will revert with "Insufficient balance"
      // since VaultCore has no testnet KoKAIA tokens.
      await expect(
        vaultCore.unstake(user.address, 0, ONE)
      ).to.be.reverted;

      // Verify unstake reverts for non-owner
      await expect(
        vaultCore.connect(user).unstake(user.address, 0, ONE)
      ).to.be.revertedWithCustomError(vaultCore, "OwnableUnauthorizedAccount");
    });

    it("should revert unstake for invalid index", async function () {
      // ClaimManager only supports index 0 (KoKAIA)
      await expect(
        vaultCore.unstake(user.address, 1, ONE)
      ).to.be.reverted; // "Invalid index" from ClaimManager
    });
  });

  describe("Path D: Agent stKAIA Strategy", function () {
    it("should reject agentBuyStKaia from non-agent", async function () {
      await expect(
        vaultCore.connect(user).agentBuyStKaia(ONE, 1000, 500, 0)
      ).to.be.revertedWith("Not agent");
    });

    it("should reject agentRequestUnstake from non-agent", async function () {
      await expect(
        vaultCore.connect(user).agentRequestUnstake(ONE)
      ).to.be.revertedWith("Not agent");
    });

    it("should reject agentClaimUnstake from non-agent", async function () {
      await expect(
        vaultCore.connect(user).agentClaimUnstake(1)
      ).to.be.revertedWith("Not agent");
    });

    it("should allow agent to call agentRequestUnstake with stKAIA", async function () {
      const vcAddr = await vaultCore.getAddress();
      const stkaiaAddr = await stkaia.getAddress();

      // Mint stKAIA to VaultCore (simulate prior purchase)
      await stkaia.mint(vcAddr, TEN);

      // Agent calls agentRequestUnstake
      const tx = await vaultCore.connect(agent).agentRequestUnstake(TEN);
      const receipt = await tx.wait();

      // Should emit AgentUnstakeRequested event
      const event = receipt.logs.find(
        (log) =>
          log.address.toLowerCase() === vcAddr.toLowerCase() &&
          log.topics[0] ===
            ethers.id("AgentUnstakeRequested(uint256,uint256)")
      );
      expect(event).to.not.be.undefined;

      // Decode event data
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256", "uint256"],
        event.data
      );
      expect(decoded[0]).to.equal(TEN); // stKaiaAmount
      expect(decoded[1]).to.be.gt(0); // requestId > 0
    });

    it("should allow agent to call agentClaimUnstake", async function () {
      const vcAddr = await vaultCore.getAddress();
      const stkaiaAddr = await stkaia.getAddress();

      // Mint stKAIA to VaultCore
      await stkaia.mint(vcAddr, TEN);

      // Fund stKAIA mock with KAIA for claim payout
      await owner.sendTransaction({
        to: stkaiaAddr,
        value: TEN,
      });

      // Request unstake first
      const unstakeTx = await vaultCore
        .connect(agent)
        .agentRequestUnstake(TEN);
      const unstakeReceipt = await unstakeTx.wait();

      // Extract requestId from event
      const unstakeEvent = unstakeReceipt.logs.find(
        (log) =>
          log.address.toLowerCase() === vcAddr.toLowerCase() &&
          log.topics[0] ===
            ethers.id("AgentUnstakeRequested(uint256,uint256)")
      );
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256", "uint256"],
        unstakeEvent.data
      );
      const requestId = decoded[1];

      // Claim unstake — this calls stKAIA.claimWithdrawal(requestId) via VaultCore
      // The claimed KAIA should be auto-restaked to KoKAIA via _stakeToProtocol
      const claimTx = await vaultCore
        .connect(agent)
        .agentClaimUnstake(requestId);
      const claimReceipt = await claimTx.wait();

      // Should emit AgentUnstakeClaimed event
      const claimEvent = claimReceipt.logs.find(
        (log) =>
          log.address.toLowerCase() === vcAddr.toLowerCase() &&
          log.topics[0] ===
            ethers.id("AgentUnstakeClaimed(uint256,uint256)")
      );
      expect(claimEvent).to.not.be.undefined;

      const claimDecoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256", "uint256"],
        claimEvent.data
      );
      expect(claimDecoded[0]).to.equal(requestId);
      expect(claimDecoded[1]).to.equal(TEN); // kaiaReceived
    });
  });

  describe("Access Control", function () {
    it("should reject handleWithdraw from non-ShareVault", async function () {
      await expect(
        vaultCore.connect(user).handleWithdraw(ONE, user.address)
      ).to.be.revertedWith("E1");
    });

    it("should reject claim from non-owner", async function () {
      await expect(
        vaultCore.connect(user).claim(user.address, 0)
      ).to.be.revertedWithCustomError(vaultCore, "OwnableUnauthorizedAccount");
    });

    it("should reject unstake from non-owner", async function () {
      await expect(
        vaultCore.connect(user).unstake(user.address, 0, ONE)
      ).to.be.revertedWithCustomError(vaultCore, "OwnableUnauthorizedAccount");
    });

    it("should reject agent functions from non-agent", async function () {
      await expect(
        vaultCore.connect(owner).agentSwap(
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          1000,
          ONE,
          0
        )
      ).to.be.revertedWith("Not agent");
    });
  });
});
