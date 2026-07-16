'use client';

/**
 * Shared client hook for the tenant's effective `RiskMatrixConfig`.
 *
 * `RiskAssessmentPanel` fetched `/risk-matrix-config` inline; the
 * create/edit scoring box, the import scale-clamp, and the AI-draft
 * badge all need the same config so the whole product scores in the
 * tenant's own matrix. This hook centralises that read (SWR-cached, so
 * the several consumers share one request) and always resolves to a
 * fully-populated shape — it falls back to `DEFAULT_RISK_MATRIX_CONFIG`
 * while loading or on error, so callers never branch on `undefined`.
 */

import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { DEFAULT_RISK_MATRIX_CONFIG } from '@/lib/risk-matrix/defaults';
import type { RiskMatrixConfigShape } from '@/lib/risk-matrix/types';

export interface UseRiskMatrixConfigResult {
    config: RiskMatrixConfigShape;
    /** True until the tenant's real config has resolved (default is served meanwhile). */
    isLoading: boolean;
}

/**
 * @param enabled gate the fetch (e.g. only while a modal is open). When
 *   false the hook still returns the default config so the UI renders.
 */
export function useRiskMatrixConfig(enabled: boolean = true): UseRiskMatrixConfigResult {
    const { data, isLoading } = useTenantSWR<RiskMatrixConfigShape>(
        enabled ? '/risk-matrix-config' : null,
    );
    // Guard the shape: only a well-formed config object wins; anything
    // else (loading, error, an empty test stub) falls back to the default
    // so callers never read `undefined` off `config.likelihoodLevels`.
    const resolved =
        data && typeof data === 'object' && typeof (data as RiskMatrixConfigShape).likelihoodLevels === 'number'
            ? (data as RiskMatrixConfigShape)
            : DEFAULT_RISK_MATRIX_CONFIG;
    return {
        config: resolved,
        isLoading: enabled && isLoading && resolved === DEFAULT_RISK_MATRIX_CONFIG,
    };
}
