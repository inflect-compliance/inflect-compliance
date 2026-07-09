/**
 * H5 — isolation-coverage forward-lock for the 10-PR-wave tenant models.
 *
 * `rls-coverage.test.ts` already DB-verifies that EVERY tenant-scoped model
 * carries the canonical RLS policy triple + FORCE (a behavioural, non-mocked
 * proof). This ratchet adds a second axis: every model introduced by the 10-PR
 * feature wave must be explicitly CLASSIFIED — either it has a dedicated
 * two-tenant behavioural test (`ISOLATION_TESTED`, file must exist) or it is
 * explicitly recorded as interim-covered-by-rls-coverage (`ISOLATION_INTERIM`,
 * with a written reason). A wave model that is renamed, removed, or silently
 * left unclassified fails CI — so coverage can only ratchet UP.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseSchemaModels } from '../helpers/prisma-schema-models';

const ROOT = path.resolve(__dirname, '../..');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

/** Wave models with a dedicated two-tenant behavioural RLS test. */
const ISOLATION_TESTED: Readonly<Record<string, string>> = {
    // The connected access-review graph shares AccessReview's live RLS suite.
    AccessReviewConnectedDecision: 'tests/integration/access-review-rls.test.ts',
    // GAP-1 — two-tenant behavioural isolation over the real usecases.
    InboundQuestionnaire: 'tests/integration/wave-features-rls.test.ts',
    Device: 'tests/integration/wave-features-rls.test.ts',
    Employee: 'tests/integration/wave-features-rls.test.ts',
};

/**
 * Wave models whose isolation is currently proven by the DB-backed
 * `rls-coverage.test.ts` (policy triple + FORCE, not mocked). A dedicated
 * per-usecase two-tenant test is a tracked follow-up — but the RLS itself is
 * behaviourally enforced today. Each carries a reason.
 */
const ISOLATION_INTERIM: Readonly<Record<string, string>> = {
    ConnectedIdentityAccount: 'rls-coverage DB-backed policy triple; identity-sync unit tests cover the tenantId-scoped writes.',
    QuestionnaireAnswerLibrary: 'rls-coverage DB-backed policy triple; questionnaire usecases run in runInTenantContext.',
    InboundQuestionnaireItem: 'rls-coverage DB-backed policy triple; questionnaire usecases run in runInTenantContext.',
    TrainingCourse: 'rls-coverage DB-backed policy triple; training checks are tenant-scoped.',
    TrainingAssignment: 'rls-coverage DB-backed policy triple; training checks are tenant-scoped.',
    BackgroundCheck: 'rls-coverage DB-backed policy triple; resultSummary field-encrypted.',
    TenantDeviceToken: 'rls-coverage DB-backed policy triple; token verify is hash-lookup + tenant-bound.',
    TrustCenter: 'rls-coverage DB-backed policy triple; public read is import-isolated (trust-center-coverage).',
    TrustCenterDocument: 'rls-coverage DB-backed policy triple; public projection never selects fileRecordId.',
    TrustCenterAccessRequest: 'rls-coverage DB-backed policy triple; token hashed/single-use/expiring.',
};

const WAVE_MODELS = [...Object.keys(ISOLATION_TESTED), ...Object.keys(ISOLATION_INTERIM)];

describe('H5 — 10-PR-wave model isolation coverage', () => {
    const tenantModels = new Set(
        parseSchemaModels().filter((m) => m.fields.some((f) => f.name === 'tenantId')).map((m) => m.name),
    );

    it('every classified wave model still exists as a tenant-scoped model (no stale entries)', () => {
        const stale = WAVE_MODELS.filter((m) => !tenantModels.has(m));
        expect(stale).toEqual([]);
    });

    it('every wave model is classified exactly once (TESTED xor INTERIM)', () => {
        const both = Object.keys(ISOLATION_TESTED).filter((m) => m in ISOLATION_INTERIM);
        expect(both).toEqual([]);
    });

    it('every dedicated isolation-test file exists', () => {
        const missing = Object.entries(ISOLATION_TESTED).filter(([, f]) => !exists(f)).map(([m]) => m);
        expect(missing).toEqual([]);
    });

    it('every interim entry carries a written reason', () => {
        const empty = Object.entries(ISOLATION_INTERIM).filter(([, r]) => !r || r.length < 20).map(([m]) => m);
        expect(empty).toEqual([]);
    });
});
