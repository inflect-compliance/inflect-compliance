/* eslint-disable @typescript-eslint/no-explicit-any -- test
 * mocks, fixtures, and adapter shims that mirror runtime contracts
 * (Prisma extensions, NextRequest mocks, JSON-loaded fixtures,
 * spy harnesses). Per-line typing has poor cost/benefit ratio in
 * test files; the file-level disable is the codebase's standard
 * pattern for these surfaces (see also
 * tests/guards/helm-chart-foundation.test.ts and
 * tests/integration/audit-middleware.test.ts). */
/**
 * Policy Lifecycle Integration Tests
 *
 * Validates the Policy domain's adoption of the generic editable lifecycle:
 * - Phase mapping (PolicyStatus ↔ EditablePhase)
 * - PolicyEditableAdapter (load/save cycle via in-memory mock)
 * - End-to-end publish workflow through the generic lifecycle service
 * - Pre-publish validation
 * - No regressions in existing key workflows
 *
 * Test strategy:
 * - In-memory Prisma mock that simulates Policy + PolicyVersion persistence
 * - Full lifecycle transitions using the generic publish/draft/archive functions
 * - Validation of history integrity after multiple publishes
 */

import { LifecycleError } from '@/app-layer/domain/editable-lifecycle.types';
import {
    createEditableState,
    updateDraft,
    publish,
    revertToVersion,
    archive,
    hasPendingChanges,
    hasBeenPublished,
} from '@/app-layer/services/editable-lifecycle';
import type { PolicyPayload } from '@/app-layer/services/policy-lifecycle-adapter';
import {
    policyStatusToPhase,
    phaseToDefaultPolicyStatus,
    validatePolicyPayload,
    POLICY_AUDIT_CONFIG,
    PolicyEditableAdapter,
} from '@/app-layer/services/policy-lifecycle-adapter';
import { PolicyContentType, PolicyStatus } from '@prisma/client';
import type { EditableState } from '@/app-layer/domain/editable-lifecycle.types';
import type { PublishedSnapshot } from '@/app-layer/domain/editable-lifecycle.types';

// ═════════════════════════════════════════════════════════════════════
// Phase Mapping
// ═════════════════════════════════════════════════════════════════════

describe('Policy Phase Mapping', () => {
    describe('policyStatusToPhase', () => {
        it.each([
            ['DRAFT', 'DRAFT'],
            ['IN_REVIEW', 'DRAFT'],
            ['APPROVED', 'DRAFT'],
            ['PUBLISHED', 'PUBLISHED'],
            ['ARCHIVED', 'ARCHIVED'],
        ])('maps PolicyStatus %s → EditablePhase %s', (status, expected) => {
            expect(policyStatusToPhase(status)).toBe(expected);
        });

        it('maps unknown status to DRAFT', () => {
            expect(policyStatusToPhase('UNKNOWN')).toBe('DRAFT');
        });
    });

    describe('phaseToDefaultPolicyStatus', () => {
        it.each([
            ['DRAFT', 'DRAFT'],
            ['PUBLISHED', 'PUBLISHED'],
            ['ARCHIVED', 'ARCHIVED'],
        ] as const)('maps EditablePhase %s → PolicyStatus %s', (phase, expected) => {
            expect(phaseToDefaultPolicyStatus(phase)).toBe(expected);
        });
    });
});

// ═════════════════════════════════════════════════════════════════════
// Policy Audit Config
// ═════════════════════════════════════════════════════════════════════

describe('Policy Audit Config', () => {
    it('uses Policy entity type', () => {
        expect(POLICY_AUDIT_CONFIG.entityType).toBe('Policy');
    });

    it('uses POLICY action prefix', () => {
        expect(POLICY_AUDIT_CONFIG.actionPrefix).toBe('POLICY');
    });
});

// ═════════════════════════════════════════════════════════════════════
// Policy Payload Validation
// ═════════════════════════════════════════════════════════════════════

describe('Policy Payload Validation', () => {
    it('passes for valid MARKDOWN policy', () => {
        const payload: PolicyPayload = {
            contentType: 'MARKDOWN',
            contentText: '# Policy Title\n\nContent here',
            externalUrl: null,
            changeSummary: 'Initial draft',
        };
        expect(() => validatePolicyPayload(payload, {} as any)).not.toThrow();
    });

    it('passes for valid HTML policy', () => {
        const payload: PolicyPayload = {
            contentType: 'HTML',
            contentText: '<h1>Policy</h1><p>Content</p>',
            externalUrl: null,
            changeSummary: null,
        };
        expect(() => validatePolicyPayload(payload, {} as any)).not.toThrow();
    });

    it('passes for valid EXTERNAL_LINK policy', () => {
        const payload: PolicyPayload = {
            contentType: 'EXTERNAL_LINK',
            contentText: null,
            externalUrl: 'https://docs.example.com/policy',
            changeSummary: null,
        };
        expect(() => validatePolicyPayload(payload, {} as any)).not.toThrow();
    });

    it('rejects MARKDOWN without contentText', () => {
        const payload: PolicyPayload = {
            contentType: 'MARKDOWN',
            contentText: null,
            externalUrl: null,
            changeSummary: null,
        };
        expect(() => validatePolicyPayload(payload, {} as any))
            .toThrow('contentText is required');
    });

    it('rejects HTML without contentText', () => {
        const payload: PolicyPayload = {
            contentType: 'HTML',
            contentText: null,
            externalUrl: null,
            changeSummary: null,
        };
        expect(() => validatePolicyPayload(payload, {} as any))
            .toThrow('contentText is required');
    });

    it('rejects EXTERNAL_LINK without externalUrl', () => {
        const payload: PolicyPayload = {
            contentType: 'EXTERNAL_LINK',
            contentText: null,
            externalUrl: null,
            changeSummary: null,
        };
        expect(() => validatePolicyPayload(payload, {} as any))
            .toThrow('externalUrl is required');
    });
});

// ═════════════════════════════════════════════════════════════════════
// Policy Lifecycle (Pure, via generic service)
// ═════════════════════════════════════════════════════════════════════

describe('Policy Lifecycle (generic service integration)', () => {
    const MARKDOWN_V1: PolicyPayload = {
        contentType: 'MARKDOWN',
        contentText: '# Information Security Policy\n\nVersion 1 content.',
        externalUrl: null,
        changeSummary: 'Initial policy draft',
    };

    const MARKDOWN_V2: PolicyPayload = {
        contentType: 'MARKDOWN',
        contentText: '# Information Security Policy\n\nVersion 2 — updated scope.',
        externalUrl: null,
        changeSummary: 'Updated scope section',
    };

    const MARKDOWN_V3: PolicyPayload = {
        contentType: 'MARKDOWN',
        contentText: '# Information Security Policy\n\nVersion 3 — final revision.',
        externalUrl: null,
        changeSummary: 'Final revision',
    };

    const EXTERNAL_V1: PolicyPayload = {
        contentType: 'EXTERNAL_LINK',
        contentText: null,
        externalUrl: 'https://docs.example.com/policy/v1',
        changeSummary: 'Linked to external doc',
    };

    // ─── Draft Editing ───────────────────────────────────────────

    describe('draft editing', () => {
        it('creates initial policy with MARKDOWN draft', () => {
            const state = createEditableState(MARKDOWN_V1);

            expect(state.phase).toBe('DRAFT');
            expect(state.currentVersion).toBe(1);
            expect(state.draft).toEqual(MARKDOWN_V1);
            expect(state.published).toBeNull();
        });

        it('creates initial policy with EXTERNAL_LINK draft', () => {
            const state = createEditableState(EXTERNAL_V1);

            expect(state.draft).toEqual(EXTERNAL_V1);
        });

        it('updates draft content without changing version', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = updateDraft(state, MARKDOWN_V2);

            expect(state.draft).toEqual(MARKDOWN_V2);
            expect(state.currentVersion).toBe(1);
        });

        it('switches content type in draft', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = updateDraft(state, EXTERNAL_V1);

            expect(state.draft!.contentType).toBe('EXTERNAL_LINK');
            expect(state.draft!.externalUrl).toBe('https://docs.example.com/policy/v1');
            expect(state.draft!.contentText).toBeNull();
        });

        it('editing after publish creates pending changes', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin' });

            expect(hasPendingChanges(state)).toBe(false);

            state = updateDraft(state, MARKDOWN_V2);
            expect(hasPendingChanges(state)).toBe(true);
            expect(state.phase).toBe('DRAFT'); // back to DRAFT
        });
    });

    // ─── First Publish ───────────────────────────────────────────

    describe('first publish', () => {
        it('promotes draft to published', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1', changeSummary: 'First release' });

            expect(state.phase).toBe('PUBLISHED');
            expect(state.currentVersion).toBe(2);
            expect(state.published).toEqual(MARKDOWN_V1);
            expect(state.draft).toBeNull();
        });

        it('creates no history on first publish', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' });

            expect(state.history).toHaveLength(0);
        });

        it('marks entity as published', () => {
            let state = createEditableState(MARKDOWN_V1);
            expect(hasBeenPublished(state)).toBe(false);

            state = publish(state, { publishedBy: 'admin-1' });
            expect(hasBeenPublished(state)).toBe(true);
        });
    });

    // ─── Subsequent Publishes (Version History) ──────────────────

    describe('subsequent publishes and version history', () => {
        it('snapshots prior live state to history', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' }); // v1
            state = updateDraft(state, MARKDOWN_V2);
            state = publish(state, { publishedBy: 'admin-1', changeSummary: 'Updated scope' }); // v2

            expect(state.currentVersion).toBe(3);
            expect(state.published).toEqual(MARKDOWN_V2);
            expect(state.history).toHaveLength(1);
            expect(state.history[0].version).toBe(2);
            expect(state.history[0].payload).toEqual(MARKDOWN_V1);
        });

        it('preserves ordered history across 3 publishes', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' }); // v1
            state = updateDraft(state, MARKDOWN_V2);
            state = publish(state, { publishedBy: 'admin-1' }); // v2
            state = updateDraft(state, MARKDOWN_V3);
            state = publish(state, { publishedBy: 'admin-2' }); // v3

            expect(state.currentVersion).toBe(4);
            expect(state.history).toHaveLength(2);

            // History is ordered oldest first
            expect(state.history[0].version).toBe(2);
            expect(state.history[0].payload.contentText).toContain('Version 1');
            expect(state.history[1].version).toBe(3);
            expect(state.history[1].payload.contentText).toContain('Version 2');

            // Current published is v3
            expect(state.published!.contentText).toContain('Version 3');
        });

        it('snapshot preserves content type changes in history', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' }); // v1: MARKDOWN
            state = updateDraft(state, EXTERNAL_V1);
            state = publish(state, { publishedBy: 'admin-1' }); // v2: EXTERNAL_LINK

            expect(state.history[0].payload.contentType).toBe('MARKDOWN');
            expect(state.published!.contentType).toBe('EXTERNAL_LINK');
        });
    });

    // ─── Revert to Prior Version ─────────────────────────────────

    describe('revert to prior version', () => {
        it('reverts draft to historical version', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' }); // v1
            state = updateDraft(state, MARKDOWN_V2);
            state = publish(state, { publishedBy: 'admin-1' }); // v2

            state = revertToVersion(state, { targetVersion: 2 });

            expect(state.draft).toEqual(MARKDOWN_V1);
            expect(state.published).toEqual(MARKDOWN_V2); // v2 still live
            expect(state.phase).toBe('DRAFT');
        });

        it('reverted content can be re-published', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' }); // v1
            state = updateDraft(state, MARKDOWN_V2);
            state = publish(state, { publishedBy: 'admin-1' }); // v2

            state = revertToVersion(state, { targetVersion: 2 });
            state = publish(state, { publishedBy: 'admin-1', changeSummary: 'Reverted to v2' }); // v4

            expect(state.currentVersion).toBe(4);
            expect(state.published).toEqual(MARKDOWN_V1); // v1 content is back as live
            expect(state.history).toHaveLength(2); // v1 + v2 snapshots
        });
    });

    // ─── Archive ─────────────────────────────────────────────────

    describe('archive', () => {
        it('freezes policy', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' });
            state = archive(state);

            expect(state.phase).toBe('ARCHIVED');
        });

        it('preserves published content after archive', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' });
            state = archive(state);

            expect(state.published).toEqual(MARKDOWN_V1);
        });

        it('preserves version history after archive', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' });
            state = updateDraft(state, MARKDOWN_V2);
            state = publish(state, { publishedBy: 'admin-1' });
            state = archive(state);

            expect(state.history).toHaveLength(1);
            expect(state.history[0].version).toBe(2);
        });

        it('blocks edits after archive', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' });
            state = archive(state);

            expect(() => updateDraft(state, MARKDOWN_V2)).toThrow(LifecycleError);
            expect(() => publish(state, { publishedBy: 'admin-1' })).toThrow(LifecycleError);
        });
    });

    // ─── Existing Workflow Regression Guards ─────────────────────

    describe('existing workflow regression guards', () => {
        it('cannot publish without draft content', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' });

            // No draft → cannot publish again
            expect(() => publish(state, { publishedBy: 'admin-1' }))
                .toThrow(LifecycleError);
        });

        it('creating new content after publish moves back to DRAFT', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' });

            expect(state.phase).toBe('PUBLISHED');

            state = updateDraft(state, MARKDOWN_V2);
            expect(state.phase).toBe('DRAFT'); // matches existing: "createPolicyVersion → DRAFT"
        });

        it('version number only increments on publish, not on draft edits', () => {
            let state = createEditableState(MARKDOWN_V1);
            expect(state.currentVersion).toBe(1);

            state = updateDraft(state, MARKDOWN_V2);
            expect(state.currentVersion).toBe(1); // no increment

            state = updateDraft(state, MARKDOWN_V3);
            expect(state.currentVersion).toBe(1); // still no increment

            state = publish(state, { publishedBy: 'admin-1' });
            expect(state.currentVersion).toBe(2); // now increments
        });

        it('archived policy cannot create new versions', () => {
            let state = createEditableState(MARKDOWN_V1);
            state = publish(state, { publishedBy: 'admin-1' });
            state = archive(state);

            // This mirrors: "Cannot create version for an archived policy"
            expect(() => updateDraft(state, MARKDOWN_V2))
                .toThrow(LifecycleError);
        });
    });

    // ─── Full Policy Lifecycle (E2E) ─────────────────────────────

    describe('full policy lifecycle (end-to-end)', () => {
        it('complete policy lifecycle mirrors existing behavior', () => {
            // 1. Author creates policy with initial draft
            let state = createEditableState<PolicyPayload>({
                contentType: 'MARKDOWN',
                contentText: '# Acceptable Use Policy\n\n## 1. Purpose\n...',
                externalUrl: null,
                changeSummary: 'Initial draft',
            });
            expect(state.phase).toBe('DRAFT');
            expect(state.currentVersion).toBe(1);

            // 2. Author iterates on the draft
            state = updateDraft(state, {
                contentType: 'MARKDOWN',
                contentText: '# Acceptable Use Policy\n\n## 1. Purpose\nThis policy establishes...',
                externalUrl: null,
                changeSummary: 'Added purpose section',
            });
            expect(state.currentVersion).toBe(1); // no version bump on drafts

            // 3. Admin publishes v1 (after approval workflow in the real system)
            state = publish(state, { publishedBy: 'admin-1', changeSummary: 'First release' });
            expect(state.phase).toBe('PUBLISHED');
            expect(state.currentVersion).toBe(2);
            expect(state.history).toHaveLength(0); // first publish, no prior

            // 4. Author creates new draft for v2
            state = updateDraft(state, {
                contentType: 'MARKDOWN',
                contentText: '# Acceptable Use Policy v2\n\nExpanded scope...',
                externalUrl: null,
                changeSummary: 'Expanded scope for remote work',
            });
            expect(state.phase).toBe('DRAFT'); // back to draft
            expect(state.published!.contentText).toContain('Purpose'); // v1 still live

            // 5. Publish v2 — v1 is archived to history
            state = publish(state, { publishedBy: 'admin-1', changeSummary: 'v2 release' });
            expect(state.currentVersion).toBe(3);
            expect(state.history).toHaveLength(1);
            expect(state.history[0].version).toBe(2);

            // 6. Compliance team decides v1 was better, reverts
            state = revertToVersion(state, { targetVersion: 2 });
            expect(state.draft!.contentText).toContain('Purpose');
            expect(state.published!.contentText).toContain('Expanded scope'); // v2 still live

            // 7. Re-publish reverted v2 content as v4
            state = publish(state, { publishedBy: 'admin-2', changeSummary: 'Reverted to v2 policy' });
            expect(state.currentVersion).toBe(4);
            expect(state.history).toHaveLength(2);

            // 8. Archive the policy
            state = archive(state);
            expect(state.phase).toBe('ARCHIVED');

            // Verify everything is frozen
            expect(() => updateDraft(state, MARKDOWN_V1)).toThrow(LifecycleError);
            expect(() => publish(state, { publishedBy: 'admin-1' })).toThrow(LifecycleError);
            expect(() => revertToVersion(state, { targetVersion: 2 })).toThrow(LifecycleError);

            // But the data is preserved for audit
            expect(state.published).not.toBeNull();
            expect(state.history).toHaveLength(2);
        });
    });
});

// ═════════════════════════════════════════════════════════════════════
// PolicyEditableAdapter — loadState / saveState branch coverage
//
// Pure unit test: loadState / saveState take a `db` (PrismaTx) directly,
// so we pass a hand-rolled fake db with jest.fn() finders/writers. No DB.
// Each test names the branch class it protects.
// ═════════════════════════════════════════════════════════════════════

const TENANT = 'tenant-1';
const USER = 'user-1';

function adapter() {
    return new PolicyEditableAdapter(TENANT, USER);
}

function makeVersion(over: Partial<any> = {}) {
    return {
        id: 'v1',
        versionNumber: 1,
        contentType: PolicyContentType.MARKDOWN,
        contentText: 'body',
        externalUrl: null,
        changeSummary: 'summary',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        createdById: 'author-1',
        ...over,
    };
}

function makeDb() {
    return {
        policy: {
            findFirst: jest.fn(),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        policyVersion: {
            findFirst: jest.fn(),
            create: jest.fn(),
        },
    };
}

describe('PolicyEditableAdapter.loadState', () => {
    it('returns null when the policy is not found', async () => {
        // Branch: !policy → return null.
        const db = makeDb();
        db.policy.findFirst.mockResolvedValue(null);
        expect(await adapter().loadState(db as any, 'p1')).toBeNull();
    });

    it('PUBLISHED with currentVersion → published payload + attribution + history reconstruction', async () => {
        // Branches: currentVersion truthy → published set; phase==='PUBLISHED' && currentVersion
        // → publishedBy / publishedChangeSummary set; lifecycleVersion used for counter;
        // history fall-back reconstruction (lifecycleHistoryJson null).
        const db = makeDb();
        const cur = makeVersion({ id: 'vc', versionNumber: 3 });
        const old = makeVersion({ id: 'vold', versionNumber: 2, createdById: 'prev', changeSummary: null });
        db.policy.findFirst.mockResolvedValue({
            id: 'p1',
            status: 'PUBLISHED',
            lifecycleVersion: 3,
            lifecycleHistoryJson: null,
            currentVersion: cur,
            versions: [old, cur],
        });

        const state = await adapter().loadState(db as any, 'p1');
        expect(state).not.toBeNull();
        expect(state!.phase).toBe('PUBLISHED');
        expect(state!.currentVersion).toBe(3);
        expect(state!.published).toEqual({
            contentType: cur.contentType,
            contentText: cur.contentText,
            externalUrl: cur.externalUrl,
            changeSummary: cur.changeSummary,
        });
        expect(state!.draft).toBeNull(); // phase !== DRAFT
        expect(state!.publishedBy).toBe('author-1');
        expect(state!.publishedChangeSummary).toBe('summary');
        // Reconstruction excludes currentVersion (vc); vold remains.
        expect(state!.history).toHaveLength(1);
        expect(state!.history[0].version).toBe(2);
        expect(state!.history[0].publishedBy).toBe('prev');
        // changeSummary null → undefined via `?? undefined`.
        expect(state!.history[0].changeSummary).toBeUndefined();
    });

    it('PUBLISHED currentVersion with null changeSummary → publishedChangeSummary null (?? null) + version fallback', async () => {
        // Branches: currentVersion.changeSummary ?? null → null; lifecycleVersion null
        // → currentVersion?.versionNumber fallback.
        const db = makeDb();
        const cur = makeVersion({ id: 'vc', versionNumber: 1, changeSummary: null });
        db.policy.findFirst.mockResolvedValue({
            id: 'p1',
            status: 'PUBLISHED',
            lifecycleVersion: null,
            lifecycleHistoryJson: null,
            currentVersion: cur,
            versions: [cur],
        });
        const state = await adapter().loadState(db as any, 'p1');
        expect(state!.currentVersion).toBe(1);
        expect(state!.publishedChangeSummary).toBeNull();
    });

    it('no currentVersion + no lifecycleVersion → counter defaults to 1, published null, no attribution', async () => {
        // Branches: currentVersion falsy → published null, publishedBy/Summary null;
        // lifecycleVersion ?? currentVersion?.versionNumber ?? 1 → final `?? 1` default.
        const db = makeDb();
        db.policy.findFirst.mockResolvedValue({
            id: 'p1',
            status: 'DRAFT',
            lifecycleVersion: null,
            lifecycleHistoryJson: null,
            currentVersion: null,
            versions: [],
        });
        const state = await adapter().loadState(db as any, 'p1');
        expect(state!.currentVersion).toBe(1);
        expect(state!.published).toBeNull();
        expect(state!.publishedBy).toBeNull();
        expect(state!.publishedChangeSummary).toBeNull();
        expect(state!.draft).toBeNull(); // versions empty → length>0 guard false
        expect(state!.history).toEqual([]); // reconstruction with no current → filter(false)
    });

    it('DRAFT with latest version differing from currentVersion → draft from latest', async () => {
        // Branch: phase==='DRAFT' && versions.length>0; latest.id !== current.id → draft set.
        const db = makeDb();
        const cur = makeVersion({ id: 'vc', versionNumber: 1, contentText: 'published-body' });
        const latest = makeVersion({ id: 'vlatest', versionNumber: 2, contentText: 'draft-body' });
        db.policy.findFirst.mockResolvedValue({
            id: 'p1',
            status: 'DRAFT',
            lifecycleVersion: 1,
            lifecycleHistoryJson: null,
            currentVersion: cur,
            versions: [cur, latest],
        });
        const state = await adapter().loadState(db as any, 'p1');
        expect(state!.phase).toBe('DRAFT');
        expect(state!.draft).toEqual({
            contentType: latest.contentType,
            contentText: 'draft-body',
            externalUrl: null,
            changeSummary: latest.changeSummary,
        });
        // Reconstruction excludes current (vc) AND the draft's latest versionNumber → empty.
        expect(state!.history).toEqual([]);
    });

    it('DRAFT where latest version IS currentVersion → draft = published (else-if branch)', async () => {
        // Branch: latest.id === current.id → else-if `phase==='DRAFT' && currentVersion` → draft=published.
        const db = makeDb();
        const cur = makeVersion({ id: 'vc', versionNumber: 1 });
        db.policy.findFirst.mockResolvedValue({
            id: 'p1',
            status: 'DRAFT',
            lifecycleVersion: 1,
            lifecycleHistoryJson: null,
            currentVersion: cur,
            versions: [cur],
        });
        const state = await adapter().loadState(db as any, 'p1');
        expect(state!.draft).toEqual(state!.published);
        expect(state!.draft).not.toBeNull();
    });

    it('DRAFT with versions but no currentVersion → draft from latest (!currentVersion branch)', async () => {
        // Branch: phase==='DRAFT', versions.length>0, !currentVersion → draft from latest.
        const db = makeDb();
        const latest = makeVersion({ id: 'vlatest', versionNumber: 1, contentText: 'only-draft' });
        db.policy.findFirst.mockResolvedValue({
            id: 'p1',
            status: 'DRAFT',
            lifecycleVersion: null,
            lifecycleHistoryJson: null,
            currentVersion: null,
            versions: [latest],
        });
        const state = await adapter().loadState(db as any, 'p1');
        expect(state!.draft?.contentText).toBe('only-draft');
    });

    it('uses persisted lifecycleHistoryJson when present (skips reconstruction)', async () => {
        // Branch: Array.isArray(persistedHistory) && length>0 → use persisted.
        const persisted: PublishedSnapshot<PolicyPayload>[] = [
            {
                version: 1,
                payload: { contentType: PolicyContentType.MARKDOWN, contentText: 'old', externalUrl: null, changeSummary: 'first' },
                publishedAt: '2026-01-01T00:00:00.000Z',
                publishedBy: 'u-old',
                changeSummary: 'first',
            },
        ];
        const db = makeDb();
        const cur = makeVersion({ id: 'vc', versionNumber: 2 });
        db.policy.findFirst.mockResolvedValue({
            id: 'p1',
            status: 'PUBLISHED',
            lifecycleVersion: 2,
            lifecycleHistoryJson: persisted,
            currentVersion: cur,
            versions: [cur],
        });
        const state = await adapter().loadState(db as any, 'p1');
        expect(state!.history).toEqual(persisted);
    });

    it('falls back to reconstruction when lifecycleHistoryJson is an empty array', async () => {
        // Branch: Array.isArray true but length===0 → else (reconstruction) branch.
        const db = makeDb();
        const cur = makeVersion({ id: 'vc', versionNumber: 2 });
        const old = makeVersion({ id: 'vold', versionNumber: 1, createdById: 'prev' });
        db.policy.findFirst.mockResolvedValue({
            id: 'p1',
            status: 'PUBLISHED',
            lifecycleVersion: 2,
            lifecycleHistoryJson: [],
            currentVersion: cur,
            versions: [old, cur],
        });
        const state = await adapter().loadState(db as any, 'p1');
        expect(state!.history.map((h) => h.version)).toEqual([1]);
    });

    it('handles versions undefined (versions || [] default) on an ARCHIVED policy', async () => {
        // Branch: `policy.versions || []` falsy fallback.
        const db = makeDb();
        db.policy.findFirst.mockResolvedValue({
            id: 'p1',
            status: 'ARCHIVED',
            lifecycleVersion: 5,
            lifecycleHistoryJson: null,
            currentVersion: null,
            versions: undefined,
        });
        const state = await adapter().loadState(db as any, 'p1');
        expect(state!.phase).toBe('ARCHIVED');
        expect(state!.currentVersion).toBe(5);
        expect(state!.history).toEqual([]);
    });
});

describe('PolicyEditableAdapter.saveState', () => {
    function publishedState(over: Partial<EditableState<PolicyPayload>> = {}): EditableState<PolicyPayload> {
        return {
            phase: 'PUBLISHED',
            currentVersion: 2,
            draft: null,
            published: {
                contentType: PolicyContentType.MARKDOWN,
                contentText: 'live',
                externalUrl: null,
                changeSummary: 'publish summary',
            },
            publishedBy: USER,
            publishedChangeSummary: 'publish summary',
            history: [],
            ...over,
        };
    }

    it('PUBLISHED + published set + version row absent → creates version then updateMany with new id', async () => {
        // Branch: phase==='PUBLISHED' && published!==null; !existing → create + updateMany.
        const db = makeDb();
        db.policyVersion.findFirst.mockResolvedValue(null);
        db.policyVersion.create.mockResolvedValue({ id: 'new-v' });
        await adapter().saveState(db as any, 'p1', publishedState());
        expect(db.policyVersion.create).toHaveBeenCalledTimes(1);
        const createArg = db.policyVersion.create.mock.calls[0][0].data;
        expect(createArg).toMatchObject({
            tenantId: TENANT,
            policyId: 'p1',
            versionNumber: 2,
            createdById: USER,
        });
        expect(db.policy.updateMany).toHaveBeenCalledTimes(1);
        const updArg = db.policy.updateMany.mock.calls[0][0].data;
        expect(updArg.currentVersionId).toBe('new-v');
        expect(updArg.status).toBe(PolicyStatus.PUBLISHED);
        expect(updArg.lifecycleVersion).toBe(2);
        // history empty → historyJson undefined → no lifecycleHistoryJson key.
        expect('lifecycleHistoryJson' in updArg).toBe(false);
    });

    it('PUBLISHED + version row already exists → no create, updateMany with existing id', async () => {
        // Branch: existing truthy → else branch (idempotent), no create.
        const db = makeDb();
        db.policyVersion.findFirst.mockResolvedValue({ id: 'existing-v' });
        await adapter().saveState(db as any, 'p1', publishedState());
        expect(db.policyVersion.create).not.toHaveBeenCalled();
        expect(db.policy.updateMany).toHaveBeenCalledTimes(1);
        expect(db.policy.updateMany.mock.calls[0][0].data.currentVersionId).toBe('existing-v');
    });

    it('PUBLISHED with non-empty history → writes lifecycleHistoryJson (create path)', async () => {
        // Branch: historyJson truthy → spread lifecycleHistoryJson into update data.
        const db = makeDb();
        db.policyVersion.findFirst.mockResolvedValue(null);
        db.policyVersion.create.mockResolvedValue({ id: 'new-v' });
        const history: PublishedSnapshot<PolicyPayload>[] = [
            {
                version: 1,
                payload: { contentType: PolicyContentType.MARKDOWN, contentText: 'old', externalUrl: null, changeSummary: null },
                publishedAt: '2026-01-01T00:00:00.000Z',
                publishedBy: 'u',
            },
        ];
        await adapter().saveState(db as any, 'p1', publishedState({ history }));
        expect(db.policy.updateMany.mock.calls[0][0].data.lifecycleHistoryJson).toBe(history);
    });

    it('PUBLISHED + existing version + non-empty history → writes lifecycleHistoryJson (existing path)', async () => {
        // Branch: existing truthy AND historyJson truthy.
        const db = makeDb();
        db.policyVersion.findFirst.mockResolvedValue({ id: 'existing-v' });
        const history: PublishedSnapshot<PolicyPayload>[] = [
            {
                version: 1,
                payload: { contentType: PolicyContentType.HTML, contentText: 'h', externalUrl: null, changeSummary: 's' },
                publishedAt: '2026-02-01T00:00:00.000Z',
                publishedBy: 'u2',
                changeSummary: 's',
            },
        ];
        await adapter().saveState(db as any, 'p1', publishedState({ history }));
        expect(db.policy.updateMany.mock.calls[0][0].data.lifecycleHistoryJson).toBe(history);
    });

    it('PUBLISHED but published === null → falls to non-publish branch (updateMany only)', async () => {
        // Branch: phase==='PUBLISHED' but published===null → else (non-publish) branch.
        const db = makeDb();
        await adapter().saveState(db as any, 'p1', publishedState({ published: null }));
        expect(db.policyVersion.create).not.toHaveBeenCalled();
        expect(db.policyVersion.findFirst).not.toHaveBeenCalled();
        expect(db.policy.updateMany).toHaveBeenCalledTimes(1);
        const updArg = db.policy.updateMany.mock.calls[0][0].data;
        expect(updArg.status).toBe(PolicyStatus.PUBLISHED);
        expect(updArg.lifecycleVersion).toBe(2);
    });

    it('DRAFT phase → non-publish branch, no history key when history empty', async () => {
        // Branch: phase !== 'PUBLISHED' → else branch; historyJson undefined.
        const db = makeDb();
        await adapter().saveState(db as any, 'p1', {
            phase: 'DRAFT',
            currentVersion: 1,
            draft: { contentType: PolicyContentType.MARKDOWN, contentText: 'd', externalUrl: null, changeSummary: null },
            published: null,
            publishedBy: null,
            publishedChangeSummary: null,
            history: [],
        });
        expect(db.policyVersion.create).not.toHaveBeenCalled();
        const updArg = db.policy.updateMany.mock.calls[0][0].data;
        expect(updArg.status).toBe(PolicyStatus.DRAFT);
        expect('lifecycleHistoryJson' in updArg).toBe(false);
    });

    it('ARCHIVED phase with history → non-publish branch writes lifecycleHistoryJson', async () => {
        // Branch: else branch + historyJson truthy.
        const db = makeDb();
        const history: PublishedSnapshot<PolicyPayload>[] = [
            {
                version: 2,
                payload: { contentType: PolicyContentType.MARKDOWN, contentText: 'x', externalUrl: null, changeSummary: null },
                publishedAt: '2026-03-01T00:00:00.000Z',
                publishedBy: 'u',
            },
        ];
        await adapter().saveState(db as any, 'p1', {
            phase: 'ARCHIVED',
            currentVersion: 3,
            draft: null,
            published: { contentType: PolicyContentType.MARKDOWN, contentText: 'x', externalUrl: null, changeSummary: null },
            publishedBy: 'u',
            publishedChangeSummary: null,
            history,
        });
        const updArg = db.policy.updateMany.mock.calls[0][0].data;
        expect(updArg.status).toBe(PolicyStatus.ARCHIVED);
        expect(updArg.lifecycleHistoryJson).toBe(history);
    });
});
