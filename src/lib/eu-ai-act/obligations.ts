/**
 * EU AI Act — tier → obligation map (authored from the Regulation).
 *
 * Maps each risk tier to the framework requirements it pulls in, expressed
 * against IC's own seeded library ids:
 *   - framework 'EU-AI-ACT' (v2024) requirement `code`s: Art.5, Art.9–Art.17,
 *     Art.26, Art.27, Art.50, Art.95.
 *   - framework 'ISO42001' (v2023) requirement `code`s: clauses 4.1–10.2 and
 *     Annex A A.2.2–A.10.4.
 *
 * The mapping is authored from the obligation structure of the Act:
 *   HIGH  → the full high-risk provider/deployer obligation set (Art 9 risk
 *           management, Art 10 data governance, Art 11 technical documentation,
 *           Art 12 record-keeping, Art 13 transparency, Art 14 human oversight,
 *           Art 15 accuracy/robustness/cybersecurity, Art 16/17 provider QMS,
 *           Art 26/27 deployer duties + fundamental-rights impact assessment)
 *           plus the ISO 42001 governance clauses that operationalise them.
 *   LIMITED → the Article 50 transparency duty (+ ISO 42001 communication).
 *   MINIMAL → the Article 95 voluntary codes of conduct (+ ISO 42001 AI policy).
 *   PROHIBITED → Article 5 (the prohibition itself; the system must not operate).
 *
 * MAPPING VALIDITY is enforced by tests/guards/ai-system-registry.test.ts:
 * every code below must resolve to a real FrameworkRequirement in the seeded
 * AI-Act / ISO 42001 library — no dangling refs.
 *
 * PROVENANCE: authored solely from Regulation (EU) 2024/1689 and ISO/IEC
 * 42001:2023 clause structure. Nothing derives from any third-party codebase.
 */
import type { AiRiskTier } from './classification';
export type { AiRiskTier } from './classification';

export type AiFrameworkKey = 'EU-AI-ACT' | 'ISO42001';

export interface ObligationRef {
    framework: AiFrameworkKey;
    /** FrameworkRequirement.code in the seeded library. */
    code: string;
}

const euAiAct = (code: string): ObligationRef => ({ framework: 'EU-AI-ACT', code });
const iso42001 = (code: string): ObligationRef => ({ framework: 'ISO42001', code });

export const TIER_OBLIGATIONS: Record<AiRiskTier, readonly ObligationRef[]> = {
    // A prohibited system must not be operated — the only "obligation" is the
    // Article 5 prohibition itself, linked so the register carries the citation.
    PROHIBITED: [euAiAct('Art.5')],

    // Full high-risk obligation set (Articles 9–17, 26, 27) + the ISO 42001
    // clauses that operationalise risk assessment, treatment, impact assessment,
    // and monitoring.
    HIGH: [
        euAiAct('Art.9'), // risk management system
        euAiAct('Art.10'), // data and data governance
        euAiAct('Art.11'), // technical documentation
        euAiAct('Art.12'), // record-keeping (logging)
        euAiAct('Art.13'), // transparency and information to deployers
        euAiAct('Art.14'), // human oversight
        euAiAct('Art.15'), // accuracy, robustness, cybersecurity
        euAiAct('Art.16'), // provider obligations
        euAiAct('Art.17'), // quality management system
        euAiAct('Art.26'), // deployer obligations
        euAiAct('Art.27'), // fundamental rights impact assessment
        iso42001('6.1'), // actions to address risks and opportunities
        iso42001('8.2'), // AI risk assessment
        iso42001('8.3'), // AI risk treatment
        iso42001('8.4'), // AI system impact assessment
        iso42001('9.1'), // monitoring, measurement, analysis and evaluation
    ],

    // Transparency-only: Article 50 duty + ISO 42001 communication.
    LIMITED: [euAiAct('Art.50'), iso42001('7.4')],

    // Minimal: Article 95 voluntary codes of conduct + ISO 42001 AI policy.
    MINIMAL: [euAiAct('Art.95'), iso42001('5.2')],
};

/** Flat, de-duplicated list of every (framework, code) referenced anywhere. */
export function allObligationRefs(): ObligationRef[] {
    const seen = new Set<string>();
    const out: ObligationRef[] = [];
    for (const refs of Object.values(TIER_OBLIGATIONS)) {
        for (const ref of refs) {
            const key = `${ref.framework}:${ref.code}`;
            if (!seen.has(key)) {
                seen.add(key);
                out.push(ref);
            }
        }
    }
    return out;
}
