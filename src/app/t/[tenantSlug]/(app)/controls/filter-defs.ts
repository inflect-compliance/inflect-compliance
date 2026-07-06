/**
 * Epic 53 — Controls list page filter configuration.
 *
 * Declarative filter defs for the Controls list toolbar. Keys map 1:1 onto
 * the API query parameters accepted by `GET /api/t/:slug/controls`:
 *
 *   q             → free-text search (managed by useFilterContext's search slot)
 *   status        → ControlStatus enum
 *   applicability → APPLICABLE | NOT_APPLICABLE
 *   ownerUserId   → entity-ref (user IDs; options derived client-side from loaded rows)
 *   category      → free-form string (options derived client-side from loaded rows)
 *
 * `framework` is intentionally excluded — it would require a subquery across
 * `FrameworkMapping` which the controls API does not expose today. Adding it
 * will be a follow-on server + repo change; left as a migration note.
 *
 * This module is the single source of truth for the Controls filter contract.
 * Do not scatter filter logic back into the page; extend the config instead.
 *
 * i18n (filter-defs factory): display labels resolve through next-intl at
 * render via `buildControlFilters(loaded, t, tGroup)` — `t` scoped to
 * `controls`, `tGroup` to the shared `common.filterGroups`. `buildControlStatusLabels(t)`
 * is the single source of truth for status copy (the client reuses it for
 * badges). The URL-sync KEYS stay static; option VALUES (enum members) are
 * unchanged — only labels are localized.
 */

// Import from concrete sub-modules (not the barrel) so that jest's node env
// can require this file without transitively pulling the tsx components.
// Next.js / bundlers resolve these identically to the barrel re-exports.
import type {
    FilterDef,
    FilterDefInput,
} from '@/components/ui/filter/filter-definitions';
import {
    createTypedFilterDefs,
    optionsFromEnum,
} from '@/components/ui/filter/filter-definitions';
import type { FilterOption } from '@/components/ui/filter/types';
import { CircleDot, Tag, UserCircle2, ShieldCheck } from 'lucide-react';

/** Surface-namespace resolver (`useTranslations('controls')`). */
type T = (key: string, values?: Record<string, unknown>) => string;
/** Shared filter-group resolver (`useTranslations('common.filterGroups')`). */
type TGroup = (key: string) => string;

// ─── Labels (resolved at render) ─────────────────────────────────────

/** ControlStatus enum → label. Single source of truth (client reuses it for
 *  status badges). Values are the enum members (unchanged). */
export function buildControlStatusLabels(t: T): Record<string, string> {
    return {
        NOT_STARTED: t('filterEnums.status.NOT_STARTED'),
        PLANNED: t('filterEnums.status.PLANNED'),
        IN_PROGRESS: t('filterEnums.status.IN_PROGRESS'),
        IMPLEMENTING: t('filterEnums.status.IMPLEMENTING'),
        IMPLEMENTED: t('filterEnums.status.IMPLEMENTED'),
        NEEDS_REVIEW: t('filterEnums.status.NEEDS_REVIEW'),
        NOT_APPLICABLE: t('filterEnums.status.NOT_APPLICABLE'),
    };
}

function applicabilityLabels(t: T): Record<string, string> {
    return {
        APPLICABLE: t('filterEnums.applicability.APPLICABLE'),
        NOT_APPLICABLE: t('filterEnums.applicability.NOT_APPLICABLE'),
    };
}

// ─── Filter definitions (factory) ────────────────────────────────────
//
// Owner and Category default to `options: null` — FilterSelect treats that as
// "async loading" and the page swaps in derived options at render time.

function controlFilterDefsInput(t: T, tGroup: TGroup) {
    return {
        status: {
            label: t('filters.status'),
            labelPlural: t('filters.statusPlural'),
            description: t('filters.statusDesc'),
            group: tGroup('attributes'),
            icon: CircleDot,
            options: optionsFromEnum(buildControlStatusLabels(t)),
            multiple: true,
            resetBehavior: 'clearable',
        },
        applicability: {
            label: t('filters.applicability'),
            description: t('filters.applicabilityDesc'),
            group: tGroup('attributes'),
            icon: ShieldCheck,
            options: optionsFromEnum(applicabilityLabels(t)),
            resetBehavior: 'clearable',
        },
        ownerUserId: {
            label: t('filters.owner'),
            labelPlural: t('filters.ownerPlural'),
            description: t('filters.ownerDesc'),
            group: tGroup('people'),
            icon: UserCircle2,
            options: null, // filled in at render time from loaded controls
            multiple: true,
            shouldFilter: true, // cmdk filters the (client-derived) label text
            resetBehavior: 'clearable',
        },
        category: {
            label: t('filters.category'),
            labelPlural: t('filters.categoryPlural'),
            description: t('filters.categoryDesc'),
            group: tGroup('attributes'),
            icon: Tag,
            options: null, // filled in at render time from loaded controls
            multiple: true,
            resetBehavior: 'clearable',
        },
    } satisfies Record<string, FilterDefInput>;
}

/** Build the localized control filter defs. `t` = `useTranslations('controls')`,
 *  `tGroup` = `useTranslations('common.filterGroups')`. Memoize per render. */
export function buildControlFilterDefs(t: T, tGroup: TGroup) {
    return createTypedFilterDefs()(controlFilterDefsInput(t, tGroup));
}

// ─── Public API ──────────────────────────────────────────────────────

// The URL-sync KEYS are label-independent — derive them once with an identity
// resolver so callers keep importing a stable `CONTROL_FILTER_KEYS` constant.
const IDENTITY: T = (k) => k;
const IDENTITY_GROUP: TGroup = (k) => k;
export const CONTROL_FILTER_KEYS = buildControlFilterDefs(IDENTITY, IDENTITY_GROUP).filterKeys;

// ─── Runtime option builders ─────────────────────────────────────────

interface OwnerLike {
    id: string;
    name?: string | null;
    email?: string | null;
}

/**
 * Build owner options from the controls currently loaded on the page.
 * Dedupes by `owner.id` and sorts by display label. Skips rows with no owner.
 */
export function ownerOptionsFromControls(
    controls: ReadonlyArray<{ owner?: OwnerLike | null }>,
): FilterOption[] {
    const seen = new Map<string, FilterOption>();
    for (const c of controls) {
        const o = c.owner;
        if (!o?.id) continue;
        if (seen.has(o.id)) continue;
        const name = o.name?.trim() || o.email?.trim() || 'Unknown';
        seen.set(o.id, {
            value: o.id,
            label: o.email ? `${name} — ${o.email}` : name,
            displayLabel: name,
        });
    }
    return Array.from(seen.values()).sort((a, b) =>
        a.label.localeCompare(b.label),
    );
}

/**
 * Build category options from the controls currently loaded on the page.
 * `category` is free-form on the Control model, so we dedupe on the raw
 * string and surface the same string as both value and label.
 */
export function categoryOptionsFromControls(
    controls: ReadonlyArray<{ category?: string | null }>,
): FilterOption[] {
    const seen = new Set<string>();
    for (const c of controls) {
        const cat = c.category?.trim();
        if (cat) seen.add(cat);
    }
    return Array.from(seen)
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value }));
}

/**
 * Produce the Filter[] array that FilterSelect consumes, with `options` on
 * the owner/category defs replaced by the runtime-derived lists. Returns
 * the same `FilterDef[]` shape (options is the only field that changes).
 */
export function buildControlFilters(
    loaded: ReadonlyArray<{
        owner?: OwnerLike | null;
        category?: string | null;
    }>,
    t: T,
    tGroup: TGroup,
): FilterDef[] {
    const ownerOpts = ownerOptionsFromControls(loaded);
    const categoryOpts = categoryOptionsFromControls(loaded);
    return buildControlFilterDefs(t, tGroup).filters.map((f) => {
        if (f.key === 'ownerUserId') return { ...f, options: ownerOpts };
        if (f.key === 'category') return { ...f, options: categoryOpts };
        return f;
    });
}
