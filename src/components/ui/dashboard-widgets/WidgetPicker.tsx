"use client";

/**
 * Epic 41 — `<WidgetPicker>` modal.
 *
 * Production-grade picker for adding new widgets to the org-level
 * dashboard. Built from existing Inflect primitives — Modal,
 * RadioGroup, FormField, Input, NumberStepper — so the visual
 * language matches every other create flow in the app (no bespoke
 * overlay, no one-off form chrome).
 *
 * Flow:
 *
 *   1. Open the modal via `open` / `onOpenChange` (parent controls
 *      lifecycle so the trigger button + the dialog stay decoupled).
 *
 *   2. The user picks a widget TYPE (radio group: KPI / DONUT / TREND /
 *      TENANT_LIST / DRILLDOWN_CTAS).
 *
 *   3. The form re-derives valid CHART VARIANT options + the per-type
 *      CONFIG inputs (e.g. KPI gets `format` + `chartType` choice; TREND
 *      gets a `days` stepper). The variant set + config defaults match
 *      the Zod schema in `org-dashboard-widget.schemas.ts` exactly so
 *      the POST round-trip never 400s on a default value.
 *
 *   4. The user can optionally set a custom TITLE (defaults to a
 *      human-readable label derived from the variant when blank).
 *
 *   5. Submit → caller's `onSubmit(input)` → modal closes on success
 *      and fires `onCreated(widget)` so the parent can append the new
 *      widget to its grid state.
 *
 * The picker does NOT decide where the new widget goes on the grid —
 * `react-grid-layout`'s vertical compactor places new tiles at the
 * top of the dashboard automatically, and the picker emits a default
 * `(x, y)` of `(0, 0)` plus a per-type sensible `(w, h)`. Re-arrange
 * is the existing drag affordance.
 *
 * Errors surface inline via the standard `<FormError>` slot beneath
 * the submit row; the modal stays open so the user can correct the
 * field that failed.
 */

import { useMemo, useState } from 'react';

import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

import type {
    CreateOrgDashboardWidgetInput,
    OrgDashboardWidgetDto,
    WidgetPosition,
    WidgetSize,
} from '@/app-layer/schemas/org-dashboard-widget.schemas';

// ─── Variant catalogues ─────────────────────────────────────────────
//
// Each catalogue mirrors the Zod discriminated union in
// `org-dashboard-widget.schemas.ts`. A dropdown / stepper / checkbox
// here ALWAYS emits a value the schema accepts — that's the picker's
// load-bearing invariant. If the schema gains a new variant, this
// catalogue is the single edit alongside the renderer's switch arm.

type WidgetTypeKey =
    | 'KPI'
    | 'DONUT'
    | 'TREND'
    | 'TENANT_LIST'
    | 'DRILLDOWN_CTAS'
    | 'ORG_THREAT_LEVEL'
    | 'ORG_MATURITY'
    | 'ORG_INITIATIVES';

interface WidgetTypeOption {
    type: WidgetTypeKey;
    label: string;
    description: string;
    /** Default `(w, h)` for newly-created widgets of this type. */
    defaultSize: WidgetSize;
    /** Default chartType for the dropdown initial value. */
    defaultChartType: string;
}

const WIDGET_TYPES: ReadonlyArray<WidgetTypeOption> = [
    {
        type: 'KPI',
        label: 'KPI tile',
        description: 'Single number with label and optional sparkline.',
        defaultSize: { w: 3, h: 2 },
        defaultChartType: 'coverage',
    },
    {
        type: 'DONUT',
        label: 'Donut breakdown',
        description: 'Distribution across labelled segments (e.g. RAG).',
        defaultSize: { w: 4, h: 4 },
        defaultChartType: 'rag-distribution',
    },
    {
        type: 'TREND',
        label: 'Trend chart',
        description: 'Time-series area or bar chart over a window.',
        defaultSize: { w: 6, h: 3 },
        defaultChartType: 'risks-open',
    },
    {
        type: 'TENANT_LIST',
        label: 'Tenant coverage',
        description: 'Per-tenant coverage list with drill-down rows.',
        defaultSize: { w: 12, h: 6 },
        defaultChartType: 'coverage',
    },
    {
        type: 'DRILLDOWN_CTAS',
        label: 'Drill-down CTAs',
        description: 'Navigation cards into controls / risks / evidence.',
        defaultSize: { w: 12, h: 2 },
        defaultChartType: 'default',
    },
    // ─── Org-specific widgets (ported) ──────────────────────────────
    // Each locks a single chartType (banner / radar / list) per the Zod
    // discriminated union; the dispatcher renders the bespoke component.
    {
        type: 'ORG_THREAT_LEVEL',
        label: 'Threat level',
        description: 'Human-curated org-wide security posture banner.',
        defaultSize: { w: 6, h: 2 },
        defaultChartType: 'banner',
    },
    {
        type: 'ORG_MATURITY',
        label: 'Security maturity',
        description: 'Self-assessed maturity rating across the CSF domains.',
        defaultSize: { w: 6, h: 4 },
        defaultChartType: 'radar',
    },
    {
        type: 'ORG_INITIATIVES',
        label: 'Security initiatives',
        description: 'Top in-flight portfolio security programmes + progress.',
        defaultSize: { w: 6, h: 4 },
        defaultChartType: 'list',
    },
];

/**
 * The widget types the "Add widget" picker offers. Exported so a parity test
 * can assert it covers EVERY type in the schema's discriminated union — the
 * check that was missing when the three ORG_* widgets shipped wired into the
 * dispatcher + schema + presets but absent from the picker.
 */
export const WIDGET_PICKER_TYPE_KEYS: ReadonlyArray<string> = WIDGET_TYPES.map(
    (w) => w.type,
);

const CHART_TYPE_OPTIONS: Record<WidgetTypeKey, ReadonlyArray<{ value: string; label: string }>> = {
    KPI: [
        { value: 'coverage', label: 'Coverage' },
        { value: 'critical-risks', label: 'Critical risks' },
        { value: 'overdue-evidence', label: 'Overdue evidence' },
        { value: 'tenants', label: 'Tenants' },
    ],
    DONUT: [
        { value: 'rag-distribution', label: 'RAG distribution' },
    ],
    TREND: [
        { value: 'risks-open', label: 'Open risks' },
        { value: 'controls-coverage', label: 'Controls coverage' },
        { value: 'evidence-overdue', label: 'Overdue evidence' },
    ],
    TENANT_LIST: [
        { value: 'coverage', label: 'Coverage' },
    ],
    DRILLDOWN_CTAS: [
        { value: 'default', label: 'Default (controls / risks / evidence)' },
    ],
    // Org widgets each have one fixed visualization; the "Data source"
    // dropdown shows a single, self-describing option.
    ORG_THREAT_LEVEL: [
        { value: 'banner', label: 'Posture banner' },
    ],
    ORG_MATURITY: [
        { value: 'radar', label: 'Maturity radar' },
    ],
    ORG_INITIATIVES: [
        { value: 'list', label: 'Initiative list' },
    ],
};

function defaultConfigFor(
    type: WidgetTypeKey,
    chartType: string,
): Record<string, unknown> {
    switch (type) {
        case 'KPI':
            return { format: chartType === 'coverage' ? 'percent' : 'number' };
        case 'DONUT':
            return { showLegend: true };
        case 'TREND':
            return { days: 90 };
        case 'TENANT_LIST':
            return { sortBy: 'rag' };
        case 'DRILLDOWN_CTAS':
            return {};
        case 'ORG_THREAT_LEVEL':
            return { showHistory: false };
        case 'ORG_MATURITY':
            return { view: 'radar' };
        case 'ORG_INITIATIVES':
            return { topN: 5 };
    }
}

// ─── Component ──────────────────────────────────────────────────────

export interface WidgetPickerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * Caller's persistence callback. Resolves with the persisted
     * widget so the parent can append it to its grid state.
     */
    onSubmit: (
        input: CreateOrgDashboardWidgetInput,
    ) => Promise<OrgDashboardWidgetDto>;
    /**
     * Fired after `onSubmit` resolves successfully. The picker closes
     * itself; the parent can refresh local state from this hook.
     */
    onCreated?: (widget: OrgDashboardWidgetDto) => void;
    /**
     * Default top-left position for the new widget. The vertical
     * compactor will adjust based on existing rows; the picker just
     * provides a sane starting point. Default `(0, 0)`.
     */
    defaultPosition?: WidgetPosition;
}

export function WidgetPicker({
    open,
    onOpenChange,
    onSubmit,
    onCreated,
    defaultPosition = { x: 0, y: 0 },
}: WidgetPickerProps) {
    const [type, setType] = useState<WidgetTypeKey>('KPI');
    const [chartType, setChartType] = useState<string>('coverage');
    const [title, setTitle] = useState<string>('');
    const [days, setDays] = useState<number>(90);
    const [showLegend, setShowLegend] = useState<boolean>(true);
    const [kpiFormat, setKpiFormat] = useState<'number' | 'percent'>(
        'percent',
    );
    const [tenantSort, setTenantSort] = useState<'rag' | 'name' | 'coverage'>(
        'rag',
    );
    // Org-widget config state.
    const [orgShowHistory, setOrgShowHistory] = useState<boolean>(false);
    const [maturityView, setMaturityView] = useState<'radar' | 'trend'>('radar');
    const [maturityCoverageHint, setMaturityCoverageHint] = useState<boolean>(false);
    const [initiativesTopN, setInitiativesTopN] = useState<number>(5);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const meta = useMemo(
        () => WIDGET_TYPES.find((w) => w.type === type) ?? WIDGET_TYPES[0],
        [type],
    );
    const variants = CHART_TYPE_OPTIONS[type];

    // Reset form when modal toggles closed → open transitions are
    // discoverable. We don't want a half-filled prior session
    // resurfacing on the next open.
    function resetState() {
        setType('KPI');
        setChartType('coverage');
        setTitle('');
        setDays(90);
        setShowLegend(true);
        setKpiFormat('percent');
        setTenantSort('rag');
        setOrgShowHistory(false);
        setMaturityView('radar');
        setMaturityCoverageHint(false);
        setInitiativesTopN(5);
        setError(null);
        setSubmitting(false);
    }

    function handleTypeChange(next: string) {
        const nextType = next as WidgetTypeKey;
        setType(nextType);
        const m = WIDGET_TYPES.find((w) => w.type === nextType);
        if (m) setChartType(m.defaultChartType);
        setError(null);
    }

    function buildConfig(): Record<string, unknown> {
        const base = defaultConfigFor(type, chartType);
        switch (type) {
            case 'KPI':
                return { ...base, format: kpiFormat };
            case 'TREND':
                return { ...base, days };
            case 'DONUT':
                return { ...base, showLegend };
            case 'TENANT_LIST':
                return { ...base, sortBy: tenantSort };
            case 'DRILLDOWN_CTAS':
                return base;
            // Org configs are `.strict()` in the schema — emit ONLY the
            // allowed keys (no `base` spread that could leak a stray field).
            case 'ORG_THREAT_LEVEL':
                return { showHistory: orgShowHistory };
            case 'ORG_MATURITY':
                return { view: maturityView, showCoverageHint: maturityCoverageHint };
            case 'ORG_INITIATIVES':
                return { topN: initiativesTopN };
        }
    }

    async function handleSubmit() {
        if (submitting) return;
        setSubmitting(true);
        setError(null);
        try {
            const input = {
                type,
                chartType,
                config: buildConfig(),
                title: title.trim().length > 0 ? title.trim() : null,
                position: defaultPosition,
                size: meta.defaultSize,
                enabled: true,
            } as CreateOrgDashboardWidgetInput;
            const widget = await onSubmit(input);
            onCreated?.(widget);
            onOpenChange(false);
            resetState();
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : 'Could not create widget. Please retry.',
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal
            showModal={open}
            setShowModal={(next) => {
                // Modal's setShowModal accepts SetStateAction<boolean>;
                // resolve the optional updater form into a concrete
                // boolean before forwarding to the controlled callback.
                const resolved = typeof next === 'function' ? next(open) : next;
                onOpenChange(resolved);
                if (!resolved) resetState();
            }}
        >
            <Modal.Header
                title="Add widget"
                description="Pick a widget type and a data variant. You can rearrange and resize after it lands."
            />
            <Modal.Body>
                <div className="space-y-section">
                    {/* ── Step 1: type ── */}
                    <FormField
                        label="Widget type"
                        description="What kind of visualization do you want?"
                    >
                        <RadioGroup
                            value={type}
                            onValueChange={handleTypeChange}
                            data-testid="widget-picker-type"
                        >
                            {WIDGET_TYPES.map((opt) => (
                                <div
                                    key={opt.type}
                                    className="flex items-start gap-compact rounded-md border border-border-subtle p-3 hover:border-border-default"
                                >
                                    <RadioGroupItem
                                        value={opt.type}
                                        id={`widget-type-${opt.type}`}
                                        aria-label={opt.label}
                                    />
                                    <div className="min-w-0">
                                        <Label
                                            htmlFor={`widget-type-${opt.type}`}
                                            className="text-sm font-medium text-content-emphasis cursor-pointer"
                                        >
                                            {opt.label}
                                        </Label>
                                        <p className="text-xs text-content-muted mt-0.5">
                                            {opt.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </RadioGroup>
                    </FormField>

                    {/* ── Step 2: chart variant ── */}
                    <FormField
                        label="Data source"
                        description={
                            type === 'TREND'
                                ? 'Which metric should the chart track?'
                                : 'Which slice of org data should this widget show?'
                        }
                    >
                        <select
                            value={chartType}
                            onChange={(e) => setChartType(e.target.value)}
                            data-testid="widget-picker-chart-type"
                            className="block w-full rounded-md border border-border-default bg-bg-default px-3 py-2 text-sm text-content-emphasis focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                            {variants.map((v) => (
                                <option key={v.value} value={v.value}>
                                    {v.label}
                                </option>
                            ))}
                        </select>
                    </FormField>

                    {/* ── Step 3: per-type config ── */}
                    {type === 'KPI' && (
                        <FormField
                            label="Format"
                            description="How the headline number is rendered."
                        >
                            <RadioGroup
                                value={kpiFormat}
                                onValueChange={(v) =>
                                    setKpiFormat(v as 'number' | 'percent')
                                }
                                data-testid="widget-picker-kpi-format"
                                className="flex gap-default"
                            >
                                {[
                                    { value: 'number', label: 'Number' },
                                    { value: 'percent', label: 'Percent' },
                                ].map((opt) => (
                                    <div
                                        key={opt.value}
                                        className="flex items-center gap-tight"
                                    >
                                        <RadioGroupItem
                                            value={opt.value}
                                            id={`kpi-format-${opt.value}`}
                                            aria-label={opt.label}
                                        />
                                        <Label
                                            htmlFor={`kpi-format-${opt.value}`}
                                            className="text-sm cursor-pointer"
                                        >
                                            {opt.label}
                                        </Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </FormField>
                    )}

                    {type === 'TREND' && (
                        <FormField
                            label="Window (days)"
                            description="History length for the trend chart. Min 7, max 365."
                        >
                            <input
                                type="number"
                                min={7}
                                max={365}
                                step={1}
                                value={days}
                                onChange={(e) => {
                                    const next = Number.parseInt(
                                        e.target.value,
                                        10,
                                    );
                                    if (Number.isFinite(next)) setDays(next);
                                }}
                                data-testid="widget-picker-trend-days"
                                className="block w-full rounded-md border border-border-default bg-bg-default px-3 py-2 text-sm text-content-emphasis focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </FormField>
                    )}

                    {type === 'DONUT' && (
                        <FormField label="Options">
                            <label className="flex items-center gap-tight text-sm text-content-emphasis">
                                <input
                                    type="checkbox"
                                    checked={showLegend}
                                    onChange={(e) =>
                                        setShowLegend(e.target.checked)
                                    }
                                    data-testid="widget-picker-donut-legend"
                                    className="size-4 rounded border-border-default focus:ring-ring"
                                />
                                Show legend below the chart
                            </label>
                        </FormField>
                    )}

                    {type === 'TENANT_LIST' && (
                        <FormField
                            label="Sort by"
                            description="How tenants are ordered in the list."
                        >
                            <select
                                value={tenantSort}
                                onChange={(e) =>
                                    setTenantSort(
                                        e.target.value as
                                            | 'rag'
                                            | 'name'
                                            | 'coverage',
                                    )
                                }
                                data-testid="widget-picker-tenant-sort"
                                className="block w-full rounded-md border border-border-default bg-bg-default px-3 py-2 text-sm text-content-emphasis focus:outline-none focus:ring-2 focus:ring-ring"
                            >
                                <option value="rag">RAG (worst first)</option>
                                <option value="name">Name (alphabetical)</option>
                                <option value="coverage">Coverage</option>
                            </select>
                        </FormField>
                    )}

                    {type === 'ORG_THREAT_LEVEL' && (
                        <FormField label="Options">
                            <label className="flex items-center gap-tight text-sm text-content-emphasis">
                                <input
                                    type="checkbox"
                                    checked={orgShowHistory}
                                    onChange={(e) => setOrgShowHistory(e.target.checked)}
                                    data-testid="widget-picker-threat-history"
                                    className="size-4 rounded border-border-default focus:ring-ring"
                                />
                                Show the posture-history timeline
                            </label>
                        </FormField>
                    )}

                    {type === 'ORG_MATURITY' && (
                        <>
                            <FormField
                                label="Default view"
                                description="Radar (CSF domains) or maturity-over-time trend."
                            >
                                <select
                                    value={maturityView}
                                    onChange={(e) =>
                                        setMaturityView(e.target.value as 'radar' | 'trend')
                                    }
                                    data-testid="widget-picker-maturity-view"
                                    className="block w-full rounded-md border border-border-default bg-bg-default px-3 py-2 text-sm text-content-emphasis focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    <option value="radar">Radar</option>
                                    <option value="trend">Trend</option>
                                </select>
                            </FormField>
                            <FormField label="Options">
                                <label className="flex items-center gap-tight text-sm text-content-emphasis">
                                    <input
                                        type="checkbox"
                                        checked={maturityCoverageHint}
                                        onChange={(e) => setMaturityCoverageHint(e.target.checked)}
                                        data-testid="widget-picker-maturity-coverage-hint"
                                        className="size-4 rounded border-border-default focus:ring-ring"
                                    />
                                    Show the derived-coverage hint
                                </label>
                            </FormField>
                        </>
                    )}

                    {type === 'ORG_INITIATIVES' && (
                        <FormField
                            label="How many to show"
                            description="Top in-flight initiatives to surface. Min 1, max 20."
                        >
                            <input
                                type="number"
                                min={1}
                                max={20}
                                step={1}
                                value={initiativesTopN}
                                onChange={(e) => {
                                    const next = Number.parseInt(e.target.value, 10);
                                    if (Number.isFinite(next)) {
                                        setInitiativesTopN(Math.min(20, Math.max(1, next)));
                                    }
                                }}
                                data-testid="widget-picker-initiatives-topn"
                                className="block w-full rounded-md border border-border-default bg-bg-default px-3 py-2 text-sm text-content-emphasis focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                        </FormField>
                    )}

                    {/* ── Step 4: title (optional) ── */}
                    <FormField
                        label="Title"
                        description="Leave blank to use the default title for this variant."
                    >
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={120}
                            placeholder={meta.label}
                            data-testid="widget-picker-title"
                            className="block w-full rounded-md border border-border-default bg-bg-default px-3 py-2 text-sm text-content-emphasis placeholder:text-content-subtle focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                    </FormField>

                    {error && (
                        <div
                            role="alert"
                            data-testid="widget-picker-error"
                            className="rounded-md border border-border-error bg-bg-error/10 px-3 py-2 text-sm text-content-error"
                        >
                            {error}
                        </div>
                    )}
                </div>
            </Modal.Body>
            <Modal.Actions>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    data-testid="widget-picker-cancel"
                    disabled={submitting}
                >
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                        void handleSubmit();
                    }}
                    data-testid="widget-picker-submit"
                    disabled={submitting}
                >
                    {submitting ? 'Adding…' : 'Add widget'}
                </Button>
            </Modal.Actions>
        </Modal>
    );
}
