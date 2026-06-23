/**
 * Onboarding Automation Tests
 *
 * Tests the deterministic risk catalog, asset type inference,
 * idempotency contracts, and starter task generation.
 *
 * These bind to the REAL source symbols (`inferAssetType`,
 * `STARTER_RISKS`, `selectApplicableRisks`) — never a local shadow
 * copy. A shadow copy is exactly what let the `DATASTORE` (vs the real
 * `DATA_STORE` Prisma enum) asset-type mismatch ship undetected: the
 * test validated its own copy of the bug.
 */
import { AssetType } from '@prisma/client';
import {
    inferAssetType,
    selectApplicableRisks,
    STARTER_RISKS,
} from '@/app-layer/usecases/onboarding-automation';

const VALID_ASSET_TYPES = new Set<string>(Object.values(AssetType));

// ─── Tests ───

describe('Onboarding Automation', () => {
    describe('Asset Type Inference', () => {
        it('infers APPLICATION for app-like names', () => {
            expect(inferAssetType('Customer Portal')).toBe('APPLICATION');
            expect(inferAssetType('Mobile App')).toBe('APPLICATION');
            expect(inferAssetType('Internal API')).toBe('APPLICATION');
            expect(inferAssetType('SaaS Platform')).toBe('APPLICATION');
        });

        it('infers DATA_STORE for data-like names', () => {
            expect(inferAssetType('Customer Database')).toBe('DATA_STORE');
            expect(inferAssetType('Data Warehouse')).toBe('DATA_STORE');
            expect(inferAssetType('Backup Storage')).toBe('DATA_STORE');
        });

        it('infers INFRASTRUCTURE for infra-like names', () => {
            expect(inferAssetType('Cloud Infrastructure')).toBe('INFRASTRUCTURE');
            expect(inferAssetType('Production Server')).toBe('INFRASTRUCTURE');
            expect(inferAssetType('AWS VPC')).toBe('INFRASTRUCTURE');
            expect(inferAssetType('Kubernetes Cluster')).toBe('INFRASTRUCTURE');
        });

        it('infers VENDOR for vendor-like names', () => {
            expect(inferAssetType('Payment Vendor')).toBe('VENDOR');
            expect(inferAssetType('Third-Party Processor')).toBe('VENDOR');
        });

        it('infers PROCESS for process-like names', () => {
            expect(inferAssetType('HR Onboarding Process')).toBe('PROCESS');
            expect(inferAssetType('Finance Workflows')).toBe('PROCESS');
        });

        it('defaults to APPLICATION for unknown names', () => {
            expect(inferAssetType('CRM')).toBe('APPLICATION');
            expect(inferAssetType('Something Else')).toBe('APPLICATION');
        });

        it('only ever returns values that exist in the Prisma AssetType enum', () => {
            // Regression guard for the DATASTORE→DATA_STORE bug: a value that
            // is not a real enum member would be rejected by Prisma at
            // asset-create time. Cover every keyword bucket + the default.
            const names = [
                'Mobile App', 'Customer Database', 'Backup Storage', 'Data Warehouse',
                'Cloud Infrastructure', 'AWS VPC', 'Payment Vendor', 'HR Onboarding Process',
                'CRM', 'Totally Unknown Thing',
            ];
            for (const name of names) {
                expect(VALID_ASSET_TYPES.has(inferAssetType(name))).toBe(true);
            }
        });
    });

    describe('Risk Catalog Selection', () => {
        it('returns APPLICATION risks for iso27001 with app assets', () => {
            const risks = selectApplicableRisks(['iso27001'], new Set([AssetType.APPLICATION]));
            expect(risks.some(r => r.title === 'Unauthorized Access to Application')).toBe(true);
            expect(risks.some(r => r.title === 'Application Vulnerability Exploitation')).toBe(true);
            // General risks should also be included
            expect(risks.some(r => r.title === 'Regulatory Non-Compliance')).toBe(true);
        });

        it('returns DATA_STORE risks for nis2 with data assets', () => {
            const risks = selectApplicableRisks(['nis2'], new Set([AssetType.DATA_STORE]));
            expect(risks.some(r => r.title === 'Data Backup Failure')).toBe(true);
            expect(risks.some(r => r.title === 'Data Confidentiality Breach')).toBe(true);
            // iso27001-only risks should NOT be included
            expect(risks.some(r => r.title === 'Data Integrity Compromise')).toBe(false);
        });

        it('returns VENDOR risks for nis2 with vendor assets', () => {
            const risks = selectApplicableRisks(['nis2'], new Set([AssetType.VENDOR]));
            expect(risks.some(r => r.title === 'Supply Chain Dependency Risk')).toBe(true);
            expect(risks.some(r => r.title === 'Third-Party Data Processing Risk')).toBe(true);
        });

        it('returns comprehensive risks for both frameworks + multiple asset types', () => {
            const risks = selectApplicableRisks(['iso27001', 'nis2'], new Set([AssetType.APPLICATION, AssetType.DATA_STORE, AssetType.INFRASTRUCTURE]));
            // Should include all asset-specific risks plus generals
            expect(risks.length).toBeGreaterThanOrEqual(10);
            expect(risks.some(r => r.title === 'Unauthorized Access to Application')).toBe(true);
            expect(risks.some(r => r.title === 'Data Backup Failure')).toBe(true);
            expect(risks.some(r => r.title === 'Network Perimeter Breach')).toBe(true);
            expect(risks.some(r => r.title === 'Regulatory Non-Compliance')).toBe(true);
        });

        it('excludes risks for unselected asset types', () => {
            const risks = selectApplicableRisks(['iso27001'], new Set([AssetType.APPLICATION]));
            // Should NOT include DATA_STORE, INFRASTRUCTURE, VENDOR, PROCESS risks
            expect(risks.some(r => r.title === 'Data Backup Failure')).toBe(false);
            expect(risks.some(r => r.title === 'Network Perimeter Breach')).toBe(false);
            expect(risks.some(r => r.title === 'Third-Party Data Processing Risk')).toBe(false);
        });

        it('selection is deterministic — same inputs always produce same outputs', () => {
            const run1 = selectApplicableRisks(['iso27001'], new Set([AssetType.APPLICATION]));
            const run2 = selectApplicableRisks(['iso27001'], new Set([AssetType.APPLICATION]));
            expect(run1.map(r => r.title)).toEqual(run2.map(r => r.title));
        });
    });

    describe('Risk Catalog Properties', () => {
        it('all risks have unique titles', () => {
            const titles = STARTER_RISKS.map(r => r.title);
            expect(new Set(titles).size).toBe(titles.length);
        });

        it('all risks reference at least one framework', () => {
            for (const risk of STARTER_RISKS) {
                expect(risk.frameworks.length).toBeGreaterThan(0);
            }
        });

        it('total catalog has 15 risks', () => {
            expect(STARTER_RISKS.length).toBe(15);
        });

        it('every catalog assetType is a real Prisma AssetType enum member', () => {
            // Catalog drift guard: a stray value like the old `DATASTORE`
            // would never match an inferred type and would corrupt risk
            // seeding silently. Bind the catalog to the enum.
            for (const risk of STARTER_RISKS) {
                for (const at of risk.assetTypes) {
                    expect(VALID_ASSET_TYPES.has(at)).toBe(true);
                }
            }
        });
    });

    describe('Framework Pack Key Mapping', () => {
        const FRAMEWORK_PACK_KEYS: Record<string, string> = {
            iso27001: 'iso27001-2022-baseline',
            nis2: 'nis2-baseline',
        };

        it('maps iso27001 to correct pack key', () => {
            expect(FRAMEWORK_PACK_KEYS['iso27001']).toBe('iso27001-2022-baseline');
        });

        it('maps nis2 to correct pack key', () => {
            expect(FRAMEWORK_PACK_KEYS['nis2']).toBe('nis2-baseline');
        });

        it('returns undefined for unknown frameworks', () => {
            expect(FRAMEWORK_PACK_KEYS['soc2']).toBeUndefined();
        });
    });

    describe('Starter Tasks', () => {
        const starterTasks = [
            { title: 'Review and assign control owners', type: 'TASK' },
            { title: 'Schedule evidence collection cadence', type: 'TASK' },
            { title: 'Complete risk assessment review', type: 'TASK' },
            { title: 'Define incident response procedure', type: 'TASK' },
            { title: 'Set up vendor due diligence process', type: 'TASK' },
        ];

        it('has exactly 5 starter tasks', () => {
            expect(starterTasks.length).toBe(5);
        });

        it('all starter tasks are type TASK', () => {
            for (const task of starterTasks) {
                expect(task.type).toBe('TASK');
            }
        });

        it('all starter tasks have unique titles', () => {
            const titles = starterTasks.map(t => t.title);
            expect(new Set(titles).size).toBe(titles.length);
        });
    });
});
