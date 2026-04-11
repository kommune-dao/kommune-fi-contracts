# Documentation Index

Technical documentation for Kommune-Fi Contracts (Audit Version).

## 📁 Directory Structure
```
docs/
├── audit/              # Audit Preparation & Security Notes
├── deployment/         # Deployment & Proxy Upgrade Guides
├── architecture/       # System Design (Storage Layout)
└── technical/          # Technical Specifications (Legacy Reference)
```

---

## 📚 Key Documents

### 🔍 Audit (Security)
Security context and audit readiness details.
- [audit-readme.md](audit/audit-readme.md) - **Audit Guide (English)**
- [audit-readme-kr.md](audit/audit-readme-kr.md) - Audit Guide (Korean)

### 🚀 Deployment & Operations
Guides for deploying and upgrading the system.
- [deployment-guide.md](deployment/deployment-guide.md) - **Deployment Guide**
- [upgrade-guide.md](deployment/upgrade-guide.md) - **UUPS Upgrade Guide**
- [deployments.md](deployment/deployments.md) - Deployment Addresses (Reference)

### 🏗️ Architecture
System internals and storage patterns.
- [storage-layout.md](architecture/storage-layout.md) - **Critical**: Storage Layout for UUPS Proxies

---

## ⚠️ Legacy Documentation
*Note: The following documents reference the "Balanced Strategy" (LP + Staking) which is currently disabled in favor of the "Stable Strategy" (100% Staking) for the initial audit.*

### Technical Specs (Reference)
- [investment-profiles.md](architecture/investment-profiles.md) - Strategy Profiles
- [balanced-strategy.md](architecture/balanced-strategy.md) - Legacy LP Strategy
- [lp-calculation-logic.md](technical/lp-calculation-logic.md) - Fair LP Pricing Logic
- [sequential-swap.md](technical/sequential-swap.md) - Swap Routing Logic

---

## 🔗 Quick Links
- [Project README](../README.md)
- [Audit Deployment Script](../scripts/deployAudit.js)
