// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IWKaia {
    function deposit() external payable;
    function withdraw(uint256) external;
}

interface IVaultCore {
    function handleDeposit(uint256 amount, address depositor) external returns (bool);
    function handleDepositKAIA() external payable returns (bool);
    function handleWithdraw(uint256 amount, address owner) external returns (uint256);
    function handleInstantWithdraw(uint256 amount, address recipient) external returns (uint256);
    function handleInstantWithdrawAsKoKAIA(uint256 amount, address recipient) external returns (uint256);
    function handleInstantWithdrawAsLPTokens(uint256 amount, address recipient) external returns (uint256, uint256, uint256);
    function handleRedeem(uint256 shares, address owner) external returns (uint256);
    function totalAssets() external view returns (uint256);
}

/**
 * @title ShareVault
 * @notice The user-facing entry point for the Kommune Vault (ERC-4626 standard).
 * @dev Handles all Share (ERC20) logic: Minting, Burning, and Accounting.
 *      - User funds are forwarded to `VaultCore` for management.
 *      - `VaultCore` is the only entity authorized to send funds back for withdrawals.
 * @custom:security The `vaultCore` address is critical. If compromised, funds can be drained.
 */
contract ShareVault is ERC4626Upgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;
    
    // Core vault contract that manages actual assets
    address public vaultCore;
    
    // Fee parameters
    uint256 public basisPointsFees;
    address public treasury;
    
    // Deposit tracking
    struct DepositInfo {
        uint256 amount;
        uint256 timestamp;
    }
    mapping(address => DepositInfo) public deposits;
    mapping(address => uint256) public lastDepositBlock;
    uint256 public depositLimit;
    
    // Providers management
    address[] public providers;
    mapping(address => bool) public isProvider;
    
    // Depositor tracking (added at end for upgrade compatibility)
    uint256 public totalDepositors;
    
    // Events
    event VaultCoreUpdated(address indexed oldCore, address indexed newCore);
    event FeesUpdated(uint256 basisPoints);
    event TreasuryUpdated(address indexed treasury);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event WithdrawWithProvider(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares, address provider, uint256 providerFee);
    event InstantWithdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares, uint256 netAmount);
    event InstantWithdrawAsKoKAIA(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares, uint256 netKoKAIA);
    event InstantWithdrawAsLPTokens(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares, uint256 wkaiaAmount, uint256 kokaiaAmount);
    event PerformanceFeeUpdated(uint256 basisPoints);

    // Token addresses for ERC20 withdrawal modes
    address public kokaiaToken;
    address public wkaiaToken;

    // Performance fee: charged on profit only (e.g., 1000 = 10%)
    uint256 public performanceFeeBps;
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev Initialize the ShareVault
     */
    function initialize(
        address _asset,
        address _vaultCore,
        uint256 _basisPointsFees,
        address _treasury
    ) external initializer {
        __ERC20_init("Kommune Vault Kaia", "kvKAIA");
        __ERC4626_init(IERC20(_asset));
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        vaultCore = _vaultCore;
        basisPointsFees = _basisPointsFees;
        treasury = _treasury;
        depositLimit = 100 ether; // Default 100 WKAIA limit
    }
    
    /**
     * @dev Returns total assets managed by VaultCore
     */
    function totalAssets() public view override returns (uint256) {
        if (vaultCore == address(0)) {
            return IERC20(asset()).balanceOf(address(this));
        }
        // Call VaultCore to get total managed assets
        (bool success, bytes memory data) = vaultCore.staticcall(
            abi.encodeWithSignature("getTotalAssets()")
        );
        if (success && data.length > 0) {
            return abi.decode(data, (uint256));
        }
        return IERC20(asset()).balanceOf(address(this));
    }
    
    /**
     * @dev Track proportional deposit on share transfers.
     */
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && value > 0) {
            uint256 fromBalance = balanceOf(from);
            if (fromBalance > 0 && deposits[from].amount > 0) {
                uint256 proportional = (deposits[from].amount * value) / fromBalance;
                deposits[from].amount -= proportional;
                deposits[to].amount += proportional;
            }
        }
        super._update(from, to, value);
    }

    /**
     * @dev Calculate performance fee based on profit.
     * @param owner      Share owner
     * @param assets     Total asset value being withdrawn
     * @param shares     Shares being burned
     * @param sharesBurned Whether shares have already been burned (affects balanceOf)
     * @return feeAmount         The performance fee
     * @return proportionalDeposit  The cost-basis portion for deposit tracking
     */
    function _calcPerformanceFee(
        address owner,
        uint256 assets,
        uint256 shares,
        bool sharesBurned
    ) internal view returns (uint256 feeAmount, uint256 proportionalDeposit) {
        uint256 totalShares = sharesBurned
            ? balanceOf(owner) + shares
            : balanceOf(owner);

        proportionalDeposit = totalShares > 0
            ? (deposits[owner].amount * shares) / totalShares
            : 0;

        if (performanceFeeBps > 0 && treasury != address(0)) {
            uint256 profit = assets > proportionalDeposit ? assets - proportionalDeposit : 0;
            feeAmount = (profit * performanceFeeBps) / 10000;
        }
    }

    /**
     * @dev Internal helper to process deposit logic
     */
    function _processDeposit(uint256 assets, uint256 shares, address receiver, address caller) internal {
        require(deposits[caller].amount + assets <= depositLimit, "Limit exceeded");
        require(block.number > lastDepositBlock[caller], "Same block");
        require(vaultCore != address(0), "VaultCore not set");
        
        // Pull WKAIA from user to ShareVault
        IERC20(asset()).transferFrom(caller, address(this), assets);
        
        // Transfer WKAIA to VaultCore
        IERC20(asset()).transfer(vaultCore, assets);
        
        // Update tracking
        lastDepositBlock[caller] = block.number;
        
        // Track new depositors
        if (deposits[caller].amount == 0) {
            totalDepositors++;
        }
        
        deposits[caller].amount += assets;
        deposits[caller].timestamp = block.timestamp;
        
        // Call VaultCore to handle deposit
        bool success = IVaultCore(vaultCore).handleDeposit(assets, caller);
        require(success, "Core deposit failed");
        
        // Mint shares
        _mint(receiver, shares);
        
        emit Deposit(caller, receiver, assets, shares);
    }

    /**
     * @dev Deposit assets and receive shares (Standard ERC4626 Pattern)
     */
    function deposit(uint256 assets, address receiver) 
        public 
        virtual 
        override 
        nonReentrant 
        returns (uint256 shares) 
    {
        require(assets > 0, "Zero amount");
        shares = previewDeposit(assets);
        require(shares > 0, "Zero shares");
        
        _processDeposit(assets, shares, receiver, msg.sender);
        return shares;
    }
    
    /**
     * @dev Mint shares by depositing assets (Direct Deposit Pattern)
     */
    function mint(uint256 shares, address receiver)
        public
        virtual
        override
        nonReentrant
        returns (uint256 assets)
    {
        require(shares > 0, "Zero shares");
        assets = previewMint(shares);
        require(assets > 0, "Zero assets");

        _processDeposit(assets, shares, receiver, msg.sender);
        return assets;
    }

    /**
     * @dev Internal helper to execute withdrawal logic
     */
    function _executeWithdrawal(
        uint256 assets, 
        uint256 shares, 
        address receiver, 
        address owner, 
        address provider,
        address caller
    ) internal {
        // Check allowance if not owner
        if (caller != owner) {
            _spendAllowance(owner, caller, shares);
        }
        
        // Calculate performance fee (shares not yet burned)
        (uint256 feeAmount, uint256 proportionalDeposit) = _calcPerformanceFee(owner, assets, shares, false);
        uint256 netAssets = assets - feeAmount;
        uint256 providerFee = 0;
        uint256 treasuryFee = 0;

        if (feeAmount > 0) {
            if (provider != address(0) && isProvider[provider]) {
                providerFee = feeAmount / 3;
                treasuryFee = feeAmount - providerFee;
            } else {
                treasuryFee = feeAmount;
            }
        }
        
        // Request total assets (including fee) from VaultCore
        if (vaultCore != address(0)) {
            uint256 kaiaBefore = address(this).balance;
            
            (bool success,) = vaultCore.call(
                abi.encodeWithSignature("handleWithdraw(uint256,address)", assets, address(this))
            );
            require(success, "Core withdraw failed");
            
            // Check if we received KAIA
            uint256 kaiaReceived = address(this).balance - kaiaBefore;
            require(kaiaReceived == assets, "Incorrect KAIA amount received");
            
            // Transfer fees in KAIA
            if (providerFee > 0) {
                (bool providerSent, ) = provider.call{value: providerFee}("");
                require(providerSent, "Provider fee transfer failed");
            }
            if (treasuryFee > 0) {
                (bool treasurySent, ) = treasury.call{value: treasuryFee}("");
                require(treasurySent, "Treasury fee transfer failed");
            }
            
            // Transfer net amount to receiver in KAIA
            (bool receiverSent, ) = receiver.call{value: netAssets}("");
            require(receiverSent, "KAIA transfer to receiver failed");
        } else {
            // Fallback: transfer WKAIA from this contract
            uint256 wkaiaBalance = IERC20(asset()).balanceOf(address(this));
            if (wkaiaBalance >= assets) {
                IWKaia(asset()).withdraw(assets);
                
                if (providerFee > 0) {
                     (bool providerSent, ) = provider.call{value: providerFee}("");
                     require(providerSent, "Provider fee transfer failed");
                }
                if (treasuryFee > 0) {
                     (bool treasurySent, ) = treasury.call{value: treasuryFee}("");
                     require(treasurySent, "Treasury fee transfer failed");
                }
                
                (bool receiverSent, ) = receiver.call{value: netAssets}("");
                require(receiverSent, "KAIA transfer to receiver failed");
            } else {
                revert("Insufficient balance");
            }
        }
        
        // Burn shares
        _burn(owner, shares);
        
        // Update deposit tracking (subtract cost basis, not full assets)
        if (deposits[owner].amount >= proportionalDeposit) {
            deposits[owner].amount -= proportionalDeposit;
        } else {
            deposits[owner].amount = 0;
        }

        if (balanceOf(owner) == 0 && totalDepositors > 0) {
            totalDepositors--;
            deposits[owner].amount = 0;
        }

        if (provider != address(0) && isProvider[provider]) {
            emit WithdrawWithProvider(caller, receiver, owner, assets, shares, provider, providerFee);
        } else {
            emit Withdraw(caller, receiver, owner, assets, shares);
        }
    }
    
    /**
     * @dev Withdraw assets by burning shares (Standard ERC4626)
     */
    function withdraw(uint256 assets, address receiver, address owner)
        public
        virtual
        override
        returns (uint256 shares)
    {
        return withdrawWithProvider(assets, receiver, owner, address(0));
    }
    
    /**
     * @dev Withdraw assets with provider fee sharing
     */
    function withdrawWithProvider(uint256 assets, address receiver, address owner, address provider)
        public
        nonReentrant
        returns (uint256 shares)
    {
        require(assets > 0, "Zero amount");
        shares = previewWithdraw(assets);
        _executeWithdrawal(assets, shares, receiver, owner, provider, msg.sender);
        return shares;
    }
    
    /**
     * @dev Redeem shares for assets (Standard ERC4626)
     */
    function redeem(uint256 shares, address receiver, address owner)
        public
        virtual
        override
        returns (uint256 assets)
    {
        return redeemWithProvider(shares, receiver, owner, address(0));
    }
    
    /**
     * @dev Redeem shares with provider fee sharing
     */
    function redeemWithProvider(uint256 shares, address receiver, address owner, address provider)
        public
        nonReentrant
        returns (uint256 assets)
    {
        require(shares > 0, "Zero shares");
        assets = previewRedeem(shares);
        _executeWithdrawal(assets, shares, receiver, owner, provider, msg.sender);
        return assets;
    }
    
    /**
     * @notice Instant withdraw — deducts fee, sources WKAIA from LP/DEX.
     * @param assets The amount of assets to withdraw.
     * @param receiver The address receiving KAIA.
     * @param owner The share owner whose shares are burned.
     * @return shares The number of shares burned.
     */
    function instantWithdraw(uint256 assets, address receiver, address owner)
        public
        returns (uint256 shares)
    {
        return instantWithdrawWithProvider(assets, receiver, owner, address(0));
    }

    /**
     * @notice Instant withdraw with provider fee sharing.
     * @param assets The amount of assets to withdraw.
     * @param receiver The address receiving KAIA.
     * @param owner The share owner whose shares are burned.
     * @param provider The provider address (for fee split).
     * @return shares The number of shares burned.
     */
    function instantWithdrawWithProvider(uint256 assets, address receiver, address owner, address provider)
        public
        nonReentrant
        returns (uint256 shares)
    {
        require(assets > 0, "Zero amount");
        require(vaultCore != address(0), "VaultCore not set");

        shares = previewWithdraw(assets);

        // Check allowance if not owner
        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        // Burn shares first
        _burn(owner, shares);

        // Call VaultCore.handleInstantWithdraw — returns netAmount after instant withdraw fee
        uint256 kaiaBefore = address(this).balance;
        (bool success, bytes memory data) = vaultCore.call(
            abi.encodeWithSignature("handleInstantWithdraw(uint256,address)", assets, receiver)
        );
        require(success, "Instant withdraw failed");
        uint256 netAmount = abi.decode(data, (uint256));

        uint256 kaiaReceived = address(this).balance - kaiaBefore;
        require(kaiaReceived >= netAmount, "Insufficient KAIA");

        // Calculate performance fee (shares already burned)
        (uint256 feeAmount, uint256 proportionalDeposit) = _calcPerformanceFee(owner, assets, shares, true);
        uint256 providerFee = 0;
        uint256 treasuryFee = 0;
        uint256 userAmount = netAmount - feeAmount;

        if (feeAmount > 0) {
            if (provider != address(0) && isProvider[provider]) {
                providerFee = feeAmount / 3;
                treasuryFee = feeAmount - providerFee;
            } else {
                treasuryFee = feeAmount;
            }
        }

        // Distribute KAIA
        if (providerFee > 0) {
            (bool providerSent, ) = provider.call{value: providerFee}("");
            require(providerSent, "Provider fee failed");
        }
        if (treasuryFee > 0) {
            (bool treasurySent, ) = treasury.call{value: treasuryFee}("");
            require(treasurySent, "Treasury fee failed");
        }
        (bool receiverSent, ) = receiver.call{value: userAmount}("");
        require(receiverSent, "Transfer to receiver failed");

        // Update deposit tracking (subtract cost basis, not full assets)
        if (deposits[owner].amount >= proportionalDeposit) {
            deposits[owner].amount -= proportionalDeposit;
        } else {
            deposits[owner].amount = 0;
        }
        if (balanceOf(owner) == 0 && totalDepositors > 0) {
            totalDepositors--;
            deposits[owner].amount = 0;
        }

        emit InstantWithdraw(msg.sender, receiver, owner, assets, shares, userAmount);
    }

    /**
     * @notice Instant withdraw receiving KoKAIA directly (no swap).
     * @param assets The amount of assets to withdraw.
     * @param receiver The address receiving KoKAIA.
     * @param owner The share owner whose shares are burned.
     * @return shares The number of shares burned.
     */
    function instantWithdrawAsKoKAIA(uint256 assets, address receiver, address owner)
        public
        returns (uint256 shares)
    {
        return instantWithdrawAsKoKAIAWithProvider(assets, receiver, owner, address(0));
    }

    /**
     * @notice Instant withdraw receiving KoKAIA with provider fee sharing.
     * @param assets The amount of assets to withdraw.
     * @param receiver The address receiving KoKAIA.
     * @param owner The share owner whose shares are burned.
     * @param provider The provider address (for fee split).
     * @return shares The number of shares burned.
     */
    function instantWithdrawAsKoKAIAWithProvider(uint256 assets, address receiver, address owner, address provider)
        public
        nonReentrant
        returns (uint256 shares)
    {
        require(assets > 0, "Zero amount");
        require(vaultCore != address(0), "VaultCore not set");
        require(kokaiaToken != address(0), "KoKAIA not set");

        shares = previewWithdraw(assets);

        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        _burn(owner, shares);

        // Call VaultCore.handleInstantWithdrawAsKoKAIA
        uint256 kokaiaBefore = IERC20(kokaiaToken).balanceOf(address(this));
        (bool success, bytes memory data) = vaultCore.call(
            abi.encodeWithSignature("handleInstantWithdrawAsKoKAIA(uint256,address)", assets, receiver)
        );
        require(success, "Instant withdraw KoKAIA failed");
        uint256 netAmount = abi.decode(data, (uint256));

        uint256 kokaiaReceived = IERC20(kokaiaToken).balanceOf(address(this)) - kokaiaBefore;
        require(kokaiaReceived >= netAmount, "Insufficient KoKAIA received");

        // Calculate performance fee (shares already burned)
        (uint256 feeAmount, uint256 proportionalDeposit) = _calcPerformanceFee(owner, assets, shares, true);
        uint256 providerFee = 0;
        uint256 treasuryFee = 0;
        uint256 userAmount = netAmount - feeAmount;

        if (feeAmount > 0) {
            if (provider != address(0) && isProvider[provider]) {
                providerFee = feeAmount / 3;
                treasuryFee = feeAmount - providerFee;
            } else {
                treasuryFee = feeAmount;
            }
        }

        // Distribute KoKAIA
        if (providerFee > 0) {
            IERC20(kokaiaToken).safeTransfer(provider, providerFee);
        }
        if (treasuryFee > 0) {
            IERC20(kokaiaToken).safeTransfer(treasury, treasuryFee);
        }
        IERC20(kokaiaToken).safeTransfer(receiver, userAmount);

        // Update deposit tracking (subtract cost basis, not full assets)
        if (deposits[owner].amount >= proportionalDeposit) {
            deposits[owner].amount -= proportionalDeposit;
        } else {
            deposits[owner].amount = 0;
        }
        if (balanceOf(owner) == 0 && totalDepositors > 0) {
            totalDepositors--;
            deposits[owner].amount = 0;
        }

        emit InstantWithdrawAsKoKAIA(msg.sender, receiver, owner, assets, shares, userAmount);
    }

    /**
     * @notice Instant withdraw receiving LP components (WKAIA + KoKAIA).
     * @param assets The amount of assets to withdraw.
     * @param receiver The address receiving WKAIA + KoKAIA.
     * @param owner The share owner whose shares are burned.
     * @return shares The number of shares burned.
     */
    function instantWithdrawAsLPTokens(uint256 assets, address receiver, address owner)
        public
        returns (uint256 shares)
    {
        return instantWithdrawAsLPTokensWithProvider(assets, receiver, owner, address(0));
    }

    /**
     * @notice Instant withdraw receiving LP components with provider fee sharing.
     * @param assets The amount of assets to withdraw.
     * @param receiver The address receiving WKAIA + KoKAIA.
     * @param owner The share owner whose shares are burned.
     * @param provider The provider address (for fee split).
     * @return shares The number of shares burned.
     */
    function instantWithdrawAsLPTokensWithProvider(uint256 assets, address receiver, address owner, address provider)
        public
        nonReentrant
        returns (uint256 shares)
    {
        require(assets > 0, "Zero amount");
        require(vaultCore != address(0), "VaultCore not set");
        require(wkaiaToken != address(0), "WKAIA not set");
        require(kokaiaToken != address(0), "KoKAIA not set");

        shares = previewWithdraw(assets);

        if (msg.sender != owner) {
            _spendAllowance(owner, msg.sender, shares);
        }

        _burn(owner, shares);

        // Call VaultCore.handleInstantWithdrawAsLPTokens
        uint256 wkaiaBefore = IERC20(wkaiaToken).balanceOf(address(this));
        uint256 kokaiaBefore = IERC20(kokaiaToken).balanceOf(address(this));

        (bool success, bytes memory data) = vaultCore.call(
            abi.encodeWithSignature("handleInstantWithdrawAsLPTokens(uint256,address)", assets, receiver)
        );
        require(success, "Instant withdraw LP failed");
        (, uint256 wkaiaFromCore, uint256 kokaiaFromCore) = abi.decode(data, (uint256, uint256, uint256));

        uint256 wkaiaReceived = IERC20(wkaiaToken).balanceOf(address(this)) - wkaiaBefore;
        uint256 kokaiaReceived = IERC20(kokaiaToken).balanceOf(address(this)) - kokaiaBefore;
        require(wkaiaReceived >= wkaiaFromCore && kokaiaReceived >= kokaiaFromCore, "Insufficient LP tokens");

        // Calculate performance fee (shares already burned), apply proportionally to each token
        (uint256 feeAmount, uint256 proportionalDeposit) = _calcPerformanceFee(owner, assets, shares, true);
        uint256 wkaiaUser = wkaiaReceived;
        uint256 kokaiaUser = kokaiaReceived;

        if (feeAmount > 0) {
            uint256 totalReceived = wkaiaReceived + kokaiaReceived;
            uint256 wkaiaFee = totalReceived > 0 ? (feeAmount * wkaiaReceived) / totalReceived : 0;
            uint256 kokaiaFee = feeAmount > wkaiaFee ? feeAmount - wkaiaFee : 0;
            if (wkaiaFee > wkaiaReceived) wkaiaFee = wkaiaReceived;
            if (kokaiaFee > kokaiaReceived) kokaiaFee = kokaiaReceived;
            wkaiaUser = wkaiaReceived - wkaiaFee;
            kokaiaUser = kokaiaReceived - kokaiaFee;

            uint256 wkaiaProviderFee = 0;
            uint256 kokaiaProviderFee = 0;

            if (provider != address(0) && isProvider[provider]) {
                wkaiaProviderFee = wkaiaFee / 3;
                kokaiaProviderFee = kokaiaFee / 3;
                if (wkaiaProviderFee > 0) IERC20(wkaiaToken).safeTransfer(provider, wkaiaProviderFee);
                if (kokaiaProviderFee > 0) IERC20(kokaiaToken).safeTransfer(provider, kokaiaProviderFee);
                wkaiaFee -= wkaiaProviderFee;
                kokaiaFee -= kokaiaProviderFee;
            }

            if (wkaiaFee > 0) IERC20(wkaiaToken).safeTransfer(treasury, wkaiaFee);
            if (kokaiaFee > 0) IERC20(kokaiaToken).safeTransfer(treasury, kokaiaFee);
        }

        // Transfer to receiver
        if (wkaiaUser > 0) IERC20(wkaiaToken).safeTransfer(receiver, wkaiaUser);
        if (kokaiaUser > 0) IERC20(kokaiaToken).safeTransfer(receiver, kokaiaUser);

        // Update deposit tracking (subtract cost basis, not full assets)
        if (deposits[owner].amount >= proportionalDeposit) {
            deposits[owner].amount -= proportionalDeposit;
        } else {
            deposits[owner].amount = 0;
        }
        if (balanceOf(owner) == 0 && totalDepositors > 0) {
            totalDepositors--;
            deposits[owner].amount = 0;
        }

        emit InstantWithdrawAsLPTokens(msg.sender, receiver, owner, assets, shares, wkaiaUser, kokaiaUser);
    }

    /**
     * @dev Receive KAIA from VaultCore for withdrawal distribution
     */
    receive() external payable {
        // Only accept KAIA from VaultCore
        require(msg.sender == vaultCore, "Only VaultCore");
    }
    
    /**
     * @dev Native KAIA deposit (payable)
     */
    function depositKAIA(address receiver) external payable nonReentrant returns (uint256 shares) {
        require(msg.value > 0, "Zero amount");
        require(deposits[msg.sender].amount + msg.value <= depositLimit, "Limit exceeded");
        require(block.number > lastDepositBlock[msg.sender], "Same block");
        
        uint256 assets = msg.value;
        shares = previewDeposit(assets);
        require(shares > 0, "Zero shares");
        
        // Update tracking
        lastDepositBlock[msg.sender] = block.number;
        if (deposits[msg.sender].amount == 0) totalDepositors++;
        deposits[msg.sender].amount += assets;
        deposits[msg.sender].timestamp = block.timestamp;
        
        // Send KAIA to VaultCore
        if (vaultCore != address(0)) {
            (bool success, bytes memory data) = vaultCore.call{value: assets}(
                abi.encodeWithSignature("handleDepositKAIA()")
            );
            if (!success) {
                if (data.length > 0) {
                    assembly {
                        let returndata_size := mload(data)
                        revert(add(32, data), returndata_size)
                    }
                } else {
                    revert("Core KAIA deposit failed");
                }
            }
        }
        
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, shares);
        return shares;
    }
    
    // Admin functions
    
    function setVaultCore(address _vaultCore) external onlyOwner {
        require(_vaultCore != address(0), "Invalid address");
        address oldCore = vaultCore;
        vaultCore = _vaultCore;
        emit VaultCoreUpdated(oldCore, _vaultCore);
    }
    
    function setFees(uint256 _basisPointsFees) external onlyOwner {
        require(_basisPointsFees <= 10000, "Invalid fee");
        basisPointsFees = _basisPointsFees;
        emit FeesUpdated(_basisPointsFees);
    }
    
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }
    
    function setDepositLimit(uint256 _limit) external onlyOwner {
        depositLimit = _limit;
    }

    function setTokenAddresses(address _kokaia, address _wkaia) external onlyOwner {
        kokaiaToken = _kokaia;
        wkaiaToken = _wkaia;
    }

    function setPerformanceFeeBps(uint256 _performanceFeeBps) external onlyOwner {
        require(_performanceFeeBps <= 5000, "Max 50%");
        performanceFeeBps = _performanceFeeBps;
        emit PerformanceFeeUpdated(_performanceFeeBps);
    }
    
    // Provider management functions
    
    /**
     * @dev Add a new provider address
     * @param provider Address to add as provider
     */
    function addProvider(address provider) external onlyOwner {
        require(provider != address(0), "Invalid address");
        require(!isProvider[provider], "Already provider");
        
        providers.push(provider);
        isProvider[provider] = true;
        
        emit ProviderAdded(provider);
    }
    
    /**
     * @dev Remove a provider address
     * @param provider Address to remove from providers
     */
    function removeProvider(address provider) external onlyOwner {
        require(isProvider[provider], "Not a provider");
        
        isProvider[provider] = false;
        
        // Remove from array
        for (uint256 i = 0; i < providers.length; i++) {
            if (providers[i] == provider) {
                providers[i] = providers[providers.length - 1];
                providers.pop();
                break;
            }
        }
        
        emit ProviderRemoved(provider);
    }
    
    /**
     * @dev Get all provider addresses
     * @return Array of provider addresses
     */
    function getProviders() external view returns (address[] memory) {
        return providers;
    }
    
    /**
     * @dev Get number of providers
     * @return Number of providers
     */
    function getProvidersCount() external view returns (uint256) {
        return providers.length;
    }
    
    // Version tracking for upgrades
    function version() public pure returns (string memory) {
        return "2.2.0"; // Performance fee on profit
    }
    
    // Required for UUPS
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}