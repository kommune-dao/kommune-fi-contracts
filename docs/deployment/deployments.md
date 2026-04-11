# Deployments (Kaia Mainnet + Kairos Testnet)

This document summarizes the currently recorded vault deployments for both Kairos testnet and Kaia mainnet.

Last updated: 2026-01-31

## Kairos (Testnet, chainId 1001)

### Stable Profile

Source: `kommune-fi-contracts/deployments/testnet/kairos-stable.json`

- claimManager: `0xef479B31D3540133dd34d011A202853C7E96Bf6E`
- swapContract: `0xC0AE8cdb7dd42eAfC2A5371d397369856c73130B`
- vaultCore: `0xB4a79CAd8988f5698CF76b3A7806BE1A8929AFDd`
- shareVault: `0x90af1a8b94480Ce57a4c4E86d14c8Fb3D95b425E`
- wkaia: `0x0339d5Eb6D195Ba90B13ed1BCeAa97EbD198b106`
- balancerVault: `0x1c9074AA147648567015287B0d4185Cb4E04F86d`
- network: `kairos` (chainId 1001)
- deployedAt: `2025-08-27T02:36:56.938Z`
- profile: `stable`
- config:
  - investRatio: 10000
  - stableRatio: 10000
  - balancedRatio: 0
  - aggressiveRatio: 0

### Balanced Profile

Source: `kommune-fi-contracts/deployments/testnet/kairos-balanced.json`

- claimManager: `0x6784bb46a251532bF4426761b8DbFaf3b11381EC`
- swapContract: `0x28e0F46B94267620A20d5Eb368d054367731875c`
- vaultCore: `0x05fac5656f155bE7d2a94b4621AF902059Fc078A`
- shareVault: `0x6c0B7b618bcECF5b5bA9F59dD0694ffbe86C6966`
- wkaia: `0x0339d5Eb6D195Ba90B13ed1BCeAa97EbD198b106`
- balancerVault: `0x1c9074AA147648567015287B0d4185Cb4E04F86d`
- network: `kairos` (chainId 1001)
- deployedAt: `2025-08-27T01:55:22.480Z`
- profile: `balanced`
- config:
  - investRatio: 9000
  - stableRatio: 4500
  - balancedRatio: 5000
  - aggressiveRatio: 0

### Legacy V1

Source: `kommune-fi-contracts/deployments/testnet/kairos-v1.json`

- claimManager: `0x3BeeC7C45300d05501757DE0789a1dD134269425`
- swapContract: `0xb77A7605a4504B6e273278751d3B688d3efA8DEb`
- vaultCore: `0xf41B7e8852e7A0C1528BCaa206349119523ae9f9`
- shareVault: `0xE8c8A5f6A06b43dbfB02e6F4738073Ef6F19CD9b`
- wkaia: `0x0339d5Eb6D195Ba90B13ed1BCeAa97EbD198b106`
- balancerVault: `0x1c9074AA147648567015287B0d4185Cb4E04F86d`
- network: `kairos` (chainId 1001)
- deployedAt: `2025-08-23T04:55:11.016Z`
- profile: `stable` (legacy)
- config:
  - investRatio: 9000
  - stableRatio: 9000
  - balancedRatio: 0
  - aggressiveRatio: 0

## Kaia (Mainnet, chainId 8217)

### Stable Profile

Source: `kommune-fi-contracts/deployments/mainnet/kaia-stable.json`

- claimManager: `0x30d2850364af9b357cf7557078bf5B7B43ee9f8f`
- swapContract: `0xAB0330C58760A85Bc40c296C4415b2fD04F9128B`
- vaultCore: `0x06ce7e66D219a261eDa4F15Fd503F2Ac2B81Afc9`
- shareVault: `0x86799f0B252822dE36c8D8384d443355E4d478AE`
- wkaia: `0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432`
- balancerVault: `0xbF1f3C783C8f6f4582c0a0508f2790b4E2C2E581`
- network: `kaia` (chainId 8217)
- deployedAt: `2025-08-26T22:51:02.275Z`
- profile: `stable`
- config:
  - investRatio: 10000
  - stableRatio: 10000
  - balancedRatio: 0
  - aggressiveRatio: 0

### Balanced Profile

Source: `kommune-fi-contracts/deployments/mainnet/kaia-balanced.json`

- claimManager: `0xab1D9E799Cf560f50449e4A0FB7c7A26c507a366`
- swapContract: `0x015da9B47A34F98C4efC70D9898e4E0913FF7e4d`
- vaultCore: `0x95A257399BeB3D2c959a1E64d35DD872Fdedb2dA`
- shareVault: `0xF4C64918dbbdd7a17327C0Ea1aA625A9f3Ed2b9b`
- wkaia: `0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432`
- balancerVault: `0xbF1f3C783C8f6f4582c0a0508f2790b4E2C2E581`
- network: `kaia` (chainId 8217)
- deployedAt: `2025-08-27T00:24:50.230Z`
- profile: `balanced`
- config:
  - investRatio: 9000
  - stableRatio: 4500
  - balancedRatio: 5000
  - aggressiveRatio: 0

## Kaia Mainnet — Audit Deployments (2026-01-30)

### Audit Stable Profile

Source: `kommune-fi-contracts/deployments/mainnet/audit-kaia-stable.json`

- claimManager: `0x705843370841294241cA7E874Ae316F0931243c1`
- dragonSwapHandler: `0x7F6a983e5509eD4168cA1Bf413be3259b5083768`
- vaultCore: `0xfb2e4E39629b0DaC9c2fdf268191de46E214eC90`
- shareVault: `0x7a801555A3c489652ce88D6E0768FA75E699088D`
- network: `kaia` (chainId 8217)
- deployedAt: `2026-01-30T02:34:49.163Z`
- profile: `stable`
- config:
  - investRatio: 10000
  - basisPointsFees: 1000

### Audit Balanced Profile

Source: `kommune-fi-contracts/deployments/mainnet/audit-kaia-balanced.json`

- claimManager: `0xfb92d89692ec2281E9c7E3dBFa2b9F8D24c65563`
- dragonSwapHandler: `0xe19281449BAB0e87b694f62BC8062A706E741A36`
- vaultCore: `0x65Aba372d675d117a6aEc9736C7F703De7f08B51`
- shareVault: `0x2ec03439830f5da9d539C4537846C3708F232c77`
- network: `kaia` (chainId 8217)
- deployedAt: `2026-01-30T03:30:00.000Z`
- profile: `balanced`
- config:
  - investRatio: 10000
  - basisPointsFees: 1000

### Audit Aggressive Profile (AI Agent)

Source: `kommune-fi-contracts/deployments/mainnet/audit-kaia-aggressive.json`

- claimManager: `0x07fC311311143aB44D73D3DA484a8C4366F0ac5F`
- dragonSwapHandler: `0xDa3Fce1B7e2a63918B47B3467831430B6bd8F812`
- vaultCore: `0xc2AC68C0d96A34d9DAC80CF53BFFF003547ea493`
- shareVault: `0x8663b23E3a4ECd9ED6424854656CC5463C11C197`
- network: `kaia` (chainId 8217)
- deployedAt: `2026-01-30T03:35:00.000Z`
- profile: `aggressive`
- config:
  - investRatio: 10000
  - basisPointsFees: 1000

### Audit Kairos Testnet

Source: `kommune-fi-contracts/deployments/testnet/audit-kairos.json`

- claimManager: `0x1A9914728e101d2cEE477C3c1db98519B7B08B1D`
- dragonSwapHandler: `0xd998B223dfD57D74fC15bbf127Ad32bbC4B04320`
- vaultCore: `0x7BFFAb552E3CA60C9993C05bF66D078a3aDc09e6`
- shareVault: `0xEce34C711903b0884DB9B2248f498796BA36980B`
- network: `kairos` (chainId 1001)
- deployedAt: `2026-01-28T14:40:55.316Z`
- profile: `stable (audit baseline)`

## Notes

- Audit deployments use `DragonSwapHandler` (replacing legacy `swapContract`/Balancer).
- These addresses are sourced from JSON files in `kommune-fi-contracts/deployments/`.
- Update the JSON files first, then sync this summary.
