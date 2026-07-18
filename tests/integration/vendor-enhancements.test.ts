import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Vendor Enhancements Integration', () => {
    const apiBase = join(process.cwd(), 'src/app/api/t/[tenantSlug]/vendors');

    describe('New routes exist', () => {
        const routes = [
            'metrics/route.ts',
            '[vendorId]/enrich/route.ts',
        ];

        it.each(routes)('route %s exists', (route) => {
            expect(existsSync(join(apiBase, route))).toBe(true);
        });
    });

    describe('New routes have no prisma imports', () => {
        const routes = ['metrics/route.ts', '[vendorId]/enrich/route.ts'];

        it.each(routes)('route %s no direct prisma', (route) => {
            const f = join(apiBase, route);
            if (!existsSync(f)) return;
            const content = readFileSync(f, 'utf-8');
            expect(content).not.toMatch(/from\s+['"]@\/lib\/prisma['"]/);
            expect(content).not.toMatch(/from\s+['"]@prisma\/client['"]/);
        });
    });

    describe('Dashboard page exists', () => {
        it('dashboard page.tsx exists', () => {
            const p = join(process.cwd(), 'src/app/t/[tenantSlug]/(app)/vendors/dashboard/page.tsx');
            expect(existsSync(p)).toBe(true);
        });
    });

    describe('Enrichment provider importable', () => {
        it('TestModeEnrichmentProvider works', () => {
            const mod = require('../../src/app-layer/services/vendor-enrichment');
            expect(typeof mod.TestModeEnrichmentProvider).toBe('function');
            expect(typeof mod.getEnrichmentProvider).toBe('function');
        });

        it('getEnrichmentProvider returns test mode by default', () => {
            const { getEnrichmentProvider } = require('../../src/app-layer/services/vendor-enrichment');
            const p = getEnrichmentProvider();
            expect(p.name).toBe('TEST_MODE');
        });
    });

    describe('Renewals service importable', () => {
        it('classifyDueDate is exported', () => {
            const mod = require('../../src/app-layer/services/vendor-renewals');
            expect(typeof mod.classifyDueDate).toBe('function');
        });

        it('findDueVendorsAndEmitEvents is exported', () => {
            const mod = require('../../src/app-layer/services/vendor-renewals');
            expect(typeof mod.findDueVendorsAndEmitEvents).toBe('function');
        });
    });

    describe('New usecases exported', () => {
        it('enrichVendor exists', () => {
            const mod = require('../../src/app-layer/usecases/vendor');
            expect(typeof mod.enrichVendor).toBe('function');
        });

        it('getVendorMetrics exists', () => {
            const mod = require('../../src/app-layer/usecases/vendor');
            expect(typeof mod.getVendorMetrics).toBe('function');
        });

        it('updateVendor exists (the single activation-gate edit path — PR-T)', () => {
            const mod = require('../../src/app-layer/usecases/vendor');
            expect(typeof mod.updateVendor).toBe('function');
            // PR-T — the dead updateVendorStatusWithGate duplicate was removed.
            expect(mod.updateVendorStatusWithGate).toBeUndefined();
        });
    });
});
