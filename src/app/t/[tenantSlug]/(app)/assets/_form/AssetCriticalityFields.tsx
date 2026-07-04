'use client';

/**
 * Shared "Asset Criticality" box — Confidentiality / Integrity /
 * Availability sliders plus a tone-coloured criticality score (the
 * high-water-mark of the three). Mirrors the risk modals'
 * RiskEvaluationFields so the create + edit asset modals score the same
 * way. `idPrefix` keeps element ids stable ('asset' for create,
 * 'asset-edit' for edit).
 */
import { useTranslations } from 'next-intl';
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
    const t = useTranslations('assets');
    const crit = getAssetCriticality(confidentiality, integrity, availability);
    return (
        <div
            className={`inline-flex flex-col items-center rounded-md border px-4 py-3 text-center ${ASSET_CRITICALITY_TONE_CLASSES[crit.tone]}`}
            data-testid="asset-criticality-score"
        >
            <p className="text-xs uppercase tracking-wider opacity-75">
                {t('crit.badge')}
            </p>
            <p className="text-xl font-bold">{crit.score}</p>
            <p className="text-xs font-medium">{crit.label}</p>
        </div>
    );
}

type DimKey = 'confidentiality' | 'integrity' | 'availability';

// Label + help are resolved from the catalog at render (label reuses the
// top-level `assets.<key>` keys; help lives under `assets.crit.<key>Help`).
const DIMENSION_KEYS: DimKey[] = ['confidentiality', 'integrity', 'availability'];

export interface AssetCriticalityFieldsProps {
    confidentiality: number;
    integrity: number;
    availability: number;
    onChange: (key: DimKey, value: number) => void;
    idPrefix?: string;
}

export function AssetCriticalityFields({
    confidentiality,
    integrity,
    availability,
    onChange,
    idPrefix = 'asset',
}: AssetCriticalityFieldsProps) {
    const t = useTranslations('assets');
    const values = { confidentiality, integrity, availability };
    const crit = getAssetCriticality(confidentiality, integrity, availability);
    return (
        <div className="space-y-default rounded-lg border border-border-subtle bg-bg-subtle p-4">
            <p className="text-sm font-medium text-content-emphasis">
                {t('crit.heading')}
            </p>
            <div className="grid grid-cols-1 gap-default sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                {DIMENSION_KEYS.map((dimKey) => {
                    const id = `${idPrefix}-${dimKey}`;
                    const label = t(dimKey);
                    return (
                        <div key={dimKey}>
                            <div className="mb-1 flex items-center gap-1.5">
                                <label
                                    className="text-sm text-content-default"
                                    htmlFor={id}
                                >
                                    {label} ·{' '}
                                    <span className="font-semibold text-content-emphasis">
                                        {values[dimKey]}
                                    </span>
                                </label>
                                <InfoTooltip
                                    aria-label={`${t('crit.aboutPrefix')}${label.toLowerCase()}`}
                                    iconClassName="h-3.5 w-3.5"
                                    content={t(`crit.${dimKey}Help`)}
                                />
                            </div>
                            <input
                                id={id}
                                type="range"
                                min={1}
                                max={5}
                                value={values[dimKey]}
                                onChange={(e) =>
                                    onChange(dimKey, Number(e.target.value))
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
                        {t('crit.badge')}
                    </p>
                    <p className="text-xl font-bold">{crit.score}</p>
                    <p className="text-[11px] font-medium">{crit.label}</p>
                </div>
            </div>
        </div>
    );
}
