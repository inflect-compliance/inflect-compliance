/**
 * Digital Sovereignty Posture — getting-started self-assessment bank.
 *
 * Six sovereignty dimensions × five questions = 30. Each question has FIVE
 * ordered options scoring 0 (none) → 4 (leading). Dimension score = mean of its
 * five answers; overall = mean of the six dimension scores (surfaced 0–4 and as
 * a 0–100 normalization). An EU-market posture lens distinct from the AI
 * assessment — jurisdiction, residency, identity, exit-readiness, regulatory
 * alignment, and sovereign AI.
 *
 * Regulatory content is CLAUSE-REFERENCED ONLY — short identifiers, never
 * ISO / EU-regulation prose. The six-dimension model derives from the
 * MIT-licensed Digital-Sovereignty-Assessment-Tool; the clause-cite discipline
 * is ours. This is a self-assessment aid, NOT legal advice.
 *
 * This module is PURE CONTENT — it imports nothing and calls no usecase. The
 * scorer (`@/lib/self-assessments/scoring`) and the suggestion→materialize path
 * (`usecases/self-assessment`) consume it.
 */

/** One ordered answer option, scored 0 (none) → 4 (leading). */
export interface SelfAssessmentOption {
    label: string;
    score: 0 | 1 | 2 | 3 | 4;
}

export interface SelfAssessmentQuestion {
    /** Stable id, e.g. `ds-1-01`. */
    id: string;
    text: string;
    /** Exactly five ordered options, scores 0..4. */
    options: SelfAssessmentOption[];
}

/**
 * A suggestion TEMPLATE — title + clause reference only, never regulatory
 * prose. Materialised (on explicit approval) into a real risk + control when a
 * dimension scores below the gap threshold.
 */
export interface SelfAssessmentSuggestion {
    riskTitle: string;
    controlName: string;
    /** Short clause identifier surfaced on the suggestion (e.g. "EUCS"). */
    clauseRef: string;
}

export interface SelfAssessmentDimension {
    id: number;
    /** i18n label key (resolved by the UI via next-intl) — never hard-coded. */
    labelKey: string;
    /** Short regulatory clause identifiers — cite, never copy. */
    clauseRefs: string[];
    /** Exactly five questions. */
    questions: SelfAssessmentQuestion[];
    /** The gap suggestion for this dimension (dimension score < threshold). */
    suggestion: SelfAssessmentSuggestion;
}

export interface SelfAssessment {
    /** Assessment key — a member of the assessment-key Zod enum. */
    key: string;
    version: number;
    dimensions: SelfAssessmentDimension[];
}

/** Build the five ordered options from five labels (scores 0..4). */
function opts(labels: [string, string, string, string, string]): SelfAssessmentOption[] {
    return labels.map((label, i) => ({ label, score: i as 0 | 1 | 2 | 3 | 4 }));
}

export const DIGITAL_SOVEREIGNTY_ASSESSMENT: SelfAssessment = {
    key: 'digital-sovereignty',
    version: 1,
    dimensions: [
        // ── Dimension 1 — Cloud Jurisdiction & Sovereign Cloud ──
        {
            id: 1,
            labelKey: 'cloudJurisdiction',
            clauseRefs: ['EUCS', 'Gaia-X', 'NIS2 Art 21'],
            suggestion: {
                riskTitle: 'Extraterritorial jurisdiction exposure on cloud workloads',
                controlName: 'Sovereign-cloud / HYOK evaluation for sensitive tiers',
                clauseRef: 'EUCS',
            },
            questions: [
                {
                    id: 'ds-1-01',
                    text: 'Do you know the legal jurisdiction(s) under which each production cloud provider operates?',
                    options: opts(['None', 'Informal', 'Documented per-provider', 'Contractually asserted', 'Continuously monitored']),
                },
                {
                    id: 'ds-1-02',
                    text: "Are any workloads subject to non-EU extraterritorial law (e.g. US CLOUD Act) via the provider's parent company?",
                    options: opts(['Unknown', 'Suspected / unassessed', 'Assessed & accepted', 'Mitigated via EU subsidiary/contract', 'Sovereign-cloud isolated']),
                },
                {
                    id: 'ds-1-03',
                    text: 'Have you evaluated a sovereign or EU-only cloud offering (EUCS "High", Gaia-X-labelled) for sensitive workloads?',
                    options: opts(['Never', 'Aware', 'Evaluated', 'Piloted', 'In production for sensitive tiers']),
                },
                {
                    id: 'ds-1-04',
                    text: 'Is provider concentration risk (single-hyperscaler dependency) tracked as a formal risk?',
                    options: opts(['No', 'Informal', 'On the risk register', 'With a mitigation plan', 'Multi-provider by design']),
                },
                {
                    id: 'ds-1-05',
                    text: "Are encryption keys for cloud-hosted sensitive data held under your sole control (HYOK/BYOK), outside the provider's jurisdiction?",
                    options: opts(['Provider-managed', 'BYOK unassessed', 'BYOK in use', 'HYOK for sensitive tiers', 'HYOK + external KMS under EU control']),
                },
            ],
        },
        // ── Dimension 2 — Data Residency & Transfer Mechanisms ──
        {
            id: 2,
            labelKey: 'dataResidency',
            clauseRefs: ['GDPR Ch. V', 'Data Governance Act', 'EU 2023/2854'],
            suggestion: {
                riskTitle: 'Unlawful or unassessed cross-border data transfer',
                controlName: 'Data-residency inventory + GDPR Ch. V transfer-mechanism review',
                clauseRef: 'GDPR Ch. V',
            },
            questions: [
                {
                    id: 'ds-2-01',
                    text: 'Do you maintain an inventory of where each category of personal/sensitive data physically resides?',
                    options: opts(['None', 'Partial', 'Complete inventory', 'Mapped to data classification', 'Continuously reconciled']),
                },
                {
                    id: 'ds-2-02',
                    text: 'For every cross-border transfer, is a valid GDPR Ch. V mechanism (adequacy, SCCs + TIA) in place?',
                    options: opts(['Unknown', 'Some', 'All documented', 'All with transfer-impact assessments', 'Monitored & re-validated']),
                },
                {
                    id: 'ds-2-03',
                    text: 'Can you enforce data-residency constraints technically (region-pinning), not just contractually?',
                    options: opts(['No', 'Contract-only', 'Region-pinned config', 'Enforced + drift alerting', 'Policy-as-code enforced']),
                },
                {
                    id: 'ds-2-04',
                    text: 'Have you assessed Data Act (EU 2023/2854) obligations around switching/portability and IoT data access?',
                    options: opts(['Unaware', 'Aware', 'Gap-assessed', 'Remediation planned', 'Compliant']),
                },
                {
                    id: 'ds-2-05',
                    text: 'Are data-sharing arrangements with third parties governed under a Data Governance Act-aligned framework?',
                    options: opts(['Ad hoc', 'Contracts only', 'Governed intermediary model', 'With audit trail', 'Fully DGA-aligned']),
                },
            ],
        },
        // ── Dimension 3 — Identity & Sovereignty of Access ──
        {
            id: 3,
            labelKey: 'identitySovereignty',
            clauseRefs: ['eIDAS 2.0', 'NIS2 Art 21(2)(i)'],
            suggestion: {
                riskTitle: 'Foreign-controlled identity-provider dependency',
                controlName: 'EU-jurisdiction IdP + eIDAS 2.0 readiness assessment',
                clauseRef: 'eIDAS 2.0',
            },
            questions: [
                {
                    id: 'ds-3-01',
                    text: 'Is your primary identity provider (IdP) subject to EU jurisdiction and control?',
                    options: opts(['Non-EU', 'Unassessed', 'Assessed', 'EU-hosted', 'EU-sovereign IdP']),
                },
                {
                    id: 'ds-3-02',
                    text: 'Are you tracking eIDAS 2.0 / EU Digital Identity Wallet readiness for customer or workforce identity?',
                    options: opts(['No', 'Monitoring', 'Gap-assessed', 'Pilot', 'Integrated']),
                },
                {
                    id: 'ds-3-03',
                    text: 'Do you retain the ability to authenticate if a foreign IdP becomes unavailable (sanctions, outage)?',
                    options: opts(['No fallback', 'Manual', 'Documented failover', 'Tested failover', 'Active-active EU fallback']),
                },
                {
                    id: 'ds-3-04',
                    text: 'Are privileged credentials to sovereignty-sensitive systems held outside foreign-controlled vaults?',
                    options: opts(['No', 'Unassessed', 'Segregated', 'EU-controlled vault', 'Hardware-backed EU control']),
                },
                {
                    id: 'ds-3-05',
                    text: 'Is federation with external identity systems assessed for jurisdictional / supply-chain risk?',
                    options: opts(['Never', 'Informal', 'Assessed', 'On risk register', 'Continuously monitored']),
                },
            ],
        },
        // ── Dimension 4 — Infrastructure Dependency & Exit-Readiness ──
        {
            id: 4,
            labelKey: 'infraExitReadiness',
            clauseRefs: ['DORA Art 28', 'NIS2 supply-chain', 'Data Act switching'],
            suggestion: {
                riskTitle: 'Critical third-party lock-in without a tested exit plan',
                controlName: 'Documented, RTO-bounded exit plan + concentration register',
                clauseRef: 'DORA Art 28',
            },
            questions: [
                {
                    id: 'ds-4-01',
                    text: 'Do you maintain a documented, tested exit plan for each critical third-party platform?',
                    options: opts(['None', 'Informal', 'Documented', 'Tested', 'Tested + RTO-bounded']),
                },
                {
                    id: 'ds-4-02',
                    text: 'Are critical software dependencies assessed for supplier jurisdiction / ownership?',
                    options: opts(['No', 'Partial', 'SBOM-backed', 'With ownership mapping', 'Continuously monitored']),
                },
                {
                    id: 'ds-4-03',
                    text: 'Could you re-platform a critical workload off its current provider within your target RTO?',
                    options: opts(['Unknown', '>Months', 'Weeks', 'Within RTO', 'Portable-by-design']),
                },
                {
                    id: 'ds-4-04',
                    text: 'Is open-source / open-standard substitutability a deliberate architecture criterion for new systems?',
                    options: opts(['No', 'Occasional', 'Recommended', 'Mandated for critical', 'Enforced in review']),
                },
                {
                    id: 'ds-4-05',
                    text: 'Are ICT third-party concentration and single-points-of-failure tracked (DORA-style register)?',
                    options: opts(['No', 'Informal', 'Register exists', 'Risk-scored', 'Board-reported']),
                },
            ],
        },
        // ── Dimension 5 — Regulatory Alignment & Certification ──
        {
            id: 5,
            labelKey: 'regulatoryAlignment',
            clauseRefs: ['NIS2', 'CRA', 'EUCS', 'AI Act', 'DORA'],
            suggestion: {
                riskTitle: 'Unmapped EU digital-regulation obligations',
                controlName: 'EU digital-regulation applicability + certification roadmap',
                clauseRef: 'NIS2',
            },
            questions: [
                {
                    id: 'ds-5-01',
                    text: 'Do you know which EU digital regulations (NIS2, DORA, CRA, Data Act, AI Act) apply to you, and your status?',
                    options: opts(['Unknown', 'Partial', 'Mapped', 'Gap-assessed', 'Tracked to closure']),
                },
                {
                    id: 'ds-5-02',
                    text: 'Are your cloud/service certifications aligned to EU schemes (EUCS, C5, SecNumCloud) where relevant?',
                    options: opts(['None', 'Aware', 'Targeting', 'In audit', 'Certified']),
                },
                {
                    id: 'ds-5-03',
                    text: 'For connected products, have you assessed Cyber Resilience Act secure-by-design obligations?',
                    options: opts(['N/A or unassessed', 'Aware', 'Gap-assessed', 'Remediation planned', 'Compliant']),
                },
                {
                    id: 'ds-5-04',
                    text: 'Is regulatory-horizon monitoring in place so new EU obligations are caught before enforcement dates?',
                    options: opts(['Reactive', 'Ad hoc', 'Periodic review', 'Owned function', 'Tooled / continuous']),
                },
                {
                    id: 'ds-5-05',
                    text: 'Are sovereignty/residency requirements flowed down to your own suppliers contractually?',
                    options: opts(['No', 'Some', 'Standard clauses', 'Audited', 'Monitored']),
                },
            ],
        },
        // ── Dimension 6 — Sovereign AI ──
        {
            id: 6,
            labelKey: 'sovereignAi',
            clauseRefs: ['AI Act EU 2024/1689', 'Data Act'],
            suggestion: {
                riskTitle: 'Non-EU AI provider dependency for sensitive processing',
                controlName: 'EU / open-weight model evaluation + AI Act tiering',
                clauseRef: 'AI Act EU 2024/1689',
            },
            questions: [
                {
                    id: 'ds-6-01',
                    text: 'Do you know the jurisdiction where each production AI model is hosted and trained?',
                    options: opts(['Unknown', 'Partial', 'Documented', 'EU-hosted for sensitive', 'Sovereign-hosted']),
                },
                {
                    id: 'ds-6-02',
                    text: 'Is sensitive/personal data sent to AI providers assessed for transfer + jurisdictional exposure?',
                    options: opts(['No', 'Informal', 'Assessed', 'Mitigated', 'EU-only inference']),
                },
                {
                    id: 'ds-6-03',
                    text: 'Have you evaluated EU / open-weight models as an alternative to non-EU proprietary APIs for sensitive use?',
                    options: opts(['Never', 'Aware', 'Evaluated', 'Piloted', 'In production for sensitive tiers']),
                },
                {
                    id: 'ds-6-04',
                    text: 'Are AI systems classified against AI Act risk tiers, with sovereignty implications noted?',
                    options: opts(['No', 'Started', 'Classified', 'With sovereignty notes', 'Integrated in AI risk register']),
                },
                {
                    id: 'ds-6-05',
                    text: 'Can you continue critical AI-dependent operations if a non-EU AI provider becomes unavailable?',
                    options: opts(['No fallback', 'Manual', 'Documented', 'Tested fallback', 'EU-sovereign fallback']),
                },
            ],
        },
    ],
};

/** Maturity bands — LABEL only, no legal-compliance claim. */
export const SOVEREIGNTY_MATURITY_BANDS = [
    { max: 1, label: 'Exposed' },
    { max: 2, label: 'Emerging' },
    { max: 3, label: 'Managed' },
    { max: 4.0001, label: 'Sovereign-ready' },
] as const;

/** A dimension scoring below this yields a suggested risk + control. */
export const SOVEREIGNTY_GAP_THRESHOLD = 2;
