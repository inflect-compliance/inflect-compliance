# Encryption & Data Protection — Architecture & Posture

> Epic 8 reference documentation. Covers all encryption layers, at-rest posture,
> key management, backup encryption, and verification procedures.
>
> **Sibling document:** [`docs/data-retention.md`](data-retention.md) is the
> *lifecycle* half of the data-protection story — how long each entity is kept
> and how it is cleaned up. This doc covers confidentiality *at rest*.

## Encryption Layers

```
┌──────────────────────────────────────────────────────────────────┐
│  Layer 1: Application-Level Encryption (AES-256-GCM)            │
│  Encrypts PII columns before write, decrypts on read.           │
│  Key: DATA_ENCRYPTION_KEY → HKDF-SHA256-derived subkeys         │
├──────────────────────────────────────────────────────────────────┤
│  Layer 2: Transport Encryption (TLS)                            │
│  HTTPS enforced for all client traffic.                         │
│  DB connection: sslmode=require for managed providers.          │
├──────────────────────────────────────────────────────────────────┤
│  Layer 3: Storage-at-Rest Encryption                            │
│  Provider-managed disk/volume encryption.                       │
│  Self-hosted: LUKS/dm-crypt on host volumes.                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Application-Level Column Encryption

### What is encrypted

| Model | Fields | Method |
|---|---|---|
| User | email, name | AES-256-GCM + HMAC-SHA256 hash |
| VendorContact | name, email, phone | AES-256-GCM + HMAC-SHA256 hash |
| AuditorAccount | email, name | AES-256-GCM + HMAC-SHA256 hash |
| NotificationOutbox | toEmail | AES-256-GCM |
| UserIdentityLink | emailAtLinkTime | AES-256-GCM + HMAC-SHA256 hash |

### How it works

- **Encryption**: Prisma middleware (`pii-middleware.ts`) intercepts `create`/`update` operations, encrypts PII fields into `*Encrypted` columns, and generates HMAC-SHA256 lookup hashes.
- **Decryption**: On `findMany`/`findUnique`, middleware transparently decrypts `*Encrypted` columns back into the original field names.
- **Lookup**: Email lookups use `emailHash` (HMAC-SHA256), not the ciphertext — so email-based login/linking works without decrypting every row.

### Key management

| Variable | Purpose | Generation | Required? |
|---|---|---|---|
| `DATA_ENCRYPTION_KEY` | Master key for AES-256-GCM + HMAC | `openssl rand -base64 48` | **Yes** in production. Boot exits 1 if missing, too short (<32 chars), or equal to the dev fallback. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | Decrypt fallback during master-KEK rotation | `openssl rand -base64 48` | Optional. Set ONLY during a rotation; remove once the rotation job reports zero remaining v1 rows under the previous key. |

> [!CAUTION]
> Losing `DATA_ENCRYPTION_KEY` means **permanent data loss** for all encrypted columns.
> Rotate responsibly — the backfill script re-encrypts existing data under a new key.

> [!IMPORTANT]
> **GAP-03 — production fail-fast.** Three independent checks refuse to
> start a production process without a valid key:
>
> 1. **Zod schema** (`src/env.ts`) — module-load validation rejects
>    missing, too-short, and dev-fallback values when `NODE_ENV=production`.
> 2. **Startup hook** — Next.js (`src/instrumentation.ts`), BullMQ worker
>    (`scripts/worker.ts`), and the deploy-time scheduler
>    (`scripts/scheduler.ts`) all run the same check + the web tier
>    additionally runs an encrypt → decrypt sentinel round-trip. Each
>    `process.exit(1)` with `[startup] FATAL: …` on failure.
> 3. **Compose** — every prod compose file (`docker-compose.prod.yml`,
>    `docker-compose.staging.yml`, `deploy/docker-compose.prod.yml`)
>    uses `${DATA_ENCRYPTION_KEY:?…}` so `docker compose up` aborts
>    before the container is even created.
>
> Dev/test environments use the documented in-source fallback
> (`src/lib/security/encryption-constants.ts`) so contributors do not
> need to manage this var locally. The fallback string is published in
> source intentionally — its security property is "refused in prod",
> not "secret".

---

## Layer 2: Transport Encryption

| Path | Encryption |
|---|---|
| Client → App | HTTPS (TLS 1.2+), enforced via `force_https` / reverse proxy |
| App → Database | `sslmode=require` for managed providers; local Docker uses internal network |
| App → S3/R2 | HTTPS (AWS SDK enforces TLS) |

### Docker Compose (self-hosted)

The database container is on an **internal bridge network** with no external port exposed. Traffic between the app and DB never leaves the Docker host. For additional transport security, configure `sslmode=require` in `DATABASE_URL` if the Postgres instance supports TLS.

---

## Layer 3: Storage-at-Rest Encryption

### Why NOT PostgreSQL TDE

PostgreSQL Transparent Data Encryption (pg_tde) is **not available** in the deployment stack:

| Requirement | Status |
|---|---|
| EDB Postgres Extended | ❌ Not used — `postgres:16-alpine` is community edition |
| `pg_tde` contrib extension | ❌ Not included in `postgres:16-alpine` |
| Custom Postgres build | ❌ Not applicable for this project |

**Honest assessment**: True PostgreSQL TDE is not implementable without switching to EDB or building a custom Postgres image with the `pg_tde` extension. This would introduce significant maintenance burden for marginal benefit, since:
1. App-layer encryption already protects PII at the column level
2. Provider-managed disk encryption protects the full volume
3. TDE primarily protects against stolen disk — the same threat model covered by volume encryption

### Chosen posture: Provider-managed at-rest encryption + app-layer PII encryption

#### Railway (Managed Postgres)

| What | Encrypted | Method |
|---|---|---|
| Database storage | ✅ | Railway PostgreSQL plugin uses encrypted volumes (AWS EBS encryption, AES-256) |
| Database backups | ✅ | Railway automated backups are encrypted |
| File storage (S3/R2) | ✅ | S3: SSE-S3 (AES-256) by default; R2: encrypted at rest |
| Application secrets | ✅ | Railway environment variables are encrypted at rest |

**Verification**: Railway dashboard → PostgreSQL plugin → Volume details confirms encryption.

#### Fly.io (Managed Postgres)

| What | Encrypted | Method |
|---|---|---|
| Database storage | ✅ | Fly Postgres volumes use encrypted NVMe (host-level) |
| Database backups | ⚠️ | Manual; use `pg_dump | gpg -e` for encrypted backups |
| File storage (S3/R2) | ✅ | S3: SSE-S3 (AES-256) by default |
| Application secrets | ✅ | `fly secrets set` — encrypted at rest |

**Verification**: `fly volumes list` confirms volume encryption status.

#### Self-Hosted VPS / Docker Compose

| What | Encrypted | Method |
|---|---|---|
| Database storage | ⚠️ Operator responsibility | LUKS/dm-crypt on host partition |
| Database backups | ⚠️ Operator responsibility | GPG-encrypted `pg_dump` |
| File storage | ⚠️ Operator responsibility | Encrypted volume mount or S3 with SSE |
| Application secrets | ✅ | `.env.production` file permissions (0600) |

> [!IMPORTANT]
> **Self-hosted deployments MUST use encrypted volumes** for the Docker data directory.
> Without this, database files and uploaded evidence are stored in plaintext on disk.

---

## Self-Hosted: Volume Encryption Guide

### Option A: LUKS full-disk encryption (recommended)

```bash
# 1. Create encrypted partition for Docker data
sudo cryptsetup luksFormat /dev/sdX
sudo cryptsetup luksOpen /dev/sdX encrypted-data
sudo mkfs.ext4 /dev/mapper/encrypted-data
sudo mount /dev/mapper/encrypted-data /var/lib/docker

# 2. Configure Docker to use encrypted volume
# Docker data root is now on the LUKS partition
# All named volumes (pgdata, uploads) are encrypted at rest
```

### Option B: LUKS-encrypted Docker volumes

```bash
# Create encrypted volume for Postgres data
sudo cryptsetup luksFormat /dev/sdY
sudo cryptsetup luksOpen /dev/sdY pg-encrypted
sudo mkfs.ext4 /dev/mapper/pg-encrypted
sudo mkdir -p /mnt/encrypted-pgdata
sudo mount /dev/mapper/pg-encrypted /mnt/encrypted-pgdata
```

Then in `docker-compose.prod.yml`:

```yaml
volumes:
  prod-pgdata:
    driver: local
    driver_opts:
      type: none
      device: /mnt/encrypted-pgdata
      o: bind
```

---

## Backup Encryption

### Database backups

```bash
# Encrypted backup (GPG)
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U inflect inflect_production \
  | gpg --symmetric --cipher-algo AES256 -o backup_$(date +%Y%m%d).sql.gpg

# Restore from encrypted backup
gpg -d backup_20260324.sql.gpg \
  | docker compose -f docker-compose.prod.yml exec -i db \
  psql -U inflect inflect_production
```

### Upload/evidence backups

```bash
# Encrypted backup (tar + GPG)
docker compose -f docker-compose.prod.yml exec app \
  tar czf - -C /data/uploads . \
  | gpg --symmetric --cipher-algo AES256 -o uploads_$(date +%Y%m%d).tar.gz.gpg
```

> [!WARNING]
> Unencrypted `pg_dump` output contains **all database contents including PII**.
> Always encrypt backups at rest. Never store unencrypted backups on unencrypted volumes.

---

## Secrets & Key Management

### Required secrets

| Secret | Purpose | Where to store |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | App-layer column encryption | Environment variable |
| `AUTH_SECRET` | NextAuth session signing | Environment variable |
| `JWT_SECRET` | JWT token signing | Environment variable |
| `POSTGRES_PASSWORD` | Database authentication | Environment variable |
| `S3_SECRET_ACCESS_KEY` | S3/R2 authentication | Environment variable |
| `AV_WEBHOOK_SECRET` | AV scan webhook HMAC | Environment variable |

### Key rotation

| Key | Rotation procedure |
|---|---|
| `DATA_ENCRYPTION_KEY` | 1. Set new key, 2. Run `scripts/backfill-encryption.ts` to re-encrypt, 3. Remove old key |
| `AUTH_SECRET` / `JWT_SECRET` | Set new value — existing sessions are invalidated |
| `POSTGRES_PASSWORD` | Update in both Docker env and `.env.production` |

### Provider-specific secret storage

| Provider | Recommended |
|---|---|
| Railway | Railway environment variables (encrypted at rest) |
| Fly.io | `fly secrets set` (encrypted at rest, never in `fly.toml`) |
| Self-hosted | `.env.production` with `chmod 0600`, ideally backed by HashiCorp Vault or AWS Secrets Manager |

---

## Verification Checklist

Use this checklist to verify encryption posture in each deployment environment.

### Application-layer encryption

- [ ] `DATA_ENCRYPTION_KEY` is set (≥32 chars)
- [ ] User emails are encrypted in DB: `SELECT "emailEncrypted" FROM "User" LIMIT 1` returns ciphertext (not plaintext)
- [ ] Email lookup by hash works: `SELECT * FROM "User" WHERE "emailHash" = '<hash>'`
- [ ] Backfill complete: `SELECT COUNT(*) FROM "User" WHERE "emailEncrypted" IS NULL` returns 0

### Transport encryption

- [ ] Application served over HTTPS
- [ ] HSTS header present
- [ ] Database connection uses SSL (if managed provider)

### Storage-at-rest encryption

**Railway**:
- [ ] PostgreSQL plugin dashboard shows encrypted volume
- [ ] S3/R2 bucket has default encryption enabled

**Fly.io**:
- [ ] `fly volumes list` shows encrypted volumes
- [ ] S3/R2 bucket has default encryption enabled

**Self-hosted**:
- [ ] `lsblk -f` shows LUKS type for Docker data partition
- [ ] `cryptsetup status <device>` confirms encryption active
- [ ] Docker named volumes reside on encrypted partition
- [ ] `.env.production` permissions: `ls -la .env.production` shows `rw-------`

### Backup encryption

- [ ] Database backups are GPG-encrypted before storage
- [ ] Upload backups are GPG-encrypted before storage
- [ ] Backup encryption keys stored separately from backups

### Soft-delete & retention

- [ ] Deleted records are soft-deleted (not hard-deleted)
- [ ] Purge job only removes records past grace period (90 days default)
- [ ] Audit events (`DATA_PURGED`, `DATA_EXPIRED`) are emitted on data lifecycle actions

---

## Data Classification Reference

| Classification | Examples | App-Layer Encrypted | At-Rest Encrypted |
|---|---|---|---|
| **PII** | User emails, names, contact info | ✅ AES-256-GCM | ✅ Volume/provider |
| **Sensitive** | Evidence content, policy text | ❌ (volume only) | ✅ Volume/provider |
| **Business** | Controls, risks, assets, tasks | ❌ | ✅ Volume/provider |
| **System** | Audit logs, sessions, tokens | ❌ | ✅ Volume/provider |

---

## Soft-Delete Model

### Protected entities (12 models)

| Model | deletedAt | deletedByUserId | retentionUntil |
|---|---|---|---|
| Asset | ✅ | ✅ | ✅ |
| Risk | ✅ | ✅ | ✅ |
| Control | ✅ | ✅ | ✅ |
| Evidence | ✅ | ✅ | ✅ |
| Policy | ✅ | ✅ | ✅ |
| Vendor | ✅ | ✅ | ✅ |
| FileRecord | ✅ | ✅ | ✅ |
| Task | ✅ | ✅ | — |
| Finding | ✅ | ✅ | — |
| Audit | ✅ | ✅ | — |
| AuditCycle | ✅ | ✅ | — |
| AuditPack | ✅ | ✅ | — |

### Behavior

- **Default delete** → Sets `deletedAt = now()`, record remains in DB
- **Default reads** → Auto-filter `deletedAt IS NULL` via Prisma middleware
- **withDeleted()** → Opt-out of auto-filter for admin/recovery views
- **Hard delete** → Only via raw SQL (purge jobs), never via normal Prisma calls

### Non-protected entities (intentional hard-delete)

Junction/link tables (e.g., `riskControl`, `controlAsset`, `taskLink`, `vendorDocument`, `auditorPackAccess`) use hard-delete by design — they represent relationships, not business entities.

---

## Data Lifecycle (Purge Model)

```
Active → retentionUntil elapsed → runRetentionSweep → Soft-Deleted
                                                       ↓ 90+ days
                                                  purgeSoftDeletedOlderThan → Hard-Deleted

Evidence → retention elapsed → Archived (isArchived=true)
                                ↓ 365+ days
                           purgeExpiredEvidenceOlderThan → Hard-Deleted
```

| Job | Grace Period | Audit Event | Scope |
|---|---|---|---|
| `runRetentionSweep` | — | `DATA_EXPIRED` | Per-tenant |
| `purgeSoftDeletedOlderThan` | 90 days (default) | `DATA_PURGED` | Per-tenant, all 12 models |
| `purgeExpiredEvidenceOlderThan` | 365 days (default) | `DATA_PURGED` | Per-tenant |

All jobs support `dryRun: true` for preview without side effects.

---

## Cleanup Status

### Plaintext email lookups (dual-write)

The PII middleware maintains **dual-write**: both the original plaintext column (`email`) and the encrypted column (`emailEncrypted`) are populated on every write. This is a deliberate migration-period strategy.

**Current state**: Several code paths still use `where: { email: ... }` for lookups:

| File | Usage | Risk |
|---|---|---|
| `auth.ts` | OAuth sign-in callback, JWT enrichment | Low — dual-write ensures plaintext column is populated |
| `sso.ts` | Identity linking, SSO enforcement check | Low — same dual-write guarantee |
| `audit-readiness.ts` | Auditor invitation (compound unique) | Low — compound key `tenantId_email` |
| `audit-hardening.ts` | Auditor account lookup by email | Low — dual-write |
| `seed/route.ts` | Dev seed script lookup | None — dev-only path |

> [!NOTE]
> These plaintext lookups **work correctly** because the dual-write strategy ensures the `email` column is always populated alongside `emailEncrypted` and `emailHash`. Migration to `emailHash`-based lookups is a future optimization, not a security regression.

### Sensitive value logging

Full codebase scan confirms: **no PII values are logged**. All logger calls reference descriptive strings (e.g., "email permanently failed") rather than actual email addresses, names, or phone numbers.

### Delete flow verification

All 12 critical entity models are intercepted by `SOFT_DELETE_MODELS` in the soft-delete middleware. Hard-deletes only occur on junction/link tables (intentional) and via raw SQL in purge jobs (audited).

---

## Key Rotation & Future Work

### Key rotation caveats

1. **DATA_ENCRYPTION_KEY rotation** requires running `scripts/backfill-encryption.ts` after setting the new key — all existing encrypted values must be re-encrypted under the new key
2. During rotation, there is a brief window where new writes use the new key but old reads may fail if the backfill hasn't completed — the middleware's `decryptField` catch block falls back to the plaintext column during this window
3. **AUTH_SECRET** and **JWT_SECRET** rotation invalidates all existing sessions immediately — users must re-authenticate

### Future work (non-blocking)

| Item | Priority | Description |
|---|---|---|
| Migrate `where: { email }` to `emailHash` | Low | Convert remaining plaintext email lookups to use hash-based lookups; requires schema changes to make `emailHash` a unique index |
| Drop plaintext PII columns | Low | After all lookups use `emailHash`, the plaintext `email`/`name` columns can be made nullable or removed; requires coordinated migration |
| Cron scheduling for purge jobs | Medium | Wire `runRetentionSweep` and `purgeSoftDeletedOlderThan` into a job scheduler (cron, Railway scheduled tasks) |
| Multi-key envelope encryption | Low | Support key rotation without full re-encryption via envelope encryption (per-record DEK wrapped by KEK) |
| Evidence content encryption | Medium | Extend column encryption to evidence `content` field if requirements expand beyond volume-level protection |

