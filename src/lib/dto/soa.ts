/**
 * Statement of Applicability (SoA) DTOs
 *
 * Deterministic SoA "view" for ISO 27001:2022 Annex A.
 * Every Annex A requirement (5.1..8.34) appears once, even if unmapped.
 */

// ─── Per-Requirement Entry ───

export interface SoAMappedControlDTO {
    controlId: string;
    code: string | null;
    title: string;
    status: string;
    applicability: string;           // APPLICABLE | NOT_APPLICABLE
    justification: string | null;    // applicabilityJustification
    owner: string | null;            // ownerUser name or userId
    frequency: string | null;        // ControlFrequency enum value
}

export interface SoAEntryDTO {
    requirementId: string;
    requirementCode: string;         // e.g. "A.5.1"
    requirementTitle: string;
    section: string | null;          // Organizational | People | Physical | Technological
    /** true=applicable, false=not applicable, null=unmapped/no decision */
    applicable: boolean | null;
    /** Required justification when applicable === false */
    justification: string | null;
    /** Worst-status rollup across mapped applicable controls */
    implementationStatus: string | null;
    mappedControls: SoAMappedControlDTO[];
    /** Rollup counts (populated when include* flags are set) */
    evidenceCount: number;
    openTaskCount: number;
    lastTestResult: string | null;   // PASS | FAIL | INCONCLUSIVE | null
}

// ─── Report Envelope ───

export interface SoASummaryDTO {
    total: number;
    applicable: number;
    notApplicable: number;
    unmapped: number;
    implemented: number;
    missingJustification: number;
}

export interface SoAReportDTO {
    tenantId: string;
    tenantSlug: string;
    framework: string;               // framework key, e.g. "ISO27001"
    /** Human-readable framework name + version for headers, e.g.
     *  "ISO 27001:2022". Resolved from the installed framework so the
     *  report header isn't hard-coded to ISO 27001. */
    frameworkName: string;
    generatedAt: string;             // ISO 8601
    entries: SoAEntryDTO[];
    summary: SoASummaryDTO;
}
