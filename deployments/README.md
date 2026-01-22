# Deployments

배포 설정 파일 디렉토리입니다.

## 디렉토리 구조

```
deployments/
├── mainnet/           # 메인넷 배포 정보
│   ├── kaia-stable.json       # Kaia Mainnet - Stable 프로필
│   └── kaia-balanced.json     # Kaia Mainnet - Balanced 프로필
│
├── testnet/           # 테스트넷 배포 정보
│   ├── kairos-v1.json         # Kairos Testnet - V1
│   ├── kairos-stable.json     # Kairos Testnet - Stable 프로필
│   └── kairos-balanced.json   # Kairos Testnet - Balanced 프로필
│
└── archive/           # 레거시 배포 파일
    ├── deploy-kaia.json
    ├── deploy-kairos.json
    └── pre-upgrade-balanced.json
```

## 파일 네이밍 규칙

```
{network}-{profile}.json

구성 요소:
- network: 네트워크 이름 (kaia, kairos)
- profile: 투자 프로필 (stable, balanced, aggressive) 또는 버전 (v1, v2)
```

## 사용 예시

```javascript
// Kaia 메인넷 Stable 프로필 배포 정보 로드
const deployments = require('./deployments/mainnet/kaia-stable.json');

// Kairos 테스트넷 배포 정보 로드
const testnetDeployments = require('./deployments/testnet/kairos-stable.json');
```

## 파일 형식

각 배포 파일은 다음 정보를 포함합니다:

```json
{
  "ShareVault": "0x...",
  "VaultCore": "0x...",
  "SwapContract": "0x...",
  "ClaimManager": "0x...",
  "deployedAt": "2025-11-27T00:00:00.000Z",
  "network": "kaia",
  "profile": "stable"
}
```

## 주의사항

- **mainnet/**: 실제 운영 환경 배포 정보 (변경 시 신중)
- **testnet/**: 개발 및 테스트 환경 배포 정보
- **archive/**: 과거 배포 파일, 참조용으로만 사용
