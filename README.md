# Inflect Compliance

End-to-end Governance, Risk & Compliance (GRC) platform — manage controls, risks, assets, evidence, policies, and audits across multiple frameworks (ISO/IEC 27001:2022, SOC 2, NIS2, and more) with cross-framework mapping.

> **New contributor?** This Quick Start boots the app. For the full onboarding
> walk-through — local dev loop, your first PR, CI signals, the contracts you
> can't break — see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Quick Start

### Prerequisites
- Node.js 24 (pinned in `.nvmrc`; `engines` requires `>=24 <25`)
- Docker (for PostgreSQL + Redis)

### Setup

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
npm install

# 3. Generate Prisma client & run migrations
npx prisma generate
npx prisma db push

# 4. Seed demo data
npx ts-node prisma/seed.ts

# 5. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo Users
The seed (`prisma/seed.ts`) provisions these demo users for **local
development only**. Their password is set in the seed script and is
intentionally **not published here**.

| Email | Role |
|-------|------|
| admin@acme.com | Owner |
| editor@acme.com | Editor |
| viewer@acme.com | Viewer |

## Features

### Core
- **Framework Requirement Tracker** — Track progress through framework requirements (ISO 27001:2022 clauses 4–10, SOC 2 TSC, NIS2, …)
- **Asset Inventory** — Register and classify information assets (C/I/A ratings)
- **Risk Register** — Assess risks with likelihood×impact scoring + heatmap
- **Controls Library** — Annex A controls + custom controls, implementation tracking
- **Evidence Management** — Submit/Review/Approve workflow with audit trail
- **Policies** — Versioning, approval, and acknowledgement workflows
- **Internal Audits** — Auto-generated checklists, pass/fail testing
- **Findings** — Nonconformity/observation tracking with corrective action workflow

### V2
- **Framework Mapping** — SOC 2 and NIS2 readiness views
- **Reports** — Statement of Applicability, Risk Register (CSV export)
- **Audit Log** — Immutable activity trail
- **Notifications** — In-app notification system

## Tech Stack
Next.js 14 · TypeScript · Tailwind CSS · Prisma · PostgreSQL

## Legal
All ISO 27001, SOC 2, and NIS2 content in this application uses **original paraphrases**. No verbatim reproduction of ISO, AICPA, or EU regulatory text.
