/**
 * semantic-release `analyzeCommits` plugin — minor-version cap wrapper.
 *
 * Delegates the normal conventional-commit release-type decision to
 * @semantic-release/commit-analyzer, then applies {@link capMinor} so
 * the minor component never rolls into four digits (the release that
 * would be `X.1000.0` becomes `(X+1).0.0` instead). See
 * scripts/lib/minor-cap.mjs for the full rationale and the COSMETIC-
 * major caveat.
 *
 * Wired as the SOLE `analyzeCommits` plugin in `.releaserc.json` — it
 * REPLACES the bare `@semantic-release/commit-analyzer` entry (whose
 * preset + releaseRules config it receives verbatim as `pluginConfig`
 * and forwards inward). Keeping it the only analyzeCommits provider
 * means there is a single release-type decision; there is no
 * max-merge across two analyzeCommits plugins to reason about.
 *
 * commit-analyzer is ESM-only (`"type": "module"`), so this wrapper is
 * `.mjs` and uses a static `import`.
 */
import { analyzeCommits as baseAnalyzeCommits } from '@semantic-release/commit-analyzer';
import { capMinor } from './lib/minor-cap.mjs';

/**
 * @param {object} pluginConfig commit-analyzer config (preset, releaseRules …)
 * @param {object} context semantic-release context (commits, lastRelease, logger …)
 * @returns {Promise<string|null>} release type, minor→major-promoted at the cap.
 */
export async function analyzeCommits(pluginConfig, context) {
    const baseType = await baseAnalyzeCommits(pluginConfig, context);
    const lastVersion = context?.lastRelease?.version ?? '';
    const finalType = capMinor(baseType, lastVersion);

    if (finalType !== baseType) {
        context?.logger?.log?.(
            `minor-cap: promoting release type ${baseType}→${finalType} — ` +
                `last release ${lastVersion || '(none)'} would push the minor past 999, ` +
                'rolling the major instead (cosmetic; no breaking change).',
        );
    }
    return finalType;
}
