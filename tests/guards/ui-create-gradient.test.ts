/**
 * UI roadmap 11 — subtler create-button gradient.
 *
 * The create/primary button fill (--btn-gradient-primary) shifted to a dark
 * blue at the far (bottom-right) corner from 60%. It now holds brand across the
 * first half and ramps to a SUBTLE, lighter cool tail (transition at 50%, not
 * 60%; lighter end than the old #3b82f6 dark / #1e3a8a navy-900) so the far
 * corner isn't too dark. Both themes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const TOKENS = fs.readFileSync(
    path.resolve(__dirname, '../../src/styles/tokens.css'),
    'utf8',
);

describe('UI-11 — create-button gradient is subtler', () => {
    it('both themes ramp from the 50% mark, not 60%', () => {
        const lines = TOKENS.split('\n').filter((l) =>
            l.includes('--btn-gradient-primary:'),
        );
        expect(lines.length).toBe(2); // dark + light
        for (const l of lines) {
            expect(l).toMatch(/var\(--brand-default\) 50%/);
            expect(l).not.toMatch(/var\(--brand-default\) 60%/);
        }
    });
    it('drops the too-dark end colours (#3b82f6 / #1e3a8a)', () => {
        const grad = TOKENS.split('\n')
            .filter((l) => l.includes('--btn-gradient-primary:'))
            .join('\n');
        expect(grad).not.toMatch(/#3b82f6/);
        expect(grad).not.toMatch(/#1e3a8a/);
    });
});
