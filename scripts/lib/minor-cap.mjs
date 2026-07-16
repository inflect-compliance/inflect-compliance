/**
 * Pure release-type decision: cap the MINOR version at three digits.
 *
 * semantic-release computes a release *type* (`patch` | `minor` | `major`)
 * from the conventional-commit history. This helper post-processes that
 * decision so the minor component never rolls into four digits: the
 * release that WOULD become `X.1000.0` is promoted to `(X+1).0.0`
 * instead (an odometer-style rollover at the 999→1000 boundary).
 *
 *   1.999.4  --fix-->    1.999.5   (patch never touches the minor)
 *   1.999.4  --feat-->   2.0.0     (minor bump would hit 1000 → roll major)
 *   1.998.0  --feat-->   1.999.0   (999 is allowed — three digits)
 *
 * The rule recurs at every century boundary: 2.999.x --feat--> 3.0.0.
 *
 * IMPORTANT — this makes such a `major` bump COSMETIC: there is no
 * breaking change behind it, only the digit-width rollover. It exists
 * because this app is `npmPublish: false` (no external consumer reads
 * the semver contract) and the version merely feeds the Helm
 * `appVersion` + Docker image tags. A genuine breaking change still
 * bumps the major the normal way (via `feat!` / `BREAKING CHANGE`),
 * independent of this cap.
 *
 * This module is intentionally DEPENDENCY-FREE and pure so it can be
 * unit-tested in isolation (see tests/unit/minor-cap.test.ts, which
 * exercises it through a subprocess to sidestep the ESM-only
 * @semantic-release/commit-analyzer import in the sibling plugin).
 */

/** Highest permitted minor component. A `minor` bump beyond this rolls the major. */
export const MINOR_CAP = 999;

/** Ordinal rank so we can compare release types. */
const RANK = { patch: 1, minor: 2, major: 3 };

/**
 * Promote a `minor` bump to `major` when it would push the minor
 * component past {@link MINOR_CAP}. Everything else passes through
 * unchanged.
 *
 * @param {string|null|undefined} baseType release type from commit-analyzer
 *   (`patch` | `minor` | `major`, or a falsy value meaning "no release").
 * @param {string} lastVersion the last released version, e.g. "1.999.4".
 * @param {number} [cap=MINOR_CAP] highest permitted minor component.
 * @returns {string|null|undefined} the (possibly promoted) release type.
 */
export function capMinor(baseType, lastVersion, cap = MINOR_CAP) {
    // Falsy → no release; nothing to promote.
    if (!baseType) return baseType;
    // A patch never moves the minor component, so it can never breach
    // the cap. A major is already rolling the major. Only a `minor`
    // bump is a promotion candidate.
    if (RANK[baseType] === undefined) return baseType; // unknown type → passthrough
    if (baseType !== 'minor') return baseType;

    // `minor` sets minor := lastMinor + 1. Promote when that reaches
    // cap + 1 (default 1000), i.e. the last minor is already at the cap.
    const lastMinor = Number.parseInt(String(lastVersion ?? '').split('.')[1] ?? '', 10);
    if (Number.isFinite(lastMinor) && lastMinor >= cap) {
        return 'major';
    }
    return baseType;
}
