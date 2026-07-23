-- ═══════════════════════════════════════════════════════════════════
-- DSAR manual-fulfilment queue
-- ═══════════════════════════════════════════════════════════════════
--
-- Two changes, both additive and backwards-compatible:
--
--   1. CANCELED terminal status. Distinct from REJECTED on purpose —
--      "the subject withdrew the request" and "we refused the request"
--      are different facts to a regulator. Nothing in this workflow
--      deletes rows, so a withdrawn request stays in the register.
--
--   2. Fulfilment provenance: who handled it, and what they did.
--      Fulfilment is MANUAL; a register without an accountable human
--      is not defensible under audit.
--
-- `fulfilmentNotes` is deliberately NOT added to the field-encryption
-- manifest: DataSubjectRequest is cross-tenant (no tenantId), but the
-- encryption middleware keys on the acting request's tenantId, so a
-- note written by one tenant's admin would be undecryptable — a
-- throwing read — for another's. It is sanitised on write instead.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1) New terminal status ────────────────────────────────────────
-- ALTER TYPE ... ADD VALUE is not transactional on older PostgreSQL and
-- cannot run inside an implicit block alongside other DDL, so it is
-- issued first and guarded for idempotency.
ALTER TYPE "DataSubjectRequestStatus" ADD VALUE IF NOT EXISTS 'CANCELED';

-- ─── 2) Fulfilment provenance ──────────────────────────────────────
ALTER TABLE "DataSubjectRequest"
    ADD COLUMN IF NOT EXISTS "handledById"     TEXT,
    ADD COLUMN IF NOT EXISTS "fulfilmentNotes" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'DataSubjectRequest_handledById_fkey'
    ) THEN
        ALTER TABLE "DataSubjectRequest"
            ADD CONSTRAINT "DataSubjectRequest_handledById_fkey"
            FOREIGN KEY ("handledById") REFERENCES "User"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
