/**
 * SoA Readiness Checks — Pure Logic
 *
 * Extracted from the API route so it can be tested without Next.js server deps.
 *
 * Rules:
 *  1. UNMAPPED       — requirement has no mapped controls
 *  2. MISSING_JUST   — NOT_APPLICABLE without justification
 *  3. NO_EVIDENCE    — applicable control with 0 evidence
 *  4. NOT_STARTED    — applicable control still NOT_STARTED
 */

export interface SoACheck {
    rule: string;
    severity: 'error' | 'warning';
    requirementCode: string;
    requirementTitle: string;
    controlCode?: string;
    reason: string;
    suggestedAction: string;
}

export interface SoAChecksResult {
    pass: boolean;
    errorCount: number;
    warningCount: number;
    issues: SoACheck[];
}

// SoA report entry shape (the `getSoA().entries` rows the checks scan).
interface SoAEntryControl {
    applicability: string;
    justification?: string | null;
    code?: string | null;
    controlId?: string;
}
interface SoAEntry {
    requirementCode: string;
    requirementTitle: string;
    applicable: boolean | null;
    implementationStatus?: string | null;
    mappedControls: SoAEntryControl[];
    evidenceCount?: number;
    openTaskCount?: number;
}

export function runSoAChecks(
    entries: SoAEntry[]
): SoAChecksResult {
    const issues: SoACheck[] = [];

    for (const entry of entries) {
        // Rule 1: Unmapped
        if (entry.applicable === null) {
            issues.push({
                rule: 'UNMAPPED',
                severity: 'error',
                requirementCode: entry.requirementCode,
                requirementTitle: entry.requirementTitle,
                reason: 'No tenant controls mapped to this requirement.',
                suggestedAction: 'Map at least one control to this requirement.',
            });
            continue;
        }

        // Rule 2: Missing justification
        if (entry.applicable === false) {
            const missing = entry.mappedControls.filter(
                (c) => c.applicability === 'NOT_APPLICABLE' && !c.justification
            );
            for (const c of missing) {
                issues.push({
                    rule: 'MISSING_JUSTIFICATION',
                    severity: 'error',
                    requirementCode: entry.requirementCode,
                    requirementTitle: entry.requirementTitle,
                    controlCode: c.code || c.controlId,
                    reason: `Control "${c.code || c.controlId}" is Not Applicable but has no justification.`,
                    suggestedAction: 'Add exclusion justification on the control.',
                });
            }
        }

        // Rule 3: Not started (applicable)
        if (entry.applicable === true && entry.implementationStatus === 'NOT_STARTED') {
            issues.push({
                rule: 'NOT_STARTED',
                severity: 'warning',
                requirementCode: entry.requirementCode,
                requirementTitle: entry.requirementTitle,
                reason: 'All applicable controls for this requirement are still NOT STARTED.',
                suggestedAction: 'Begin implementation of mapped controls.',
            });
        }

        // Rule 4: No evidence (applicable)
        if (entry.applicable === true && entry.evidenceCount === 0) {
            issues.push({
                rule: 'NO_EVIDENCE',
                severity: 'warning',
                requirementCode: entry.requirementCode,
                requirementTitle: entry.requirementTitle,
                reason: 'No evidence attached to any mapped control for this requirement.',
                suggestedAction: 'Upload supporting evidence to linked controls.',
            });
        }
    }

    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    return {
        pass: errorCount === 0,
        errorCount,
        warningCount,
        issues,
    };
}
