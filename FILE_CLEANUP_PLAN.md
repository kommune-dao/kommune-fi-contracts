# Kommune-Fi-Contracts 파일 정리 계획

> 작성일: 2026-01-22  
> 프로젝트: KommuneFi Contracts  
> 목표: 프로젝트 루트 디렉토리 정리 및 체계적인 파일 구조 확립

---

## 📋 현재 상태 분석

### 루트 디렉토리 파일 현황

#### ✅ 유지해야 할 핵심 파일
- `package.json` / `package-lock.json` - 프로젝트 의존성
- `hardhat.config.js` / `remix-compiler.config.js` - 빌드 설정
- `.gitignore` - Git 설정
- `README.md` / `README_KR.md` - 프로젝트 메인 문서

#### 📚 문서 파일 (정리 필요)
**영문/한글 이중화된 문서:**
- `AUDIT_README.md` / `AUDIT_README_KR.md`
- `DEPLOYMENT_GUIDE.md` / `DEPLOYMENT_GUIDE_KR.md`
- `UPGRADE_GUIDE.md` / `UPGRADE_GUIDE_KR.md`

**프로젝트 가이드 문서:**
- `CLAUDE.md` - AI 개발 가이드
- `CLAUDE_HISTORY.md` - 개발 히스토리
- `STORAGE_LAYOUT.md` - 스토리지 레이아웃 문서

#### 📦 배포 설정 파일 (정리 필요)
**메인넷 배포 정보:**
- `deploy-kaia.json` (68B - 거의 비어있음)
- `deployments-stable-kaia.json` (944B)
- `deployments-balanced-kaia.json` (947B)

**테스트넷 배포 정보:**
- `deploy-kairos.json` (68B - 거의 비어있음)
- `deployments-kairos.json` (611B)
- `deployments-stable-kairos.json` (1.2K)
- `deployments-balanced-kairos.json` (1.2K)

**업그레이드 관련:**
- `pre-upgrade-balanced.json` (230B)

#### 🗑️ 삭제 대상 파일
- `balanced_mainnet.log` (5.4K) - 임시 로그 파일
- `stable_test.log` (21K) - 임시 테스트 로그

#### 📁 디렉토리 구조
```
✅ src/ - 스마트 컨트랙트 소스 (유지)
✅ scripts/ - 배포/테스트 스크립트 (유지)
✅ docs/ - 상세 문서 (유지)
✅ config/ - 설정 파일 (유지)
✅ utils/ - 유틸리티 (유지)
✅ .github/ - GitHub 설정 (유지)
⚠️ artifacts/ - 컴파일 산출물 (gitignore 확인)
⚠️ cache/ - 빌드 캐시 (gitignore 확인)
```

---

## 🎯 정리 목표

### 1. 배포 파일 통합 및 체계화
**현재 문제:**
- 8개의 JSON 파일이 루트에 분산
- 네이밍 규칙 불일치: `deploy-*.json` vs `deployments-*.json`
- 비어있거나 거의 비어있는 파일 존재

**제안 방안:**

#### Option A: deployments/ 디렉토리 구조화 (권장)
```
deployments/
├── README.md                    # 배포 파일 가이드
├── mainnet/
│   ├── kaia-stable.json        # deployments-stable-kaia.json
│   └── kaia-balanced.json      # deployments-balanced-kaia.json
├── testnet/
│   ├── kairos-v1.json          # deployments-kairos.json
│   ├── kairos-stable.json      # deployments-stable-kairos.json
│   └── kairos-balanced.json    # deployments-balanced-kairos.json
└── archive/
    ├── deploy-kaia.json        # 레거시 (거의 비어있음)
    ├── deploy-kairos.json      # 레거시 (거의 비어있음)
    └── pre-upgrade-balanced.json
```

**장점:**
- 네트워크별 명확한 분리 (mainnet/testnet)
- 레거시 파일 보존 (archive/)
- 확장 가능한 구조 (버전별 관리 가능)

#### Option B: 단일 통합 파일
```
deployments.json:
{
  "mainnet": {
    "kaia": {
      "stable": { ... },
      "balanced": { ... }
    }
  },
  "testnet": {
    "kairos": { ... }
  }
}
```

**장점:**
- 단일 파일로 모든 배포 정보 관리
- 프로그래밍 방식으로 접근 용이

**단점:**
- 파일 크기 증가
- 버전 관리 복잡도 증가

**추천: Option A (디렉토리 구조화)**

### 2. 문서 구조 재정리

#### 현재 구조:
```
Root:
├── README.md / README_KR.md (메인)
├── AUDIT_README.md / AUDIT_README_KR.md
├── DEPLOYMENT_GUIDE.md / DEPLOYMENT_GUIDE_KR.md
├── UPGRADE_GUIDE.md / UPGRADE_GUIDE_KR.md
├── STORAGE_LAYOUT.md
├── CLAUDE.md
└── CLAUDE_HISTORY.md

docs/:
├── BALANCED_STRATEGY.md
├── INVESTMENT_PROFILES.md
├── LP_CALCULATION_LOGIC.md / LP_CALCULATION_LOGIC_KR.md
├── POOL_INDICES.md / POOL_INDICES_KR.md
└── SEQUENTIAL_SWAP.md / SEQUENTIAL_SWAP_KR.md
```

#### 제안 구조:

**Option A: 루트는 핵심 문서만, 나머지는 docs/ 이동**
```
Root:
├── README.md / README_KR.md           # 프로젝트 개요
├── CLAUDE.md                          # AI 개발 가이드 (자주 참조)
└── .github/copilot-instructions.md    # GitHub Copilot 설정

docs/
├── README.md                          # 문서 인덱스
├── CLAUDE_HISTORY.md                  # 개발 히스토리
├── audit/
│   ├── AUDIT_README.md
│   └── AUDIT_README_KR.md
├── deployment/
│   ├── DEPLOYMENT_GUIDE.md
│   ├── DEPLOYMENT_GUIDE_KR.md
│   ├── UPGRADE_GUIDE.md
│   └── UPGRADE_GUIDE_KR.md
├── architecture/
│   ├── STORAGE_LAYOUT.md
│   ├── BALANCED_STRATEGY.md
│   └── INVESTMENT_PROFILES.md
└── technical/
    ├── LP_CALCULATION_LOGIC.md / _KR.md
    ├── POOL_INDICES.md / _KR.md
    └── SEQUENTIAL_SWAP.md / _KR.md
```

**Option B: 현재 구조 유지하되 정리만**
- 루트 문서는 그대로 유지
- docs/ 내부만 카테고리별 정리
- 문서 간 링크 보완

**추천: Option A (체계적 분류)**  
- 루트는 최소화 (README + CLAUDE.md만)
- 전문 문서는 docs/ 하위로 이동
- 문서 탐색성 향상

### 3. 임시 파일 정리

#### 즉시 삭제 대상:
```bash
# 로그 파일 (임시 테스트 결과)
balanced_mainnet.log  # 5.4KB
stable_test.log       # 21KB

# 정책: .gitignore에 이미 *.log 패턴 존재, 삭제 안전
```

#### 확인 후 삭제 검토:
```bash
# 거의 비어있는 배포 파일
deploy-kaia.json      # 68B (레거시?)
deploy-kairos.json    # 68B (레거시?)

# 조치: archive/로 이동 후 향후 불필요 시 삭제
```

---

## 📝 실행 계획

### Phase 1: 백업 및 검증 (안전 우선)
1. **Git 상태 확인**
   ```bash
   cd /Users/minsuj/Workspace/kommune-dao/kommune-fi-contracts
   git status
   git log --oneline -5
   ```

2. **현재 브랜치 확인 및 작업 브랜치 생성**
   ```bash
   git checkout -b feature/file-cleanup-2026-01
   ```

3. **백업 생성** (선택적 - Git 히스토리가 백업 역할)
   ```bash
   tar -czf ../kommune-fi-contracts-backup-$(date +%Y%m%d).tar.gz .
   ```

### Phase 2: 디렉토리 구조 생성
```bash
# 배포 파일 디렉토리
mkdir -p deployments/{mainnet,testnet,archive}

# 문서 디렉토리
mkdir -p docs/{audit,deployment,architecture,technical}
```

### Phase 3: 파일 이동
```bash
# 1. 배포 파일 정리
mv deployments-stable-kaia.json deployments/mainnet/kaia-stable.json
mv deployments-balanced-kaia.json deployments/mainnet/kaia-balanced.json
mv deployments-kairos.json deployments/testnet/kairos-v1.json
mv deployments-stable-kairos.json deployments/testnet/kairos-stable.json
mv deployments-balanced-kairos.json deployments/testnet/kairos-balanced.json
mv deploy-kaia.json deployments/archive/
mv deploy-kairos.json deployments/archive/
mv pre-upgrade-balanced.json deployments/archive/

# 2. 문서 정리
mv CLAUDE_HISTORY.md docs/
mv AUDIT_README*.md docs/audit/
mv DEPLOYMENT_GUIDE*.md docs/deployment/
mv UPGRADE_GUIDE*.md docs/deployment/
mv STORAGE_LAYOUT.md docs/architecture/
# docs/ 내 파일은 이미 해당 위치에 있으므로 하위 디렉토리로만 이동

# 3. 임시 파일 삭제
rm balanced_mainnet.log stable_test.log
```

### Phase 4: 참조 업데이트
1. **README 파일 업데이트**
   - 루트 README.md에서 문서 링크 수정
   - docs/README.md 생성 (문서 인덱스)

2. **스크립트 경로 수정**
   - `scripts/` 내 배포 스크립트 확인
   - deployment JSON 경로 참조 업데이트

3. **CLAUDE.md 업데이트**
   - 파일 구조 섹션 업데이트
   - 문서 참조 경로 수정

### Phase 5: 검증 및 커밋
```bash
# 1. 파일 존재 확인
ls deployments/mainnet/
ls deployments/testnet/
ls docs/audit/
ls docs/deployment/

# 2. Git 상태 확인
git status
git diff --name-status

# 3. 스크립트 실행 테스트 (중요!)
npx hardhat compile  # 컴파일 정상 동작 확인

# 4. 커밋
git add .
git commit -m "refactor: Reorganize project file structure

- Create deployments/ directory with mainnet/testnet/archive structure
- Reorganize docs/ by category (audit, deployment, architecture, technical)
- Remove temporary log files (*.log)
- Update documentation links
- Archive legacy deployment files

Refs: FILE_CLEANUP_PLAN.md"
```

---

## ⚠️ 주의사항

### 1. 스크립트 의존성 확인
**영향받는 파일:**
- `scripts/deployFreshBalanced.js`
- `scripts/deployFreshStable.js`
- `scripts/upgradeAll*.js`

**확인 필요:**
```javascript
// 이런 패턴이 있는지 검색
const deployments = require('./deployments-stable-kaia.json');
const config = require('./deploy-kaia.json');

// 변경 후:
const deployments = require('./deployments/mainnet/kaia-stable.json');
```

### 2. CI/CD 파이프라인
- `.github/workflows/` 내 배포 스크립트 경로 확인
- GitHub Actions에서 deployment JSON 참조하는지 검토

### 3. 외부 참조
- 다른 프로젝트나 문서에서 이 레포지토리 파일 직접 참조하는지 확인
- 예: kommune-frontend가 contract address를 직접 가져오는지

---

## 🎯 최종 목표 구조

```
kommune-fi-contracts/
├── README.md                     # 프로젝트 개요 (영문)
├── README_KR.md                  # 프로젝트 개요 (한글)
├── CLAUDE.md                     # AI 개발 가이드
├── package.json
├── hardhat.config.js
├── .gitignore
│
├── src/                          # 스마트 컨트랙트 소스
├── scripts/                      # 배포/테스트 스크립트
├── config/                       # 프로젝트 설정
├── utils/                        # 유틸리티 함수
│
├── deployments/                  # 배포 정보 (NEW)
│   ├── README.md                # 배포 파일 가이드
│   ├── mainnet/
│   │   ├── kaia-stable.json
│   │   └── kaia-balanced.json
│   ├── testnet/
│   │   ├── kairos-v1.json
│   │   ├── kairos-stable.json
│   │   └── kairos-balanced.json
│   └── archive/                 # 레거시 파일
│
├── docs/                         # 문서 (재구성)
│   ├── README.md                # 문서 인덱스
│   ├── CLAUDE_HISTORY.md        # 개발 히스토리
│   ├── audit/                   # 감사 관련
│   │   ├── AUDIT_README.md
│   │   └── AUDIT_README_KR.md
│   ├── deployment/              # 배포 가이드
│   │   ├── DEPLOYMENT_GUIDE.md
│   │   ├── DEPLOYMENT_GUIDE_KR.md
│   │   ├── UPGRADE_GUIDE.md
│   │   └── UPGRADE_GUIDE_KR.md
│   ├── architecture/            # 아키텍처 문서
│   │   ├── STORAGE_LAYOUT.md
│   │   ├── BALANCED_STRATEGY.md
│   │   └── INVESTMENT_PROFILES.md
│   └── technical/               # 기술 문서
│       ├── LP_CALCULATION_LOGIC.md
│       ├── LP_CALCULATION_LOGIC_KR.md
│       ├── POOL_INDICES.md
│       ├── POOL_INDICES_KR.md
│       ├── SEQUENTIAL_SWAP.md
│       └── SEQUENTIAL_SWAP_KR.md
│
└── .github/                      # GitHub 설정
    ├── copilot-instructions.md
    └── workflows/               # CI/CD
```

---

## 📊 예상 효과

### 1. 가독성 향상
- ✅ 루트 디렉토리 파일 수: **20+ → 8개**로 감소
- ✅ 문서 탐색 시간 단축
- ✅ 신규 개발자 온보딩 용이

### 2. 유지보수 개선
- ✅ 배포 정보 체계적 관리 (네트워크/버전별)
- ✅ 문서 카테고리 명확화
- ✅ 레거시 파일 분리 보관

### 3. 자동화 지원
- ✅ 스크립트에서 배포 정보 쉽게 접근
- ✅ CI/CD 파이프라인 개선 가능
- ✅ 문서 자동 생성 기반 마련

---

## ✅ 체크리스트

작업 전 확인사항:
- [ ] Git 상태 깨끗한지 확인 (`git status`)
- [ ] 현재 브랜치 확인 및 작업 브랜치 생성
- [ ] 백업 필요 시 생성

작업 중 확인사항:
- [ ] 배포 스크립트의 JSON 경로 의존성 확인
- [ ] 문서 간 링크 업데이트
- [ ] README 파일 경로 수정

작업 후 확인사항:
- [ ] `npx hardhat compile` 정상 동작 확인
- [ ] 배포 스크립트 테스트 실행 (드라이런)
- [ ] 문서 링크 모두 동작하는지 확인
- [ ] Git diff로 의도하지 않은 변경 없는지 확인
- [ ] 커밋 메시지 작성 (Conventional Commits)

---

## 🚀 다음 단계

이 계획을 검토하신 후:

1. **승인 시**: Phase별 실행 진행
2. **수정 필요 시**: 구체적인 피드백 요청
3. **대안 제시**: 다른 구조 선호 시 의견 제시

**예상 작업 시간**: 30-60분  
**리스크 레벨**: Low (Git 버전 관리로 안전하게 롤백 가능)

---

**작성자**: GitHub Copilot (Claude Sonnet 4.5)  
**검토자**: [검토 후 이름 기입]  
**승인일**: [승인 후 날짜 기입]
