/**
 * # Performance expectations (Epic B.1 — pinned by perf test)
 *
 * Measured in `tests/unit/encryption-middleware.perf.test.ts`. These
 * are the numbers that matter for production sizing — reach for the
 * runbook (`docs/epic-a-security.md` cross-references this layer) if
 * a regression investigation needs them.
 *
 * | Scenario                                     | Observed | Threshold |
 * |----------------------------------------------|---------:|----------:|
 * | Raw `encryptField` / `decryptField`          |  <10 µs |     100 µs|
 * | Single-row detail (3 fields)                 |  <0.1 ms|       5 ms|
 * | List of 100 rows × 2 encrypted fields        |   ~3 ms |      50 ms|
 * | List + 10 nested comments per row (1000 ops) |  ~16 ms |     120 ms|
 * | Write with nested `createMany` of 50         | ~0.8 ms |      80 ms|
 * | Walk 100 rows of a NON-encrypted model       |  <0.5 ms|      15 ms|
 * | Middleware overhead vs raw decrypt (100×2)   |     17% |      100% |
 *
 * **Expected overhead:** ~15–20% above bare AES-GCM cost on realistic
 * list workloads. The traversal + per-value guard (`isEncryptedValue`)
 * fits comfortably inside the headroom of a typical request, and the
 * fast-path early-exit on nodes with no manifest field names means
 * included `User` / `Tenant` / framework-library relations cost
 * almost nothing (a single `Set.has` per node).
 *
 * **Where encryption overhead is acceptable:**
 *   - Every tenant-scoped API route — decryption of N×M fields per
 *     response is bounded by the network-response-size budget, which
 *     dominates the total latency.
 *   - Background jobs (compliance digest, evidence expiry sweeps) —
 *     they tolerate higher per-row cost because they don't affect
 *     request latency.
 *   - PDF exports — one-shot, operator-tolerant.
 *
 * **Where it should be watched:**
 *   - Very large list pages (10k+ rows) — paginate, don't fetch all.
 *     Current cursors in `@/lib/pagination` already cap at 100.
 *   - Dashboards that aggregate across an encrypted column — don't.
 *     Move aggregation to a plaintext analytics column (e.g.
 *     `Risk.score` / `Risk.status`) per the manifest's "fields
 *     explicitly excluded" section.
 *
 * # Epic B.1 — Encrypted field manifest.
 *
 * Lists business-content fields that the Prisma encryption middleware
 * (`src/lib/db/encryption-middleware.ts`) encrypts at rest. The manifest
 * drives encrypt-on-write and decrypt-on-read; no other code path
 * should consult these columns without going through the middleware.
 *
 * Pattern: **in-place encryption**. Unlike the PII middleware
 * (`src/lib/security/pii-middleware.ts`) which uses dual `*Encrypted`
 * sibling columns, the Epic B business-content fields are encrypted
 * into the same column that holds the plaintext today.
 *
 *   - No schema change required to ship the middleware. Existing
 *     rows stay plaintext until their next update (at which point the
 *     middleware rewrites them as ciphertext).
 *   - The one-shot backfill migration (later Epic B phase) iterates
 *     every row and `encryptField()`s each listed field in place.
 *   - Detection is idempotent: every ciphertext begins with the
 *     `v1:` version prefix (see `encryption.ts`). The middleware
 *     uses `isEncryptedValue()` before both encrypt and decrypt so
 *     double-encryption and plaintext-during-rollout are both safe.
 *
 * **Fields DELIBERATELY NOT in this manifest:**
 *   - PII fields (email, name, phone, tokens) — already handled by
 *     `pii-middleware.ts` with the dual-column convention.
 *   - `Risk.description`, `Policy.description`, `Evidence.content` —
 *     searched via `contains` LIKE in their repositories. A product
 *     decision on whether to sacrifice substring search for
 *     encryption is still pending. If ever added here, the
 *     RiskRepository / PolicyRepository / EvidenceRepository search
 *     branches must be removed in the same PR.
 *   - Operational keys (status, category, severity, FKs, dates) —
 *     load-bearing for filters, joins, and indexes.
 *   - Global library tables (Framework, Clause, ControlTemplate,
 *     PolicyTemplate, QuestionnaireTemplate, RiskTemplate) — no
 *     tenant-specific content, zero breach value.
 *   - `AuditLog.*` — append-only hash-chained audit trail. Encrypting
 *     would break `entryHash` integrity; investigation needs
 *     plaintext anyway.
 *
 * **Per-tenant keys (later Epic B phase):** the manifest shape is
 * stable across that change; only the envelope emitted by
 * `encryptField()` grows a `<tenantKeyId>` slot. The version prefix
 * in the ciphertext discriminates — readers keep working.
 */

/**
 * Map from Prisma model name → list of string fields to encrypt.
 * Field names match the Prisma schema exactly.
 *
 * Adding a new field requires:
 *   1. Append to the list here.
 *   2. Verify it's not used in a `contains` / `startsWith` /
 *      `orderBy` in any repository. If it is, either move the
 *      repository off the search (preferred) or skip this field.
 *   3. Extend `tests/unit/encryption-middleware.test.ts` with a
 *      write-then-read round-trip assertion for the new field.
 *   4. Backfill existing rows as a follow-up migration before the
 *      next tenant writes to the column.
 */
export const ENCRYPTED_FIELDS: Readonly<Record<string, readonly string[]>> = {
    // ─── Tenant security settings ──────────────────────
    //  Epic C.4 — audit-stream HMAC secret. URL stays plaintext so DBAs
    //  can audit which tenants are forwarding to which SIEM without
    //  holding the decryption key.
    TenantSecuritySettings: ['auditStreamSecretEncrypted'],

    // ─── Risk ──────────────────────────────────────────
    //  `description` omitted — searched via RiskRepository `contains`.
    Risk: ['treatmentNotes', 'threat', 'vulnerability'],

    // ─── Finding ───────────────────────────────────────
    //  Findings are audit artifacts — attacker value if leaked is high.
    Finding: [
        'description',
        'rootCause',
        'correctiveAction',
        'analysis',
        'verificationNotes',
    ],

    // ─── Evidence / review ─────────────────────────────
    //  Evidence.content omitted — searched via EvidenceRepository.
    EvidenceReview: ['comment'],

    // ─── Policy ────────────────────────────────────────
    //  Policy.description omitted — searched via PolicyRepository.
    //  The high-value target (the policy body itself) lives on
    //  PolicyVersion; encrypting it defends the real secret without
    //  breaking the list-page search UX.
    PolicyVersion: ['contentText', 'changeSummary'],

    // ─── Vendor ────────────────────────────────────────
    Vendor: ['description'],
    VendorDocument: ['notes'],
    VendorAssessment: ['notes'],
    VendorEvidenceBundle: ['description'],

    // ─── Tasks + comments ──────────────────────────────
    //  WorkItemRepository searches `title` + `key` only — `description`
    //  is safe to encrypt.
    Task: ['description', 'resolution'],
    TaskComment: ['body'],

    // ─── Compliance audits (model: Audit, not AuditLog) ────
    Audit: [
        'auditScope',
        'criteria',
        'auditors',   // legacy free-text "names" column
        'auditees',   // legacy free-text "names" column
        'departments',
    ],
    AuditChecklistItem: ['prompt', 'notes', 'evidenceRef'],

    // ─── Control test runs ─────────────────────────────
    ControlTestRun: ['notes', 'findingSummary'],

    // ─── Epic G-4 access review campaigns ──────────────
    //  Both columns can carry sensitive reviewer rationale that
    //  should be encrypted at rest:
    //  - AccessReview.description: campaign narrative ("Q1 2026
    //    SOC 2 access review — focus on engineering admin access").
    //  - AccessReviewDecision.notes: per-user justification for
    //    REVOKE / MODIFY ("Removed because user left engineering
    //    on 2026-04-15").
    //  Adding these to the manifest is also necessary because the
    //  fan-out write path encrypts any field NAMED `notes` (it
    //  appears on four other models). Without an explicit entry
    //  the read path wouldn't know to decrypt, returning the v2:
    //  ciphertext to callers.
    AccessReview: ['description'],
    AccessReviewDecision: ['notes'],

    // ─── Epic G-5 control exception register ───────────
    //  `justification` carries the rationale for accepting risk;
    //  surfaces in audit packs alongside the approver. The
    //  `rejectionReason` field is the parallel free-text capture
    //  on REJECTED rows. Both contain narrative that may name
    //  internal users / systems, so they're encrypted at rest.
    ControlException: ['justification', 'rejectionReason'],

    // ─── Epic G-7 risk treatment plans ─────────────────
    //  Both columns can name internal systems / vendors / users:
    //    - RiskTreatmentPlan.closingRemark — narrative rationale
    //      written when a plan is marked COMPLETED.
    //    - TreatmentMilestone.description — milestone detail; may
    //      reference vendors, internal teams, or sensitive
    //      infrastructure.
    RiskTreatmentPlan: ['closingRemark'],
    TreatmentMilestone: ['description'],
} as const;

/** Set of model names with at least one encrypted field. Fast-path check. */
export const ENCRYPTED_MODELS: ReadonlySet<string> = new Set(
    Object.keys(ENCRYPTED_FIELDS),
);

/**
 * Union of every encrypted field name across every model in the
 * manifest. Used by the middleware's fan-out path to short-circuit
 * node traversal: if a node has no keys that intersect this set, it
 * contains no encrypted fields and we can skip the per-model
 * iteration entirely.
 *
 * Correctness note: multiple models share some field names
 * (`description` appears on Finding + Vendor + VendorEvidenceBundle;
 * `notes` on four models). The fan-out path does NOT distinguish
 * which model a nested node belongs to — it relies on the flat set
 * to gate whether decryption is even possible on this node. The
 * per-value `isEncryptedValue()` gate then decides whether to actually
 * decrypt. Plaintext fields that happen to share a name with an
 * encrypted field on another model (e.g. `Risk.description` — not in
 * the manifest) are safe: they don't have the `v1:` prefix so the
 * decrypt is skipped.
 */
export const ALL_ENCRYPTED_FIELD_NAMES: ReadonlySet<string> = new Set(
    Object.values(ENCRYPTED_FIELDS).flat(),
);

/**
 * Fast check: does this node contain any key that could possibly be
 * an encrypted field? Used by the middleware to skip the traversal
 * entirely when a node (or nested included relation) has no
 * manifest-visible fields.
 */
export function nodeHasAnyEncryptedFieldKey(
    node: Record<string, unknown>,
): boolean {
    for (const key of Object.keys(node)) {
        if (ALL_ENCRYPTED_FIELD_NAMES.has(key)) return true;
    }
    return false;
}

/**
 * Returns the encrypted-field list for a model, or `undefined` if
 * the model has no encrypted fields. Callers MUST NOT mutate the
 * returned array.
 */
export function getEncryptedFields(
    modelName: string | undefined,
): readonly string[] | undefined {
    if (!modelName) return undefined;
    return ENCRYPTED_FIELDS[modelName];
}

/** Predicate — is this model in the manifest? */
export function isEncryptedModel(modelName: string | undefined): boolean {
    return modelName !== undefined && ENCRYPTED_MODELS.has(modelName);
}
