'use client';

/**
 * Shared "Asset Criticality" box — Confidentiality / Integrity /
 * Availability sliders plus a tone-coloured criticality score (the
 * high-water-mark of the three). Mirrors the risk modals'
 * RiskEvaluationFields so the create + edit asset modals score the same
 * way. `idPrefix` keeps element ids stable ('asset' for create,
 * 'asset-edit' for edit).
 */
import { InfoTooltip } from '@/components/ui/tooltip';
import {
    getAssetCriticality,
    ASSET_CRITICALITY_TONE_CLASSES,
} from './asset-criticality';

/**
 * Read-only criticality score chip — the single value shown on the asset
 * detail Overview (the C/I/A breakdown is collapsed into this).
 */
export function AssetCriticalityBadge({
    confidentiality,
    integrity,
    availability,
}: {
    confidentiality: number;
    integrity: number;
    availability: number;
}) {
    const crit = getAssetCriticality(confidentiality, integrity, availability);
    return (
        <div
            className={`inline-flex flex-col items-center rounded-md border px-4 py-3 text-center ${ASSET_CRITICALITY_TONE_CLASSES[crit.tone]}`}
            data-testid="asset-criticality-score"
        >
            <p className="text-xs uppercase tracking-wider opacity-75">
                Criticality
            </p>
            <p className="text-xl font-bold">{crit.score}</p>
            <p className="text-xs font-medium">{crit.label}</p>
        </div>
    );
}

interface Dim {
    key: 'confidentiality' | 'integrity' | 'availability';
    label: string;
    help: string;
}

const DIMENSIONS: Dim[] = [
    {
        key: 'confidentiality',
        label: 'Confidentiality',
        help: 'Impact of unauthorised disclosure. 1 = public, 5 = highly sensitive / regulated.',
    },
    {
        key: 'integrity',
        label: 'Integrity',
        help: 'Impact of unauthorised modification or loss of accuracy. 1 = trivial, 5 = safety/financial-critical.',
    },
    {
        key: 'availability',
        label: 'Availability',
        help: 'Impact of an outage. 1 = tolerable, 5 = business-critical / no downtime acceptable.',
    },
];

export interface AssetCriticalityFieldsProps {
    confidentiality: number;
    integrity: number;
    availability: number;
    onChange: (key: Dim['key'], value: number) => void;
    idPrefix?: string;
}

export function AssetCriticalityFields({
    confidentiality,
    integrity,
    availability,
    onChange,
    idPrefix = 'asset',
}: AssetCriticalityFieldsProps) {
    const values = { confidentiality, integrity, availability };
    const crit = getAssetCriticality(confidentiality, integrity, availability);
    return (
        <div className="space-y-default rounded-lg border border-border-subtle bg-bg-subtle p-4">
            <p className="text-sm font-medium text-content-emphasis">
                Asset Criticality
            </p>
            <div className="grid grid-cols-1 gap-default sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                {DIMENSIONS.map((dim) => {
                    const id = `${idPrefix}-${dim.key}`;
                    return (
                        <div key={dim.key}>
                            <div className="mb-1 flex items-center gap-1.5">
                                <label
                                    className="text-sm text-content-default"
                                    htmlFor={id}
                                >
                                    {dim.label} ·{' '}
                                    <span className="font-semibold text-content-emphasis">
                                        {values[dim.key]}
                                    </span>
                                </label>
                                <InfoTooltip
                                    aria-label={`About ${dim.label.toLowerCase()}`}
                                    iconClassName="h-3.5 w-3.5"
                                    content={dim.help}
                                />
                            </div>
                            <input
                                id={id}
                                type="range"
                                min={1}
                                max={5}
                                value={values[dim.key]}
                                onChange={(e) =>
                                    onChange(dim.key, Number(e.target.value))
                                }
                                className="w-full accent-brand-emphasis"
                            />
                        </div>
                    );
                })}
                <div
                    className={`shrink-0 rounded-md border px-3 py-2 text-center ${ASSET_CRITICALITY_TONE_CLASSES[crit.tone]}`}
                    data-testid={`${idPrefix}-criticality-score`}
                >
                    <p className="text-xs uppercase tracking-wider opacity-75">
                        Criticality
                    </p>
                    <p className="text-xl font-bold">{crit.score}</p>
                    <p className="text-[11px] font-medium">{crit.label}</p>
                </div>
            </div>
        </div>
    );
}
