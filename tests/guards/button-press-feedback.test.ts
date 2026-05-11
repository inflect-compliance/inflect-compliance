/**
 * Roadmap-11 PR-4 — Button press-feedback microinteraction.
 *
 * Every `<Button>` instance in the product gets a subtle press-
 * down scale on `:active` so clicks feel responsive. The shrink
 * is centralised in `buttonVariants` — the cva base — so every
 * variant inherits it, every size inherits it, every caller
 * inherits it for free.
 *
 * The press-down scale is the canonical tactile-feedback
 * microinteraction in premium products: small enough to never
 * read as a glitch, large enough to register the click. 3%
 * (`scale-[0.97]`) is the convergent value across Linear / Stripe
 * / Vercel / Notion.
 *
 * `motion-reduce:active:scale-100` honours `prefers-reduced-
 * motion` — the scale disappears entirely for users who opted
 * out of motion. Pairs with the Skeleton shimmer's motion-reduce
 * fallback (R11-PR2).
 *
 * The ratchet locks the press feedback as a property of the cva
 * base, not a per-variant addition. That way, adding a new
 * variant (e.g. `link`, `outline-info`) inherits the press
 * feedback without a contributor having to remember.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

describe('Button press-feedback microinteraction (R11-PR4)', () => {
    test('buttonVariants cva base carries `active:scale-[0.97]`', () => {
        const src = fs.readFileSync(
            path.resolve(ROOT, 'src/components/ui/button-variants.ts'),
            'utf-8',
        );
        // The literal must appear inside the cva base array (the
        // first argument to `cva(`). A per-variant addition wouldn't
        // satisfy this — the goal is centralisation.
        const cvaCall = src.match(/cva\(\s*\[([\s\S]*?)\]\s*,/)?.[1] ?? '';
        expect(cvaCall).toMatch(/active:scale-\[0\.97\]/);
    });

    test('buttonVariants cva base carries the motion-reduce fallback', () => {
        const src = fs.readFileSync(
            path.resolve(ROOT, 'src/components/ui/button-variants.ts'),
            'utf-8',
        );
        const cvaCall = src.match(/cva\(\s*\[([\s\S]*?)\]\s*,/)?.[1] ?? '';
        expect(cvaCall).toMatch(/motion-reduce:active:scale-100/);
    });

    test('buttonVariants cva base preserves the canonical transition timing', () => {
        const src = fs.readFileSync(
            path.resolve(ROOT, 'src/components/ui/button-variants.ts'),
            'utf-8',
        );
        const cvaCall = src.match(/cva\(\s*\[([\s\S]*?)\]\s*,/)?.[1] ?? '';
        // The 150ms duration is what makes the scale animate
        // smoothly rather than snap. Locking the timing here means a
        // future "tidy-up" can't silently kill the transition and
        // turn the press into an instant flip.
        expect(cvaCall).toMatch(/transition-all/);
        expect(cvaCall).toMatch(/duration-150/);
    });
});
