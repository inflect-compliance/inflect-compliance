/**
 * Asset-criticality scoring — derives a single criticality level from the
 * Confidentiality / Integrity / Availability triad using the standard
 * "high-water-mark" rule (the most sensitive dimension drives the asset's
 * overall criticality). Shared by the create/edit modals (slider box) and
 * the detail Overview (single score), so the colour + label stay in sync.
 */
export type AssetCriticalityTone = 'success' | 'warning' | 'danger' | 'critical';

export function getAssetCriticality(
    confidentiality: number,
    integrity: number,
    availability: number,
): { score: number; label: string; tone: AssetCriticalityTone } {
    const score = Math.max(confidentiality, integrity, availability);
    if (score >= 5) return { score, label: 'Critical', tone: 'critical' };
    if (score >= 4) return { score, label: 'High', tone: 'danger' };
    if (score >= 3) return { score, label: 'Medium', tone: 'warning' };
    return { score, label: 'Low', tone: 'success' };
}

export const ASSET_CRITICALITY_TONE_CLASSES: Record<AssetCriticalityTone, string> = {
    success: 'border-border-success bg-bg-success text-content-success',
    warning: 'border-border-warning bg-bg-warning text-content-warning',
    danger: 'border-border-warning bg-bg-warning text-content-warning',
    critical: 'border-border-error bg-bg-error text-content-error',
};
