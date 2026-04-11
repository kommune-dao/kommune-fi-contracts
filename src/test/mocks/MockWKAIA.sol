// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal mock for WKAIA (Wrapped KAIA). 1:1 wrap/unwrap.
contract MockWKAIA is ERC20 {
    constructor() ERC20("Wrapped KAIA", "WKAIA") {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "WKAIA: transfer failed");
    }

    receive() external payable {
        _mint(msg.sender, msg.value);
    }
}
