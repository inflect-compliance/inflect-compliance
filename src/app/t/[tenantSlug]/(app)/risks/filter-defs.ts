/**
 * Epic 53 — Risks list page filter configuration.
 *
 * URL-synchronised filter defs backing the Risks toolbar. Keys align with
 * `RiskQuerySchema` except for `score`, which is a *UI-side* range token
 * (`"min|max"`) that splits into `scoreMin` / `scoreMax` on the API boundary.
 *
 *   q            → free-text search (`useFilterContext`'s search slot)
 *   status       → RiskStatus (OPEN | MITIGATING | MITIGATED | ACCEPTED | CLOSED)
 *   category     → free-form string (options derived from loaded rows)
 *   ownerUserId  → entity-reference (options derived from loaded rows)
 *   score        → range token; server consumes scoreMin + scoreMax
 *
 * The range-split transform lives alongside the filter defs so every caller
 * (page-level fetch, SSR filter normaliser, tests) shares one source of
 * truth for the UI ↔ API key translation.
 */

import type {
    FilterDefInput,
} from '@/components/ui/filter/filter-definitions';
import {
    createTypedFilterDefs,
    optionsFromEnum,
} from '@/components/ui/filter/filter-definitions';
import type { FilterOption } from '@/components/ui/filter/types';
import { rangeSplitTransform, type FilterApiTransform } from '@/lib/filters/url-sync';
import { CircleDot, Tag, Activity, UserCircle2 } from 'lucide-react';

// ─── Static labels ──────────────────────────────────────────────────

export const RISK_STATUS_LABELS = {
    OPEN: 'Open',
    MITIGATING: 'Mitigating',
    // Audit Coherence S1 — distinct from MITIGATING (active control
    // implementation in progress) and ACCEPTED (residual explicitly
    // signed-off). MITIGATED means the planned controls are in place
    // and the residual score has been computed but no explicit
    // acceptance call has been made yet.
    MITIGATED: 'Mitigated',
    ACCEPTED: 'Accepted',
    CLOSED: 'Closed',
} as const;

// ─── Static filter definitions ──────────────────────────────────────

const STATIC_DEFS = {
    status: {
        label: 'Status',
        description: 'Lifecycle stage of the risk.',
        group: 'Attributes',
        icon: CircleDot,
        options: optionsFromEnum(RISK_STATUS_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    category: {
        label: 'Category',
        description: 'Free-form risk category.',
        group: 'Attributes',
        icon: Tag,
        options: null, // derived from loaded risks
        multiple: true,
        resetBehavior: 'clearable',
    },
    ownerUserId: {
        label: 'Owner',
        labelPlural: 'Owners',
        description: 'User accountable for treating the risk.',
        group: 'People',
        icon: UserCircle2,
        options: null, // derived from loaded risks
        multiple: true,
        shouldFilter: true,
        resetBehavior: 'clearable',
    },
    score: {
        label: 'Risk score',
        description: 'Inherent risk score range (0–25 by default).',
        group: 'Quantitative',
        icon: Activity,
        options: null,
        type: 'range',
        hideOperator: true,
        rangeNumberStep: 1,
        formatRangeBound: (n) => String(n),
        formatRangePillLabel: (token) => {
            const [min, max] = token.split('|');
            const fmt = (raw: string) => (raw === '' ? '—' : raw);
            return `Score ${fmt(min)}–${fmt(max)}`;
        },
        resetBehavior: 'clearable',
    },
} satisfies Record<string, FilterDefInput>;

export const riskFilterDefs = createTypedFilterDefs()(STATIC_DEFS);
export const RISK_FILTER_KEYS = riskFilterDefs.filterKeys;

// ─── URL → API transforms ───────────────────────────────────────────

/**
 * Map UI keys to API params. Most keys pass through; `score` splits into
 * `scoreMin` + `scoreMax`. Used by the page when building the fetch URL.
 */
export const RISK_API_TRANSFORMS: Record<string, FilterApiTransform> = {
    score: rangeSplitTransform('scoreMin', 'scoreMax'),
};

// ─── Runtime option builders ────────────────────────────────────────

interface RiskLike {
    category?: string | null;
    ownerUserId?: string | null;
    treatmentOwner?: string | null;
    owner?: { id: string; name?: string | null; email?: string | null } | null;
}

/**
 * Build category options from loaded risks. Free-form strings: dedupe + sort.
 */
export function categoryOptionsFromRisks(
    risks: ReadonlyArray<RiskLike>,
): FilterOption[] {
    const seen = new Set<string>();
    for (const r of risks) {
        const cat = r.category?.trim();
        if (cat) seen.add(cat);
    }
    return Array.from(seen)
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value }));
}

/**
 * Build owner options from loaded risks. Prefers the joined `owner`
 * relation (id + name) when present; falls back to the `treatmentOwner`
 * free-text when that's all the server included.
 */
export function ownerOptionsFromRisks(
    risks: ReadonlyArray<RiskLike>,
): FilterOption[] {
    const seen = new Map<string, FilterOption>();
    for (const r of risks) {
        const ownerRel = r.owner;
        if (ownerRel?.id && !seen.has(ownerRel.id)) {
            const name = ownerRel.name?.trim() || ownerRel.email?.trim() || 'Unknown';
            seen.set(ownerRel.id, {
                value: ownerRel.id,
                label: ownerRel.email ? `${name} — ${ownerRel.email}` : name,
                displayLabel: name,
            });
            continue;
        }
        // Legacy data: treatmentOwner is a free-text display string with no id.
        // Use the text as the option value so filtering remains idempotent.
        if (!ownerRel && r.ownerUserId) {
            if (seen.has(r.ownerUserId)) continue;
            seen.set(r.ownerUserId, {
                value: r.ownerUserId,
                label: r.treatmentOwner || r.ownerUserId,
                displayLabel: r.treatmentOwner || r.ownerUserId,
            });
        }
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function buildRiskFilters(risks: ReadonlyArray<RiskLike>) {
    const categoryOpts = categoryOptionsFromRisks(risks);
    const ownerOpts = ownerOptionsFromRisks(risks);
    return riskFilterDefs.filters.map((f) => {
        if (f.key === 'category') return { ...f, options: categoryOpts };
        if (f.key === 'ownerUserId') return { ...f, options: ownerOpts };
        return f;
    });
}
