/**
 * Observability-provisioning coverage ratchet.
 *
 * The telemetry the app emits over OTLP/HTTP must be provisionable in
 * BOTH non-compose deploy targets — managed (Grafana Cloud via a
 * Terraform module) and self-hosted (a Helm chart) — so a move off the
 * single VM never strands the observability surface. This guard fails
 * CI if either path is deleted, if the dashboards drift into two
 * copies, or if the topology doc stops documenting the three paths.
 *
 * See docs/observability/01-deployment-topology.md (scale-out section)
 * and docs/implementation-notes/2026-06-25-observability-provisioning.md.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const abs = (p: string) => path.join(ROOT, p);
const read = (p: string) => fs.readFileSync(abs(p), 'utf8');
const exists = (p: string) => fs.existsSync(abs(p));

const TF_DIR = 'infra/terraform/modules/observability';
const HELM_DIR = 'infra/helm/observability';
const CANON_DASH = 'infra/observability/grafana/dashboards';
const HELM_DASH = 'infra/helm/observability/dashboards';
const DASHBOARDS = [
    'inflect-api-overview.json',
    'inflect-jobs-and-queues.json',
    'observability-stack-health.json',
];

describe('observability provisioning coverage', () => {
    describe('PATH A — Terraform managed (Grafana Cloud) module', () => {
        it('module main.tf exists', () => {
            expect(exists(`${TF_DIR}/main.tf`)).toBe(true);
        });

        it('declares the grafana provider', () => {
            const main = read(`${TF_DIR}/main.tf`);
            expect(main).toMatch(/required_providers/);
            expect(main).toMatch(/source\s*=\s*"grafana\/grafana"/);
            // and actually uses it (provisions the cloud stack)
            expect(main).toMatch(/resource\s+"grafana_cloud_stack"/);
        });

        it('outputs the OTLP endpoint', () => {
            const outputs = read(`${TF_DIR}/outputs.tf`);
            expect(outputs).toMatch(/output\s+"grafana_otlp_endpoint"/);
        });

        it('marks the OTLP auth token output sensitive', () => {
            const outputs = read(`${TF_DIR}/outputs.tf`);
            expect(outputs).toMatch(/output\s+"grafana_otlp_basic_auth_token"[\s\S]*?sensitive\s*=\s*true/);
        });
    });

    describe('PATH B — self-hosted Helm chart', () => {
        const chartPath = `${HELM_DIR}/Chart.yaml`;

        it('Chart.yaml exists', () => {
            expect(exists(chartPath)).toBe(true);
        });

        it('pins at least one upstream observability dependency by version', () => {
            const chart = read(chartPath);
            const wanted = ['opentelemetry-collector', 'prometheus', 'tempo', 'grafana'];
            const present = wanted.filter((d) => new RegExp(`name:\\s*${d}\\b`).test(chart));
            expect(present.length).toBeGreaterThanOrEqual(1);
            // dependencies block must carry pinned (quoted, numeric) versions
            expect(chart).toMatch(/version:\s*"[0-9][^"]*"/);
            expect(chart).toMatch(/dependencies:/);
        });

        it('ships base + staging + production values', () => {
            for (const v of ['values.yaml', 'values-staging.yaml', 'values-production.yaml']) {
                expect(exists(`${HELM_DIR}/${v}`)).toBe(true);
            }
        });
    });

    describe('dashboards — single source of truth (no compose/Helm drift)', () => {
        it('the three dashboards are REAL files at the canonical compose location', () => {
            for (const f of DASHBOARDS) {
                const full = abs(`${CANON_DASH}/${f}`);
                expect(fs.existsSync(full)).toBe(true);
                expect(fs.lstatSync(full).isFile()).toBe(true);
            }
        });

        it('the Helm chart references them via a symlink, not duplicate copies', () => {
            expect(fs.existsSync(abs(HELM_DASH))).toBe(true);
            expect(fs.lstatSync(abs(HELM_DASH)).isSymbolicLink()).toBe(true);
            expect(fs.realpathSync(abs(HELM_DASH))).toBe(fs.realpathSync(abs(CANON_DASH)));
        });

        it('exactly ONE real copy of each dashboard exists in the repo', () => {
            for (const f of DASHBOARDS) {
                const helmCopy = abs(`${HELM_DASH}/${f}`);
                // Reachable through the symlink, but must NOT be an independent real file
                // under a real Helm dashboards directory.
                const helmDirIsSymlink = fs.lstatSync(abs(HELM_DASH)).isSymbolicLink();
                expect(helmDirIsSymlink).toBe(true);
                // (helmCopy resolves to the canonical file via the symlink)
                expect(fs.realpathSync(helmCopy)).toBe(fs.realpathSync(abs(`${CANON_DASH}/${f}`)));
            }
        });
    });

    describe('topology doc lists all three deploy paths', () => {
        const doc = read('docs/observability/01-deployment-topology.md');

        it('documents the single-VM compose path', () => {
            expect(doc).toMatch(/docker-compose\.observability\.yml/);
        });

        it('documents the self-hosted Helm path', () => {
            expect(doc).toMatch(/infra\/helm\/observability/);
        });

        it('documents the managed Grafana Cloud path', () => {
            expect(doc).toMatch(/grafana cloud/i);
            expect(doc).toMatch(/infra\/terraform\/modules\/observability/);
        });
    });
});
