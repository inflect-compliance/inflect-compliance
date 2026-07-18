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
    /**
     * Total recorded actual loss for this risk over the observed window
     * (all-time cumulative). `computeLossCalibration` annualizes this
     * against the observed-year window before comparing it to the
     * per-YEAR forecast band — see `observedYears`.
     */
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
    /**
     * ANNUALIZED actual loss — the risk's cumulative recorded loss
     * divided by the observed-year window — so it is comparable to the
     * per-year forecast band `[p50, p90]`.
     */
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
     * Risks skipped because their forecast band was degenerate
     * (`p90 <= p50` — a mean-only / "no tail data" simulation, which
     * would otherwise flag every actual). Excluded from `scored`.
     */
    insufficientDistribution: number;
    /**
     * Coverage = fraction of scored risks whose ANNUALIZED actual stayed
     * at/under P90. A well-calibrated model sits near 0.9 (the annual
     * P90 is exceeded ~10% of the time). Null when nothing is scorable.
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

/**
 * @param observedYears The number of years spanned by the recorded
 *   actuals (the observed loss window, e.g. `maxYear - minYear + 1`).
 *   Cumulative per-risk actuals are divided by this to produce an
 *   ANNUAL actual comparable to the per-year forecast band. Clamped to
 *   `>= 1`; defaults to 1 (i.e. treat the total as a single year) for
 *   back-compat with callers that pre-annualized.
 */
export function computeLossCalibration(
    forecasts: ReadonlyArray<CalibrationForecast>,
    actuals: ReadonlyArray<CalibrationActual>,
    observedYears = 1,
): CalibrationSummary {
    const years = Math.max(1, Math.floor(observedYears));
    const actualByRisk = new Map<string, number>();
    for (const a of actuals) {
        if (a.riskId) actualByRisk.set(a.riskId, (actualByRisk.get(a.riskId) ?? 0) + a.total);
    }

    const rows: CalibrationRow[] = [];
    let insufficientDistribution = 0;
    for (const f of forecasts) {
        const cumulative = actualByRisk.get(f.riskId);
        if (cumulative == null) continue; // only score risks that have BOTH.
        // A degenerate band (mean-only sim: p90 <= p50) carries no tail
        // information — comparing an actual against a zero-width band
        // would flag every risk. Exclude it as "insufficient distribution".
        if (f.p90 <= f.p50) {
            insufficientDistribution += 1;
            continue;
        }
        // Annualize the cumulative actual so it is comparable to the
        // per-YEAR forecast band. A risk that lost $1000 over a 5-year
        // window scores against a $200/yr annual actual, not $1000.
        const actual = cumulative / years;
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
        insufficientDistribution,
        coverageWithinP90: coverage,
        calibrationScore,
    };
}
