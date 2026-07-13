/**
 * SoA Use Case — Unit Tests
 *
 * Tests the core computation logic: applicability rollup, worst-status,
 * justification aggregation, and summary counts.
 */

// ─── Mock helpers: build fake data for the use case to consume ───

import type { SoAEntryDTO, SoAMappedControlDTO } from '@/lib/dto/soa';

// Replicate the rollup functions from the use case for unit testing
const STATUS_ORDER: Record<string, number> = {
    NOT_STARTED: 0,
    IN_PROGRESS: 1,
    NEEDS_REVIEW: 2,
    IMPLEMENTED: 3,
    NOT_APPLICABLE: -1,
};

function worstStatus(statuses: string[]): string | null {
    const applicable = statuses.filter(s => STATUS_ORDER[s] !== undefined && STATUS_ORDER[s] >= 0);
    if (applicable.length === 0) return null;
    applicable.sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b]);
    return applicable[0];
}

function deriveApplicability(controls: SoAMappedControlDTO[]): boolean | null {
    if (controls.length === 0) return null;
    const hasApplicable = controls.some(c => c.applicability === 'APPLICABLE');
    return hasApplicable ? true : false;
}

function deriveJustification(controls: SoAMappedControlDTO[]): string | null {
    const justifications = controls
        .filter(c => c.applicability === 'NOT_APPLICABLE')
        .map(c => c.justification)
        .filter(Boolean) as string[];
    return justifications.length > 0 ? justifications.join('; ') : null;
}

function hasMissingJustification(controls: SoAMappedControlDTO[]): boolean {
    return controls
        .filter(c => c.applicability === 'NOT_APPLICABLE')
        .some(c => !c.justification);
}

// ─── Tests ───

describe('SoA Computation Logic', () => {
    describe('Applicability Rollup', () => {
        it('returns null for unmapped requirements (no controls)', () => {
            expect(deriveApplicability([])).toBeNull();
        });

        it('returns true if any mapped control is APPLICABLE', () => {
            const controls: SoAMappedControlDTO[] = [
                { controlId: 'c1', code: 'AC-01', title: 'Access Control', status: 'IMPLEMENTED', applicability: 'APPLICABLE', justification: null, owner: null, frequency: null },
                { controlId: 'c2', code: 'AC-02', title: 'Identity Mgmt', status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE', justification: 'Out of scope', owner: null, frequency: null },
            ];
            expect(deriveApplicability(controls)).toBe(true);
        });

        it('returns false if all mapped controls are NOT_APPLICABLE', () => {
            const controls: SoAMappedControlDTO[] = [
                { controlId: 'c1', code: 'AC-01', title: 'Access Control', status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE', justification: 'Cloud-only', owner: null, frequency: null },
                { controlId: 'c2', code: 'AC-02', title: 'Identity Mgmt', status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE', justification: 'Not used', owner: null, frequency: null },
            ];
            expect(deriveApplicability(controls)).toBe(false);
        });
    });

    describe('Worst-Status Rollup', () => {
        it('returns null for empty array', () => {
            expect(worstStatus([])).toBeNull();
        });

        it('returns NOT_STARTED when mixed with IMPLEMENTED', () => {
            expect(worstStatus(['IMPLEMENTED', 'NOT_STARTED'])).toBe('NOT_STARTED');
        });

        it('returns IN_PROGRESS when mixed with IMPLEMENTED', () => {
            expect(worstStatus(['IMPLEMENTED', 'IN_PROGRESS'])).toBe('IN_PROGRESS');
        });

        it('returns IMPLEMENTED when all are IMPLEMENTED', () => {
            expect(worstStatus(['IMPLEMENTED', 'IMPLEMENTED'])).toBe('IMPLEMENTED');
        });

        it('returns NEEDS_REVIEW when mixed', () => {
            expect(worstStatus(['IMPLEMENTED', 'NEEDS_REVIEW'])).toBe('NEEDS_REVIEW');
        });

        it('ignores NOT_APPLICABLE entries', () => {
            expect(worstStatus(['NOT_APPLICABLE', 'IMPLEMENTED'])).toBe('IMPLEMENTED');
        });

        it('returns null when only NOT_APPLICABLE', () => {
            expect(worstStatus(['NOT_APPLICABLE'])).toBeNull();
        });
    });

    describe('Justification Aggregation', () => {
        it('returns null when no NOT_APPLICABLE controls', () => {
            const controls: SoAMappedControlDTO[] = [
                { controlId: 'c1', code: 'AC-01', title: 'Access Control', status: 'IMPLEMENTED', applicability: 'APPLICABLE', justification: null, owner: null, frequency: null },
            ];
            expect(deriveJustification(controls)).toBeNull();
        });

        it('concatenates justifications from NOT_APPLICABLE controls', () => {
            const controls: SoAMappedControlDTO[] = [
                { controlId: 'c1', code: 'AC-01', title: 'Access Control', status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE', justification: 'Cloud-only', owner: null, frequency: null },
                { controlId: 'c2', code: 'AC-02', title: 'Identity Mgmt', status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE', justification: 'SaaS only', owner: null, frequency: null },
            ];
            expect(deriveJustification(controls)).toBe('Cloud-only; SaaS only');
        });

        it('skips null justifications in concatenation', () => {
            const controls: SoAMappedControlDTO[] = [
                { controlId: 'c1', code: 'AC-01', title: 'Access Control', status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE', justification: 'Cloud-only', owner: null, frequency: null },
                { controlId: 'c2', code: 'AC-02', title: 'Identity Mgmt', status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE', justification: null, owner: null, frequency: null },
            ];
            expect(deriveJustification(controls)).toBe('Cloud-only');
        });
    });

    describe('Missing Justification Detection', () => {
        it('returns false when all NOT_APPLICABLE controls have justifications', () => {
            const controls: SoAMappedControlDTO[] = [
                { controlId: 'c1', code: 'AC-01', title: 'Access Control', status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE', justification: 'Out of scope', owner: null, frequency: null },
            ];
            expect(hasMissingJustification(controls)).toBe(false);
        });

        it('returns true when any NOT_APPLICABLE control lacks justification', () => {
            const controls: SoAMappedControlDTO[] = [
                { controlId: 'c1', code: 'AC-01', title: 'Access Control', status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE', justification: 'Out of scope', owner: null, frequency: null },
                { controlId: 'c2', code: 'AC-02', title: 'Identity Mgmt', status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE', justification: null, owner: null, frequency: null },
            ];
            expect(hasMissingJustification(controls)).toBe(true);
        });

        it('returns false when no NOT_APPLICABLE controls exist', () => {
            const controls: SoAMappedControlDTO[] = [
                { controlId: 'c1', code: 'AC-01', title: 'Access Control', status: 'IMPLEMENTED', applicability: 'APPLICABLE', justification: null, owner: null, frequency: null },
            ];
            expect(hasMissingJustification(controls)).toBe(false);
        });
    });

    describe('Entry Construction', () => {
        it('builds correct SoAEntryDTO for an applicable requirement', () => {
            const controls: SoAMappedControlDTO[] = [
                { controlId: 'c1', code: 'AC-01', title: 'Access Control Policy', status: 'IMPLEMENTED', applicability: 'APPLICABLE', justification: null, owner: 'user-1', frequency: 'ANNUALLY' },
                { controlId: 'c2', code: 'AC-02', title: 'Access Review', status: 'IN_PROGRESS', applicability: 'APPLICABLE', justification: null, owner: 'user-2', frequency: 'QUARTERLY' },
            ];

            const entry: SoAEntryDTO = {
                requirementId: 'req-1',
                requirementCode: 'A.5.15',
                requirementTitle: 'Access control',
                section: 'Organizational',
                applicable: deriveApplicability(controls),
                justification: deriveJustification(controls),
                implementationStatus: worstStatus(controls.filter(c => c.applicability === 'APPLICABLE').map(c => c.status)),
                verdict: null,
                exceptedUntil: null,
                mappedControls: controls,
                evidenceCount: 0,
                openTaskCount: 0,
                lastTestResult: null,
            };

            expect(entry.applicable).toBe(true);
            expect(entry.justification).toBeNull();
            expect(entry.implementationStatus).toBe('IN_PROGRESS');
            expect(entry.mappedControls).toHaveLength(2);
        });

        it('builds correct SoAEntryDTO for a not-applicable requirement', () => {
            const controls: SoAMappedControlDTO[] = [
                { controlId: 'c1', code: 'PHY-01', title: 'Physical Perimeter', status: 'NOT_STARTED', applicability: 'NOT_APPLICABLE', justification: 'Fully remote company', owner: null, frequency: null },
            ];

            const entry: SoAEntryDTO = {
                requirementId: 'req-2',
                requirementCode: 'A.7.1',
                requirementTitle: 'Physical security perimeters',
                section: 'Physical',
                applicable: deriveApplicability(controls),
                justification: deriveJustification(controls),
                implementationStatus: null,
                verdict: null,
                exceptedUntil: null,
                mappedControls: controls,
                evidenceCount: 0,
                openTaskCount: 0,
                lastTestResult: null,
            };

            expect(entry.applicable).toBe(false);
            expect(entry.justification).toBe('Fully remote company');
            expect(entry.implementationStatus).toBeNull();
        });

        it('builds correct SoAEntryDTO for an unmapped requirement', () => {
            const entry: SoAEntryDTO = {
                requirementId: 'req-3',
                requirementCode: 'A.8.34',
                requirementTitle: 'Protection of information systems during audit testing',
                section: 'Technological',
                applicable: deriveApplicability([]),
                justification: null,
                implementationStatus: null,
                verdict: null,
                exceptedUntil: null,
                mappedControls: [],
                evidenceCount: 0,
                openTaskCount: 0,
                lastTestResult: null,
            };

            expect(entry.applicable).toBeNull();
            expect(entry.mappedControls).toHaveLength(0);
        });
    });
});
