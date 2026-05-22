/**
 * Avatar roadmap, P1 — one avatar renderer.
 *
 * `<InitialsAvatar>` (`src/components/ui/initials-avatar.tsx`) is the
 * single avatar primitive. Before P1, two surfaces still hand-rolled
 * their own initials circle:
 *   - `admin/members` — a `rounded-full` circle + `.charAt(0)`.
 *   - `user-combobox` — carried `image` in its data shape but
 *     rendered no avatar at all.
 *
 * P1 routes both through `<InitialsAvatar>`. Converging on one
 * renderer is the precondition for the rest of the avatar roadmap:
 * when P2 adds image-backed rendering it lands in ONE component and
 * every converged surface upgrades for free.
 *
 * This ratchet locks the two P1 conversions. It does NOT police every
 * avatar in the app — the Controls / Policies owner-column circles
 * use a different (neutral) visual tone and are a deliberate,
 * separately-scoped follow-up.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const MEMBERS_PATH =
    'src/app/t/[tenantSlug]/(app)/admin/members/page.tsx';
const USER_COMBOBOX_PATH = 'src/components/ui/user-combobox.tsx';
const AVATAR_PATH = 'src/components/ui/initials-avatar.tsx';

describe('Avatar renderer convergence (avatar roadmap P1)', () => {
    it('admin/members renders identity through <InitialsAvatar>', () => {
        const src = read(MEMBERS_PATH);
        expect(src).toMatch(
            /import\s*\{\s*InitialsAvatar\s*\}\s*from\s*['"]@\/components\/ui\/initials-avatar['"]/,
        );
        expect(src).toMatch(/<InitialsAvatar\b/);
        // The hand-rolled circle is gone — no `(name || email).charAt(0)`
        // avatar glyph in the members table.
        expect(src).not.toMatch(
            /\.user\.name\s*\|\|\s*m\.user\.email\)\.charAt\(0\)/,
        );
    });

    it('user-combobox renders identity through <InitialsAvatar>', () => {
        const src = read(USER_COMBOBOX_PATH);
        expect(src).toMatch(
            /import\s*\{\s*InitialsAvatar\s*\}\s*from\s*['"]@\/components\/ui\/initials-avatar['"]/,
        );
        // The people-picker projects an avatar into each option via
        // the shared primitive (the Combobox `icon` slot).
        expect(src).toMatch(/<InitialsAvatar\b/);
    });

    it('<InitialsAvatar> is the one home — exports the shared primitive', () => {
        const src = read(AVATAR_PATH);
        expect(src).toMatch(/export function InitialsAvatar\(/);
        expect(src).toMatch(/export function getInitials\(/);
    });
});
