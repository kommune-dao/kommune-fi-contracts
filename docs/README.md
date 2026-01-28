# Documentation Index

KommuneFi Contracts 프로젝트 문서 인덱스입니다.

## 📁 디렉토리 구조

```
docs/
├── audit/              # 감사 관련 문서
├── deployment/         # 배포 및 업그레이드 가이드
├── architecture/       # 아키텍처 및 설계 문서
└── technical/          # 기술 상세 문서
```

---

## 📚 문서 카테고리

### 🔍 Audit (감사)

프로젝트 감사 준비 및 보안 관련 문서

- [audit-readme.md](audit/audit-readme.md) - Audit 준비 가이드 (영문)
- [audit-readme-kr.md](audit/audit-readme-kr.md) - Audit 준비 가이드 (한글)

### 🚀 Deployment (배포)

배포 및 업그레이드 가이드

- [deployment-guide.md](deployment/deployment-guide.md) - 배포 가이드 (영문)
- [deployment-guide-kr.md](deployment/deployment-guide-kr.md) - 배포 가이드 (한글)
- [deployments.md](deployment/deployments.md) - 배포 현황 (Kairos + Mainnet)
- [upgrade-guide.md](deployment/upgrade-guide.md) - 업그레이드 가이드 (영문)
- [upgrade-guide-kr.md](deployment/upgrade-guide-kr.md) - 업그레이드 가이드 (한글)

### 🏗️ Architecture (아키텍처)

시스템 설계 및 전략 문서

- [storage-layout.md](architecture/storage-layout.md) - 스토리지 레이아웃 설계
- [balanced-strategy.md](architecture/balanced-strategy.md) - Balancer Pool 통합 전략
- [investment-profiles.md](architecture/investment-profiles.md) - 투자 프로필 설명

### 🔧 Technical (기술 문서)

구현 세부사항 및 기술 문서

- [lp-calculation-logic.md](technical/lp-calculation-logic.md) - LP 토큰 계산 로직 (영문)
- [lp-calculation-logic-kr.md](technical/lp-calculation-logic-kr.md) - LP 토큰 계산 로직 (한글)
- [pool-indices.md](technical/pool-indices.md) - Balancer Pool 인덱스 (영문)
- [pool-indices-kr.md](technical/pool-indices-kr.md) - Balancer Pool 인덱스 (한글)
- [sequential-swap.md](technical/sequential-swap.md) - Sequential Swap 로직 (영문)
- [sequential-swap-kr.md](technical/sequential-swap-kr.md) - Sequential Swap 로직 (한글)

---

## 📝 기타 문서

- [claude-history.md](claude-history.md) - 개발 히스토리 및 이슈 해결 기록

---

## 🔗 관련 링크

- [프로젝트 README](../README.md) - 프로젝트 개요
- [AI 개발 가이드](../CLAUDE.md) - AI 개발 시 참조 가이드
- [배포 설정](../deployments/) - 배포 파일 디렉토리

---

## 📖 문서 작성 규칙

### 파일 네이밍

```
{topic}-{category}-{lang}.md

예시:
- deployment-guide.md (영문)
- deployment-guide-kr.md (한글)
- storage-layout.md (영문 단독)
```

### 언어별 문서

- 기본 문서는 영문으로 작성
- 한글 버전은 `-kr` 접미사 사용
- 중요 문서는 영문/한글 병기 권장

### 문서 구조

```markdown
# 제목

> 간단한 설명

## 개요
...

## 상세 내용
...

## 예제
...

## 주의사항
...
```

---

**Last Updated**: 2026-01-22  
**Maintainer**: Colligence Labs
