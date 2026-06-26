# Row-Level Security

> **Deprecated.** The system described here has been superseded by `docs/rls-tenant-isolation.md`. See that document.

This file has moved. The authoritative guide is:

- **[`docs/rls-tenant-isolation.md`](./rls-tenant-isolation.md)** — contributor guide: role model, `runInTenantContext`, `runWithoutRls`, policy shapes for nullable/ownership-chained tables, how to add a new tenant-scoped model.
- **[`docs/epic-a-security.md`](./epic-a-security.md)** — operator runbook: env vars, verification commands, observability signals, rollback procedure.

The older content of this file (which referenced only 14 tenant-scoped tables) pre-dated Epic A.1's full coverage extension. Every tenant-scoped model in the schema is now under RLS — see the `TENANT_SCOPED_MODELS` export in `src/lib/db/rls-middleware.ts` for the runtime-verified inventory, and `tests/guardrails/rls-coverage.test.ts` for the ratchet that enforces coverage in CI.
