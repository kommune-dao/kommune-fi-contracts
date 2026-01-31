// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal mock for KoKAIA liquid staking. 1:1 stake/unstake/claim.
contract MockKoKAIA is ERC20 {
    mapping(address => uint256) public pendingUnstake;

    constructor() ERC20("KoKAIA", "KoKAIA") {}

    /// @dev Stake KAIA → mint KoKAIA 1:1.
    function stake() external payable {
        _mint(msg.sender, msg.value);
    }

    /// @dev Request unstake (burns KoKAIA, records pending).
    function unstake(uint256 amount) external {
        _burn(msg.sender, amount);
        pendingUnstake[msg.sender] += amount;
    }

    /// @dev Claim sends KAIA to the user.
    function claim(address user) external {
        uint256 amount = pendingUnstake[user];
        require(amount > 0, "Nothing to claim");
        pendingUnstake[user] = 0;
        (bool ok,) = user.call{value: amount}("");
        require(ok, "Claim transfer failed");
    }

    function getKlayByShares(uint256 amount) external pure returns (uint256) {
        return amount;
    }

    function getSharesByKlay(uint256 amount) external pure returns (uint256) {
        return amount;
    }

    receive() external payable {}
}
