// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal mock for stKAIA. Supports requestWithdrawal / claimWithdrawal.
contract MockStKAIA is ERC20 {
    uint256 public nextRequestId;
    mapping(uint256 => uint256) public requestAmounts;
    mapping(uint256 => address) public requestOwners;

    constructor() ERC20("stKAIA", "stKAIA") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function requestWithdrawal(uint256 amount) external returns (uint256 requestId) {
        _burn(msg.sender, amount);
        requestId = ++nextRequestId;
        requestAmounts[requestId] = amount;
        requestOwners[requestId] = msg.sender;
    }

    function claimWithdrawal(uint256 requestId) external {
        uint256 amount = requestAmounts[requestId];
        require(amount > 0, "No request");
        address owner = requestOwners[requestId];
        requestAmounts[requestId] = 0;
        (bool ok,) = owner.call{value: amount}("");
        require(ok, "Claim failed");
    }

    receive() external payable {}
}
