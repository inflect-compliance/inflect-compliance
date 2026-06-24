#!/usr/bin/env node
/**
 * Minimal, dependency-free OWASP ZAP → SARIF 2.1.0 converter.
 *
 * `zaproxy/action-baseline` writes `report_json.json` but no SARIF, and
 * there's no trustworthy off-the-shelf npm converter — so we ship a tiny
 * one rather than pull an unaudited dependency into CI. Reads the ZAP
 * JSON report (path as argv[2]), writes SARIF to stdout.
 *
 * Mapping: each ZAP alert → a SARIF rule (keyed by pluginid); each alert
 * instance (URL) → a SARIF result with a physicalLocation pointing at the
 * URI. ZAP riskcode 3/2/1/0 → SARIF level error/warning/note/note.
 *
 * Robust by design: any parse/shape error throws (the workflow falls
 * back to an empty-but-valid SARIF so the non-blocking scan never fails
 * on a reporting hiccup).
 */
import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) throw new Error('usage: zap-json-to-sarif.mjs <report_json.json>');

const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
const sites = Array.isArray(report.site) ? report.site : [];

const riskToLevel = (code) => {
    switch (String(code)) {
        case '3': return 'error';   // High
        case '2': return 'warning'; // Medium
        default: return 'note';     // Low / Informational
    }
};

const stripHtml = (s) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '');

const rulesById = new Map();
const results = [];

for (const site of sites) {
    const alerts = Array.isArray(site.alerts) ? site.alerts : [];
    for (const alert of alerts) {
        const ruleId = `ZAP-${alert.pluginid ?? alert.alertRef ?? 'unknown'}`;
        if (!rulesById.has(ruleId)) {
            rulesById.set(ruleId, {
                id: ruleId,
                name: alert.name || alert.alert || ruleId,
                shortDescription: { text: (alert.name || alert.alert || ruleId).slice(0, 200) },
                fullDescription: { text: stripHtml(alert.desc).slice(0, 1000) || (alert.name || ruleId) },
                helpUri: 'https://www.zaproxy.org/docs/alerts/',
                properties: {
                    cweId: alert.cweid,
                    confidence: alert.confidence,
                    tags: ['security', 'dast', 'zap'],
                },
                defaultConfiguration: { level: riskToLevel(alert.riskcode) },
            });
        }
        const instances = Array.isArray(alert.instances) && alert.instances.length
            ? alert.instances
            : [{ uri: site['@name'] || 'http://localhost:3006/' }];
        for (const inst of instances) {
            const uri = inst.uri || site['@name'] || 'http://localhost:3006/';
            const msgParts = [stripHtml(alert.alert || alert.name)];
            if (inst.method) msgParts.push(`[${inst.method}]`);
            if (inst.param) msgParts.push(`param: ${inst.param}`);
            if (inst.evidence) msgParts.push(`evidence: ${String(inst.evidence).slice(0, 120)}`);
            results.push({
                ruleId,
                level: riskToLevel(alert.riskcode),
                message: { text: msgParts.filter(Boolean).join(' — ') || ruleId },
                locations: [{
                    physicalLocation: {
                        // SARIF needs a URI; ZAP findings are URL-scoped, so
                        // the request URL is the "artifact location".
                        artifactLocation: { uri },
                        region: { startLine: 1 },
                    },
                }],
            });
        }
    }
}

const sarif = {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
        tool: {
            driver: {
                name: 'OWASP ZAP Baseline',
                informationUri: 'https://www.zaproxy.org/',
                rules: [...rulesById.values()],
            },
        },
        results,
    }],
};

process.stdout.write(JSON.stringify(sarif, null, 2) + '\n');
