/**
 * Async-params route-typing ratchet.
 *
 * Next 15+ delivers a route handler's dynamic params as a Promise.
 * Roadmap-6 P3 migrated every handler under src/app/api to the
 * correct contract (params typed Promise + an explicit await) and
 * removed the transparent-await shim that withApiErrorHandling once
 * carried.
 *
 * This guard locks that completion in. A handler that types params
 * synchronously compiles fine -- tsc cannot tell the difference --
 * but at runtime params is a Promise, so a synchronous property
 * access is silently undefined. With the shim gone there is no
 * safety net; this scan IS the safety net.
 *
 * Pure static analysis -- scans src/app/api for route.ts files.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const API_DIR = path.resolve(__dirname, '../../src/app/api');

/** Every route.ts under src/app/api. */
function routeFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...routeFiles(abs));
        else if (entry.name === 'route.ts') out.push(abs);
    }
    return out;
}

/**
 * Flag a synchronously-typed params. A migrated handler reads
 * `params: Promise<...>` (or destructures `{ params: paramsPromise }`,
 * i.e. `params:` followed by an identifier). A sync annotation is
 * `params:` immediately followed by an object-type open-brace -- that
 * is the regression.
 */
const SYNC_PARAMS = /\bparams\s*:\s*\{/;

function syncParamHits(src: string): number[] {
    const hits: number[] = [];
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const stripped = lines[i].trim();
        if (stripped.startsWith('//') || stripped.startsWith('*')) continue;
        if (SYNC_PARAMS.test(lines[i])) hits.push(i + 1);
    }
    return hits;
}

describe('async-params route typing', () => {
    const files = routeFiles(API_DIR);

    it('the scan actually found route handlers (not vacuous)', () => {
        expect(files.length).toBeGreaterThan(250);
    });

    it('no route handler types params synchronously', () => {
        const offenders: string[] = [];
        for (const abs of files) {
            const src = fs.readFileSync(abs, 'utf8');
            for (const line of syncParamHits(src)) {
                offenders.push(`${path.relative(API_DIR, abs)}:${line}`);
            }
        }
        if (offenders.length > 0) {
            throw new Error(
                'Route handler(s) type params synchronously. Next 15+ ' +
                    'delivers params as a Promise -- type it ' +
                    'params: Promise<{ ... }> and await it. A sync ' +
                    'annotation compiles but the access is undefined at ' +
                    'runtime:\n' +
                    offenders.map((o) => '  - ' + o).join('\n'),
            );
        }
        expect(offenders).toHaveLength(0);
    });

    it('detects a synchronously-typed params (regression proof)', () => {
        const sample = [
            'async (req, { params }: { params: { id: string } }) => {',
            '    return ok(params.id);',
        ].join('\n');
        expect(syncParamHits(sample)).toEqual([1]);
    });

    it('accepts the migrated Promise-typed form', () => {
        const sample = [
            'async (req, { params: paramsPromise }: { params: Promise<{ id: string }> }) => {',
            '    const params = await paramsPromise;',
            '    return ok(params.id);',
        ].join('\n');
        expect(syncParamHits(sample)).toEqual([]);
    });
});
