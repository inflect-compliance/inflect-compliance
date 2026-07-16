/**
 * PR-L — loss-event calibration back-test.
 *
 * Closes the calibration edge: the Monte Carlo deliberately never reads
 * LossEvent actuals (actuals must not leak into the forecast), but nothing
 * ever scored the forecast AGAINST the actuals. This pure helper joins the
 * per-risk forecast (the sim's P50 / P90 for each risk) with the per-risk
 * recorded actuals and reports how often reality stayed inside the forecast
 * band — a coverage / hit-rate calibration score — plus a per-risk verdict
 * that drives a "re-estimate this risk's FAIR inputs" nudge when actuals
 * diverge from the forecast.
 *
 * Deliberately does NOT mutate any FAIR input — it surfaces the divergence
 * and lets the owner decide. (See loss-event.ts header.)
 */

export interface CalibrationForecast {
    riskId: string;
    title: string;
    /** Forecast median annual loss for this risk. */
    p50: number;
    /** Forecast 90th-percentile ("bad year") annual loss for this risk. */
    p90: number;
}

export interface CalibrationActual {
    riskId: string;
    /** Total recorded actual loss for this risk over the observed window. */
    total: number;
}

export type CalibrationStatus =
    /** Actual exceeded P90 — the model UNDER-forecast; re-estimate upward. */
    | 'under_forecast'
    /** Actual below P50 — the model OVER-forecast; re-estimate downward. */
    | 'over_forecast'
    /** Actual within [P50, P90] — the forecast held. */
    | 'within_band';

export interface CalibrationRow {
    riskId: string;
    title: string;
    p50: number;
    p90: number;
    actual: number;
    status: CalibrationStatus;
    /** Signed % the actual sits above P90 (>0) or below P50 (<0); 0 within band. */
    divergencePct: number;
}

export interface CalibrationSummary {
    rows: CalibrationRow[];
    /** Risks with BOTH a forecast and recorded actuals (the scored set). */
    scored: number;
    withinBand: number;
    underForecast: number;
    overForecast: number;
    /**
     * Coverage = fraction of scored risks whose actual stayed at/under P90.
     * A well-calibrated model sits near 0.9 (P90 is exceeded ~10% of the
     * time). Null when nothing is scorable.
     */
    coverageWithinP90: number | null;
    /**
     * 0–1 calibration quality: how close coverage is to the ideal 0.9.
     * `1 - |coverage - 0.9| / 0.9`, clamped. Null when nothing is scorable.
     */
    calibrationScore: number | null;
}

function pctFinite(n: number): number {
    return Number.isFinite(n) ? n : 0;
}

export function computeLossCalibration(
    forecasts: ReadonlyArray<CalibrationForecast>,
    actuals: ReadonlyArray<CalibrationActual>,
): CalibrationSummary {
    const actualByRisk = new Map<string, number>();
    for (const a of actuals) {
        if (a.riskId) actualByRisk.set(a.riskId, (actualByRisk.get(a.riskId) ?? 0) + a.total);
    }

    const rows: CalibrationRow[] = [];
    for (const f of forecasts) {
        const actual = actualByRisk.get(f.riskId);
        if (actual == null) continue; // only score risks that have BOTH.
        let status: CalibrationStatus;
        let divergencePct: number;
        if (actual > f.p90) {
            status = 'under_forecast';
            divergencePct = f.p90 > 0 ? pctFinite(((actual - f.p90) / f.p90) * 100) : 100;
        } else if (actual < f.p50) {
            status = 'over_forecast';
            divergencePct = f.p50 > 0 ? -pctFinite(((f.p50 - actual) / f.p50) * 100) : 0;
        } else {
            status = 'within_band';
            divergencePct = 0;
        }
        rows.push({ riskId: f.riskId, title: f.title, p50: f.p50, p90: f.p90, actual, status, divergencePct });
    }

    // Most-diverged first so the biggest calibration misses lead.
    rows.sort((a, b) => Math.abs(b.divergencePct) - Math.abs(a.divergencePct));

    const scored = rows.length;
    const withinP90 = rows.filter((r) => r.actual <= r.p90).length;
    const coverage = scored > 0 ? withinP90 / scored : null;
    const calibrationScore = coverage == null ? null : Math.max(0, 1 - Math.abs(coverage - 0.9) / 0.9);

    return {
        rows,
        scored,
        withinBand: rows.filter((r) => r.status === 'within_band').length,
        underForecast: rows.filter((r) => r.status === 'under_forecast').length,
        overForecast: rows.filter((r) => r.status === 'over_forecast').length,
        coverageWithinP90: coverage,
        calibrationScore,
    };
}
