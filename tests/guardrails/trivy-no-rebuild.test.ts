/**
 * Structural ratchet — the Trivy image scan must NOT rebuild the image.
 *
 * The `docker` job builds the image once and exports it as a tarball
 * artifact; the `trivy` job downloads that artifact and `docker load`s
 * it. A previous shape rebuilt the image inside `trivy` via
 * `docker/build-push-action` (~7.5 min wasted per run, since each job
 * runs on a fresh runner with no shared daemon and the GHA layer cache
 * barely helps the final assemble+load).
 *
 * This test fails CI if a future change reintroduces the in-job
 * rebuild, or breaks the artifact handoff.
 */
import * as fs from 'fs';
import * as path from 'path';

const CI_YML = path.resolve(__dirname, '../../.github/workflows/ci.yml');

/**
 * Slice out a single top-level job block (2-space-indented `  <name>:`
 * header through the line before the next 2-space-indented header).
 */
function jobBlock(yaml: string, jobName: string): string {
    const lines = yaml.split('\n');
    const start = lines.findIndex((l) => l === `  ${jobName}:`);
    if (start === -1) throw new Error(`job "${jobName}" not found in ci.yml`);
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        // Next top-level job header: exactly two spaces of indent then a key.
        if (/^ {2}\S/.test(lines[i])) { end = i; break; }
    }
    return lines.slice(start, end).join('\n');
}

describe('trivy job reuses the docker artifact (no rebuild)', () => {
    const yaml = fs.readFileSync(CI_YML, 'utf-8');
    const trivy = jobBlock(yaml, 'trivy');
    const docker = jobBlock(yaml, 'docker');

    it('trivy does NOT rebuild the image (no docker/build-push-action)', () => {
        expect(trivy).not.toMatch(/docker\/build-push-action/);
        // The buildx setup only existed to support the rebuild.
        expect(trivy).not.toMatch(/docker\/setup-buildx-action/);
    });

    it('trivy downloads the image artifact and loads it', () => {
        expect(trivy).toMatch(/actions\/download-artifact/);
        expect(trivy).toMatch(/docker load --input/);
    });

    it('docker job exports the image tarball as an artifact', () => {
        expect(docker).toMatch(/outputs:\s*type=docker,dest=/);
        expect(docker).toMatch(/actions\/upload-artifact/);
        // The artifact name the two jobs agree on.
        expect(docker).toMatch(/name:\s*docker-image-\$\{\{\s*github\.sha\s*\}\}/);
        // `load: true` must NOT come back — that was the old handoff that
        // dies with the job (fresh runner, no shared daemon).
        expect(docker).not.toMatch(/^\s*load:\s*true/m);
    });

    it('the artifact name is identical in both jobs (handoff matches)', () => {
        const dl = trivy.match(/name:\s*(docker-image-\$\{\{\s*github\.sha\s*\}\})/);
        const up = docker.match(/name:\s*(docker-image-\$\{\{\s*github\.sha\s*\}\})/);
        expect(dl?.[1]).toBeDefined();
        expect(dl?.[1]).toBe(up?.[1]);
    });
});
