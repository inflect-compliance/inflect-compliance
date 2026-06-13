'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { ProgressBar, type ProgressBarVariant } from '@/components/ui/progress-bar';
import { ProgressCircle } from '@/components/ui/progress-circle';

interface DashboardMetrics {
    periodDays: number;
    totalPlans: number;
    totalRuns: number;
    completedRuns: number;
    passRuns: number;
    failRuns: number;
    inconclusiveRuns: number;
    completionRate: number;
    passRate: number;
    failRate: number;
    evidenceRate: number;
    overduePlans: number;
    repeatedFailures: Array<{ controlId: string; controlName: string; controlCode: string | null; failCount: number }>;
    runsWithEvidence: number;
}

interface FrameworkReadiness {
    frameworkKey: string;
    frameworkName: string;
    totalMappedControls: number;
    withTestPlan: number;
    testPlanCoverage: number;
    withRecentRun: number;
    testRunCoverage: number;
    passRate: number;
    recentRuns: number;
    recentPasses: number;
}

// Legacy color prop → Epic 59 ProgressBar variant. Kept as a local
// helper so the dozens of call sites below stay short and readable.
function toProgressVariant(color: string): ProgressBarVariant {
    if (color === 'green') return 'success';
    if (color === 'red') return 'error';
    if (color === 'amber') return 'warning';
    return 'brand';
}

export default function TestDashboardPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();

    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [readiness, setReadiness] = useState<FrameworkReadiness[]>([]);
    const [period, setPeriod] = useState(30);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [mRes, rRes] = await Promise.all([
                fetch(apiUrl(`/tests/dashboard?period=${period}`)),
                fetch(apiUrl('/tests/readiness')),
            ]);
            if (mRes.ok) setMetrics(await mRes.json());
            if (rRes.ok) setReadiness(await rRes.json());
        } finally {
            setLoading(false);
        }
    }, [apiUrl, period]);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading || !metrics) return <div className="p-12 text-center text-content-subtle animate-pulse">Loading dashboard...</div>;

    return (
        <div className="space-y-8 animate-fadeIn">
            <BackAffordance />
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold" id="dashboard-title">Test Dashboard</h1>
                    <p className="text-sm text-content-muted mt-1">Testing health and framework readiness</p>
                </div>
                <div className="flex gap-3">
                    <Link href={tenantHref('/tests/due')} className="btn btn-ghost btn-sm">Due Queue</Link>
                    <div className="flex gap-1 bg-bg-default/50 rounded-lg p-1">
                        {[30, 90].map(d => (
                            <button
                                key={d}
                                onClick={() => setPeriod(d)}
                                className={`px-3 py-1 rounded text-xs font-medium transition ${period === d ? 'bg-[var(--brand-default)] text-content-emphasis' : 'text-content-muted hover:text-content-emphasis'}`}
                                id={`period-${d}-btn`}
                            >
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <MetricCard label="Completion Rate" value={`${metrics.completionRate}%`} sub={`${metrics.completedRuns}/${metrics.totalRuns} runs`} color={metrics.completionRate >= 80 ? 'green' : metrics.completionRate >= 50 ? 'amber' : 'red'} />
                <MetricCard label="Pass Rate" value={`${metrics.passRate}%`} sub={`${metrics.passRuns} passed`} color={metrics.passRate >= 80 ? 'green' : metrics.passRate >= 50 ? 'amber' : 'red'} />
                <MetricCard label="Fail Rate" value={`${metrics.failRate}%`} sub={`${metrics.failRuns} failed`} color={metrics.failRate <= 10 ? 'green' : metrics.failRate <= 30 ? 'amber' : 'red'} />
                <MetricCard label="Evidence Rate" value={`${metrics.evidenceRate}%`} sub={`${metrics.runsWithEvidence} with evidence`} color={metrics.evidenceRate >= 80 ? 'green' : metrics.evidenceRate >= 50 ? 'amber' : 'red'} />
                <MetricCard label="Overdue Plans" value={String(metrics.overduePlans)} sub="need attention" color={metrics.overduePlans === 0 ? 'green' : 'red'} />
                <MetricCard label="Active Plans" value={String(metrics.totalPlans)} sub="total" color="brand" />
            </div>

            {/* Result Distribution */}
            <div className="grid md:grid-cols-2 gap-6">
                <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold mb-4">Result Distribution ({period}d)</h2>
                    {metrics.completedRuns === 0 ? (
                        <p className="text-content-subtle text-sm">No completed runs in this period</p>
                    ) : (
                        <div className="flex gap-6 items-center">
                            {/* Headline gauge — overall pass rate at a glance */}
                            <ProgressCircle
                                progress={metrics.passRate / 100}
                                label={`${metrics.passRate}%`}
                                variant={metrics.passRate >= 80 ? 'success' : metrics.passRate >= 50 ? 'warning' : 'error'}
                                size="md"
                                aria-label="Overall pass rate"
                            />
                            <div className="flex-1 space-y-3">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-green-400">Pass</span>
                                    <span className="text-content-muted">{metrics.passRuns} ({metrics.passRate}%)</span>
                                </div>
                                <ProgressBar value={metrics.passRate} variant="success" aria-label="Pass rate" />
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-red-400">Fail</span>
                                    <span className="text-content-muted">{metrics.failRuns} ({metrics.failRate}%)</span>
                                </div>
                                <ProgressBar value={metrics.failRate} variant="error" aria-label="Fail rate" />
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-amber-400">Inconclusive</span>
                                    <span className="text-content-muted">{metrics.inconclusiveRuns}</span>
                                </div>
                                <ProgressBar
                                    value={metrics.completedRuns > 0 ? (metrics.inconclusiveRuns / metrics.completedRuns) * 100 : 0}
                                    variant="warning"
                                    aria-label="Inconclusive rate"
                                />
                            </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold mb-4">Repeated Failures</h2>
                    {metrics.repeatedFailures.length === 0 ? (
                        <p className="text-content-subtle text-sm">No controls with repeated failures</p>
                    ) : (
                        <div className="space-y-2">
                            {metrics.repeatedFailures.map(f => (
                                <Link
                                    key={f.controlId}
                                    href={tenantHref(`/controls/${f.controlId}`)}
                                    className="flex justify-between items-center p-2 rounded hover:bg-bg-default/30 transition"
                                >
                                    <div>
                                        <span className="text-content-emphasis text-sm font-medium">{f.controlCode || f.controlName}</span>
                                        {f.controlCode && <span className="text-content-muted text-xs ml-2">{f.controlName}</span>}
                                    </div>
                                    <span className="badge badge-xs badge-danger">{f.failCount} failures</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Framework Test Readiness */}
            {readiness.length > 0 && (
                <div className="glass-card p-6">
                    <h2 className="text-lg font-semibold mb-4" id="framework-readiness-title">Framework Test Coverage</h2>
                    <p className="text-sm text-content-muted mb-4">
                        How well your mapped controls are covered by active test plans and recent test runs
                    </p>
                    <div className="space-y-6">
                        {readiness.map(fw => (
                            <div key={fw.frameworkKey} className="border border-border-default/30 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-semibold text-content-emphasis">{fw.frameworkName}</h3>
                                    <span className="text-xs text-content-muted">{fw.totalMappedControls} mapped controls</span>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-content-muted">Test Plan Coverage</span>
                                            <span className="text-content-emphasis">{fw.testPlanCoverage}%</span>
                                        </div>
                                        <ProgressBar
                                            value={fw.testPlanCoverage}
                                            variant={toProgressVariant(fw.testPlanCoverage >= 80 ? 'green' : fw.testPlanCoverage >= 50 ? 'amber' : 'red')}
                                            aria-label={`${fw.frameworkName} test plan coverage`}
                                        />
                                        <p className="text-xs text-content-subtle mt-1">{fw.withTestPlan}/{fw.totalMappedControls} with plans</p>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-content-muted">Recent Run Coverage (90d)</span>
                                            <span className="text-content-emphasis">{fw.testRunCoverage}%</span>
                                        </div>
                                        <ProgressBar
                                            value={fw.testRunCoverage}
                                            variant={toProgressVariant(fw.testRunCoverage >= 80 ? 'green' : fw.testRunCoverage >= 50 ? 'amber' : 'red')}
                                            aria-label={`${fw.frameworkName} recent run coverage`}
                                        />
                                        <p className="text-xs text-content-subtle mt-1">{fw.withRecentRun}/{fw.totalMappedControls} tested</p>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-content-muted">Pass Rate</span>
                                            <span className="text-content-emphasis">{fw.passRate}%</span>
                                        </div>
                                        <ProgressBar
                                            value={fw.passRate}
                                            variant={toProgressVariant(fw.passRate >= 80 ? 'green' : fw.passRate >= 50 ? 'amber' : 'red')}
                                            aria-label={`${fw.frameworkName} pass rate`}
                                        />
                                        <p className="text-xs text-content-subtle mt-1">{fw.recentPasses}/{fw.recentRuns} passed</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
    const colorMap: Record<string, string> = {
        green: 'text-green-400',
        red: 'text-red-400',
        amber: 'text-amber-400',
        brand: 'text-[var(--brand-default)]',
    };
    return (
        <div className="glass-card p-4 text-center">
            <div className={`text-2xl font-bold ${colorMap[color] || 'text-content-emphasis'}`}>{value}</div>
            <div className="text-xs text-content-muted mt-1 font-medium">{label}</div>
            <div className="text-xs text-content-subtle mt-0.5">{sub}</div>
        </div>
    );
}
