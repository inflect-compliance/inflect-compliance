/**
 * Curated SOC 2 / ISO control → vendor-assessment-question mapping.
 *
 * Each entry pairs a family of control refs (matched by regex) with the
 * keywords a vendor-assessment question uses for the same topic. This is
 * REFERENCE DATA a human can read and correct — never a black box. A control
 * "evidences" a question when the control's topic keywords appear in the
 * question prompt. Every proposed answer cites the exact control + result,
 * so a reviewer verifies the mapping was right.
 */

export interface Soc2Topic {
    /** Matches the control ref (e.g. `CC6.1`, `A1.2`). */
    ref: RegExp;
    label: string;
    /** Keywords that a question about this topic tends to use. */
    keywords: string[];
}

export const SOC2_TOPICS: Soc2Topic[] = [
    { ref: /^CC6\.[1-3]$/i, label: 'Access control', keywords: ['access control', 'least privilege', 'authentication', 'provision', 'deprovision', 'mfa', 'multi-factor', 'rbac', 'authorization'] },
    { ref: /^CC6\.[6-8]$/i, label: 'Encryption', keywords: ['encryption', 'encrypt', 'in transit', 'at rest', 'tls', 'key management'] },
    { ref: /^CC7\.1$/i, label: 'Vulnerability management', keywords: ['vulnerability', 'patch', 'penetration test', 'scanning'] },
    { ref: /^CC7\.[2-4]$/i, label: 'Monitoring & incident response', keywords: ['monitoring', 'logging', 'incident', 'detection', 'alert', 'siem'] },
    { ref: /^CC8\.1$/i, label: 'Change management', keywords: ['change management', 'sdlc', 'deployment', 'code review', 'release'] },
    { ref: /^CC9\.[12]$/i, label: 'Vendor / risk management', keywords: ['vendor', 'third party', 'subprocessor', 'risk assessment', 'due diligence'] },
    { ref: /^CC1\.[1-4]$/i, label: 'Governance', keywords: ['policy', 'governance', 'board', 'code of conduct', 'security awareness', 'training'] },
    { ref: /^A1\.[1-3]$/i, label: 'Availability & resilience', keywords: ['availability', 'backup', 'disaster recovery', 'business continuity', 'redundancy', 'sla', 'uptime'] },
    { ref: /^C1\.[12]$/i, label: 'Confidentiality', keywords: ['confidential', 'data classification', 'retention', 'disposal'] },
    { ref: /^P[1-8]\./i, label: 'Privacy', keywords: ['privacy', 'personal data', 'gdpr', 'data subject', 'consent'] },
];

/** Resolve the topic for a control ref (null if uncurated). */
export function topicForControl(ref: string): Soc2Topic | null {
    const r = ref.trim();
    return SOC2_TOPICS.find((t) => t.ref.test(r)) ?? null;
}

/**
 * Does a control evidence a question? True when the control's topic keywords
 * appear in the (lower-cased) question prompt. Uncurated controls never match.
 */
export function controlEvidencesQuestion(controlRef: string, questionPrompt: string): boolean {
    const topic = topicForControl(controlRef);
    if (!topic) return false;
    const p = questionPrompt.toLowerCase();
    return topic.keywords.some((k) => p.includes(k));
}
