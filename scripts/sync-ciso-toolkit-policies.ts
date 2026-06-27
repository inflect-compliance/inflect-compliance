/**
 * Re-sync the vendored ciso-toolkit ISMS policy templates.
 *
 * Source: https://github.com/D4d0/ciso-toolkit (MIT) — 15 ISMS policy
 * documents (POL-00 … POL-14), markdown, mapped to ISO 27001 + NIS2.
 *
 * We port the CONTENT only (the policy prose), normalised into IC's
 * `PolicyTemplate` shape, into a PINNED fixture
 * (`prisma/fixtures/policy-templates-ciso-toolkit.json`). The fixture is
 * the source of truth so the seed/build is hermetic. Re-syncing is a
 * DELIBERATE operator action — policy content is compliance-load-bearing,
 * and a silent auto-update could change a tenant's adopted policy text.
 *
 * Run:  npx tsx scripts/sync-ciso-toolkit-policies.ts
 *
 * Normalisation:
 *   - strip the YAML frontmatter (doc metadata; the prose body is the value);
 *   - replace toolkit-internal cross-file links (`[text](../standards-…)`)
 *     with plain text — they don't resolve inside IC (a dead link in a
 *     tenant's policy is worse than a plain reference). http(s) links kept.
 * Attribution: MIT — see prisma/fixtures/policy-templates-ciso-toolkit.LICENSE.md.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO = 'D4d0/ciso-toolkit';
const PINNED_SHA = '97cb39cfb7c0179bddc065ed19dbb8012e290a05';
const SOURCE_URL = `https://github.com/${REPO}`;
const FIXTURE_PATH = path.resolve(__dirname, '../prisma/fixtures/policy-templates-ciso-toolkit.json');

interface PolicyMap {
    file: string;
    externalRef: string;
    title: string;
    category: string;
    /** Domain tag appended to the fixed iso27001,nis2 pair. */
    domainTag: string;
}

// 1:1 POL → IC category + title. All 15 map to ISO 27001 + NIS2 (the
// toolkit's stated coverage); per-requirement mapping is a follow-up.
const POLICIES: PolicyMap[] = [
    { file: 'POL-00_DocumentControlPolicy', externalRef: 'POL-00', title: 'Document Control Policy', category: 'Document Control', domainTag: 'document-control' },
    { file: 'POL-01_InformationSecurityPolicy', externalRef: 'POL-01', title: 'Information Security Policy', category: 'Information Security', domainTag: 'infosec' },
    { file: 'POL-02_RiskManagementPolicy', externalRef: 'POL-02', title: 'Risk Management Policy', category: 'Risk Management', domainTag: 'risk' },
    { file: 'POL-03_AssetAndDataManagementPolicy', externalRef: 'POL-03', title: 'Asset & Data Management Policy', category: 'Asset Management', domainTag: 'asset' },
    { file: 'POL-04_ThirdPartyAndExternalSystemsPolicy', externalRef: 'POL-04', title: 'Third-Party & External Systems Policy', category: 'Governance', domainTag: 'third-party' },
    { file: 'POL-05_IdentityAndAccessManagementPolicy', externalRef: 'POL-05', title: 'Identity & Access Management Policy', category: 'IAM', domainTag: 'iam' },
    { file: 'POL-06_NetworkSecurityPolicy', externalRef: 'POL-06', title: 'Network Security Policy', category: 'Network Security', domainTag: 'network' },
    { file: 'POL-07_CryptographyAndDataProtectionPolicy', externalRef: 'POL-07', title: 'Cryptography & Data Protection Policy', category: 'Cryptography', domainTag: 'crypto' },
    { file: 'POL-08_OperationsSecurityPolicy', externalRef: 'POL-08', title: 'Operations Security Policy', category: 'Operations', domainTag: 'operations' },
    { file: 'POL-09_BackupAndRecoveryPolicy', externalRef: 'POL-09', title: 'Backup & Recovery Policy', category: 'Backup & Recovery', domainTag: 'backup' },
    { file: 'POL-10_LoggingAndMonitoringPolicy', externalRef: 'POL-10', title: 'Logging & Monitoring Policy', category: 'Logging & Monitoring', domainTag: 'logging' },
    { file: 'POL-11_EndpointSecurityPolicy', externalRef: 'POL-11', title: 'Endpoint Security Policy', category: 'Endpoint', domainTag: 'endpoint' },
    { file: 'POL-12_SecurityAwarenessAndHRPolicy', externalRef: 'POL-12', title: 'Security Awareness & HR Policy', category: 'Awareness & HR', domainTag: 'awareness' },
    { file: 'POL-13_IncidentResponseAndCommunicationsPolicy', externalRef: 'POL-13', title: 'Incident Response & Communications Policy', category: 'Incident Response', domainTag: 'incident' },
    { file: 'POL-14_BusinessContinuityAndDRPolicy', externalRef: 'POL-14', title: 'Business Continuity & DR Policy', category: 'Business Continuity', domainTag: 'bcdr' },
];

/** Strip YAML frontmatter + de-link toolkit-internal cross-file links. */
export function normalizePolicyMarkdown(raw: string): string {
    let body = raw.replace(/^---\n[\s\S]*?\n---\n+/, '');
    // [text](non-http relative path) → text (toolkit internal link won't resolve).
    body = body.replace(/\[([^\]]+)\]\((?!https?:)[^)]*\)/g, '$1');
    return body.trim() + '\n';
}

async function main() {
    const importedAt = new Date().toISOString().slice(0, 10);
    const out: unknown[] = [];
    for (const p of POLICIES) {
        const url = `https://raw.githubusercontent.com/${REPO}/${PINNED_SHA}/policies/${p.file}.md`;
        process.stdout.write(`Fetching ${p.externalRef} …\n`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`fetch ${p.file} failed: ${res.status} ${res.statusText}`);
        const contentText = normalizePolicyMarkdown(await res.text());
        if (!contentText || contentText.length < 200) {
            throw new Error(`${p.externalRef} normalised body suspiciously short (${contentText.length} chars)`);
        }
        out.push({
            externalRef: p.externalRef,
            title: p.title,
            category: p.category,
            language: 'en',
            contentType: 'MARKDOWN',
            contentText,
            tags: `iso27001,nis2,${p.domainTag}`,
            source: 'ciso-toolkit',
            sourceVersion: PINNED_SHA,
            sourceLicense: 'MIT',
        });
    }
    const payload = {
        source: SOURCE_URL,
        sourceVersion: PINNED_SHA,
        license: 'MIT',
        attribution: `Policy templates adapted from ciso-toolkit (${SOURCE_URL}), licensed under the MIT License.`,
        importedAt,
        templates: out,
    };
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(payload, null, 2) + '\n');
    process.stdout.write(`✅ wrote ${out.length} policy templates → ${path.relative(process.cwd(), FIXTURE_PATH)}\n`);
}

// Only run when invoked directly (the normalizer is imported by tests).
if (require.main === module) {
    main().catch((err) => {
        process.stderr.write(`sync-ciso-toolkit-policies failed: ${String(err)}\n`);
        process.exit(1);
    });
}
