/**
 * SARIF parser — the canonical scanner-output normaliser. Pure function,
 * so these assertions pin the severity matrix, CWE extraction, fingerprint
 * dedup, and tool inference without any DB.
 */
import {
    parseSarif,
    inferTool,
    securitySeverityToSeverity,
    SARIF_LEVEL_TO_SEVERITY,
} from '@/app-layer/services/sarif';

function sarif(toolName: string, results: unknown[], rules: unknown[] = []) {
    return {
        version: '2.1.0',
        runs: [{ tool: { driver: { name: toolName, rules } }, results }],
    };
}

describe('parseSarif', () => {
    it('throws on a non-SARIF document', () => {
        expect(() => parseSarif({})).toThrow(/runs/);
        expect(() => parseSarif(null)).toThrow();
        expect(() => parseSarif('nope')).toThrow();
    });

    it('returns no findings for an empty results array', () => {
        const out = parseSarif(sarif('Semgrep', []));
        expect(out.findings).toHaveLength(0);
        expect(out.source).toBe('SEMGREP');
        expect(out.scanType).toBe('SAST');
    });

    it('normalises a result: ruleId, title, location, message', () => {
        const out = parseSarif(
            sarif('Semgrep', [
                {
                    ruleId: 'js.xss',
                    level: 'error',
                    message: { text: 'Reflected XSS in handler' },
                    locations: [
                        {
                            physicalLocation: {
                                artifactLocation: { uri: 'src/app.ts' },
                                region: { startLine: 42 },
                            },
                        },
                    ],
                },
            ]),
        );
        expect(out.findings).toHaveLength(1);
        const f = out.findings[0];
        expect(f.ruleId).toBe('js.xss');
        expect(f.location).toBe('src/app.ts:42');
        expect(f.description).toBe('Reflected XSS in handler');
        expect(f.severity).toBe('HIGH'); // level error → HIGH
    });

    it('security-severity overrides level (CVSS-style matrix)', () => {
        const out = parseSarif(
            sarif(
                'CodeQL',
                [{ ruleId: 'r1', level: 'note', message: { text: 'x' } }],
                [{ id: 'r1', properties: { 'security-severity': '9.4' } }],
            ),
        );
        expect(out.findings[0].severity).toBe('CRITICAL'); // 9.4 wins over note
    });

    it('extracts + normalises CWE refs from rule tags', () => {
        const out = parseSarif(
            sarif(
                'Semgrep',
                [{ ruleId: 'r1', level: 'warning', message: { text: 'x' } }],
                [{ id: 'r1', properties: { tags: ['security', 'external/cwe/cwe-79'] } }],
            ),
        );
        expect(out.findings[0].cweIds).toContain('CWE-79');
        expect(out.findings[0].severity).toBe('MEDIUM');
    });

    it('fingerprint is stable for the same issue and differs by location', () => {
        const mk = (line: number) =>
            parseSarif(
                sarif('Semgrep', [
                    {
                        ruleId: 'r1',
                        level: 'error',
                        message: { text: 'same' },
                        locations: [
                            { physicalLocation: { artifactLocation: { uri: 'a.ts' }, region: { startLine: line } } },
                        ],
                    },
                ]),
            ).findings[0].fingerprint;
        expect(mk(10)).toBe(mk(10)); // stable
        expect(mk(10)).not.toBe(mk(11)); // location-sensitive
    });

    it('prefers the tool-provided fingerprint when present', () => {
        const out = parseSarif(
            sarif('Semgrep', [
                {
                    ruleId: 'r1',
                    level: 'error',
                    message: { text: 'm' },
                    partialFingerprints: { primaryLocationLineHash: 'abc123' },
                },
            ]),
        );
        // deterministic hash of `${ruleId} ${toolFp}` → just assert it's a 64-hex sha256
        expect(out.findings[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });
});

describe('severity matrix + tool inference', () => {
    it('securitySeverityToSeverity thresholds', () => {
        expect(securitySeverityToSeverity(9.0)).toBe('CRITICAL');
        expect(securitySeverityToSeverity(7.0)).toBe('HIGH');
        expect(securitySeverityToSeverity(4.0)).toBe('MEDIUM');
        expect(securitySeverityToSeverity(3.9)).toBe('LOW');
    });

    it('level map', () => {
        expect(SARIF_LEVEL_TO_SEVERITY.error).toBe('HIGH');
        expect(SARIF_LEVEL_TO_SEVERITY.warning).toBe('MEDIUM');
        expect(SARIF_LEVEL_TO_SEVERITY.note).toBe('LOW');
    });

    it('infers source + scanType from tool name', () => {
        expect(inferTool('Semgrep OSS')).toEqual({ source: 'SEMGREP', scanType: 'SAST' });
        expect(inferTool('Trivy')).toEqual({ source: 'TRIVY', scanType: 'SCA' });
        expect(inferTool('gitleaks')).toEqual({ source: 'GITLEAKS', scanType: 'SECRETS' });
        expect(inferTool('Checkov')).toEqual({ source: 'CHECKOV', scanType: 'IAC' });
        expect(inferTool('OWASP ZAP')).toEqual({ source: 'ZAP', scanType: 'DAST' });
        expect(inferTool('MysteryTool')).toEqual({ source: 'OTHER', scanType: 'SAST' });
    });
});
