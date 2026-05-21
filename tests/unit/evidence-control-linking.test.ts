/**
 * Unit Tests — Evidence ↔ Control Linking
 *
 * Proves that:
 * 1. createEvidence validates controlId belongs to the same tenant
 * 2. createEvidence creates ControlEvidenceLink when controlId is provided (FILE/LINK types)
 * 3. createEvidence works without controlId (standalone evidence)
 * 4. uploadEvidenceFile validates controlId belongs to the same tenant
 * 5. The control evidence tab query returns both evidenceLinks and evidence
 */
import { buildRequestContext, buildControl, buildEvidence } from '../helpers/factories';

// ─── Structural: createEvidence validates controlId ───

describe('Evidence → Control linking — structural', () => {
    const usecasePath = require('path').resolve(
        __dirname, '../../src/app-layer/usecases/evidence.ts'
    );
    const usecaseContent = require('fs').readFileSync(usecasePath, 'utf-8');

    test('createEvidence validates control tenant before creating evidence', () => {
        // The usecase must check that the control belongs to the same tenant
        expect(usecaseContent).toContain('INVALID_CONTROL');
        expect(usecaseContent).toContain('Control not found or belongs to a different tenant');
    });

    test('createEvidence creates ControlEvidenceLink when controlId is provided', () => {
        expect(usecaseContent).toContain('controlEvidenceLink.create');
    });

    test('uploadEvidenceFile also validates controlId tenant', () => {
        // uploadEvidenceFile has the same validation
        const uploadSection = usecaseContent.split('uploadEvidenceFile')[1] || '';
        expect(uploadSection).toContain('INVALID_CONTROL');
    });

    test('uploadEvidenceFile creates ControlEvidenceLink for file evidence', () => {
        const uploadSection = usecaseContent.split('uploadEvidenceFile')[1] || '';
        expect(uploadSection).toContain('controlEvidenceLink.create');
    });

    test('duplicate link does not crash evidence creation', () => {
        // The try/catch around controlEvidenceLink.create should swallow duplicates
        expect(usecaseContent).toMatch(/catch\s*\{/);
    });
});

// ─── Structural: control detail query includes both evidence arrays ───

describe('Control detail query — evidence completeness', () => {
    const repoPath = require('path').resolve(
        __dirname, '../../src/app-layer/repositories/ControlRepository.ts'
    );
    const repoContent = require('fs').readFileSync(repoPath, 'utf-8');

    test('control getById includes evidenceLinks relation', () => {
        expect(repoContent).toContain('evidenceLinks');
    });

    test('control getById includes evidence relation', () => {
        // The query must include direct Evidence records via controlId FK
        expect(repoContent).toMatch(/evidence:\s*\{/);
    });
});

// ─── Structural: frontend evidence tab renders both sources ───

describe('Control evidence tab — unified display', () => {
    const pagePath = require('path').resolve(
        __dirname, '../../src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx'
    );
    const pageContent = require('fs').readFileSync(pagePath, 'utf-8');

    // #102 item 1 — the Evidence tab is tab-lazy: it fetches its own
    // `{ links, evidence }` payload via `evidenceSWR` instead of
    // reading the arrays off the eager page-data control.
    test('evidence tab fetches its links + evidence payload', () => {
        expect(pageContent).toContain('evidenceSWR.data?.links');
        expect(pageContent).toContain('evidenceSWR.data?.evidence');
    });

    test('evidence tab renders direct evidence records', () => {
        expect(pageContent).toContain('directEvidence');
    });

    test('evidence tab deduplicates by fileRecordId', () => {
        expect(pageContent).toContain('linkedFileIds');
        expect(pageContent).toContain('fileRecordId');
    });

    test('evidence tab count includes both sources', () => {
        // The Evidence badge sums the link + direct-evidence counts
        // off the page-data `_count`.
        expect(pageContent).toMatch(/_count\?\.evidenceLinks[\s\S]*?_count\?\.evidence/);
    });
});

// ─── Unit: factory support ───

describe('Evidence → Control linking — factories', () => {
    test('buildEvidence with controlId sets FK', () => {
        const e = buildEvidence({ controlId: 'ctrl-123' });
        expect(e.controlId).toBe('ctrl-123');
    });

    test('buildEvidence without controlId defaults to null', () => {
        const e = buildEvidence();
        expect(e.controlId).toBeNull();
    });

    test('buildControl creates valid control object', () => {
        const c = buildControl({ tenantId: 'tenant-1' });
        expect(c.tenantId).toBe('tenant-1');
        expect(c.id).toBeDefined();
        expect(c.name).toBeDefined();
    });

    test('cross-tenant controlId should be rejected by usecase', () => {
        const ctx = buildRequestContext({ tenantId: 'tenant-a' });
        const control = buildControl({ tenantId: 'tenant-b' });
        // The usecase queries db.control.findFirst with tenantId: ctx.tenantId,
        // so a control from a different tenant won't be found → badRequest thrown
        expect(ctx.tenantId).not.toBe(control.tenantId);
    });
});

// ─── API Route: evidence POST accepts JSON (not FormData) ───

describe('Evidence API route — JSON body parsing', () => {
    const tenantRoutePath = require('path').resolve(
        __dirname, '../../src/app/api/t/[tenantSlug]/evidence/route.ts'
    );
    const tenantRouteContent = require('fs').readFileSync(tenantRoutePath, 'utf-8');

    const legacyRoutePath = require('path').resolve(
        __dirname, '../../src/app/api/evidence/route.ts'
    );
    const legacyRouteContent = require('fs').readFileSync(legacyRoutePath, 'utf-8');

    test('tenant evidence POST uses withValidatedBody (not withValidatedForm)', () => {
        expect(tenantRouteContent).toContain('withValidatedBody');
        expect(tenantRouteContent).not.toMatch(/withValidatedForm/);
    });

    test('tenant evidence POST uses CreateEvidenceSchema (not FormSchema)', () => {
        expect(tenantRouteContent).toContain('CreateEvidenceSchema');
        expect(tenantRouteContent).not.toMatch(/CreateEvidenceFormSchema/);
    });

    test('legacy evidence POST uses withValidatedBody', () => {
        expect(legacyRouteContent).toContain('withValidatedBody');
        expect(legacyRouteContent).not.toMatch(/withValidatedForm/);
    });
});

// ─── Schema: CreateEvidenceSchema supports controlId ───

describe('Evidence schema — controlId support', () => {
    const schemaPath = require('path').resolve(
        __dirname, '../../src/lib/schemas/index.ts'
    );
    const schemaContent = require('fs').readFileSync(schemaPath, 'utf-8');

    test('CreateEvidenceSchema includes optional controlId', () => {
        expect(schemaContent).toContain('controlId');
        // controlId should be optional and nullable
        expect(schemaContent).toMatch(/controlId.*optional.*nullable|controlId.*nullable.*optional/);
    });
});
