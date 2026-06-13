/**
 * Audit Readiness Overview — Server Component.
 *
 * Renders one card per audit cycle with the cycle's readiness score.
 *
 * Why this page is a Server Component:
 *
 *   • The previous client-side implementation fetched the cycles
 *     list, then fan-out fetched per-cycle readiness scores. With N
 *     cycles, that was 1 + N HTTP round-trips on the WAN — bound by
 *     network latency × N, not by DB latency.
 *
 *   • There's no real interactivity on the page beyond Links to
 *     other pages. Score rings are static SVGs derived from the data.
 *     So there's no reason for the data fetch to live in `'use client'`.
 *
 *   • The orchestrator `getReadinessOverview()` runs the per-cycle
 *     fan-out server-side via Promise.allSettled, where it's bound
 *     by LAN-fast DB latency. One client→server round-trip total.
 *
 * Failure-mode notes (see overview.ts docblock):
 *   • A cycle whose readiness computation fails is rendered without
 *     a score (the cycle id won't appear in `scoresByCycleId`). The
 *     UI matches the previous client-side behaviour.
 */
import Link from 'next/link';
import {
    ShieldCheck,
    Flag,
    ClipboardList,
    BarChart3,
    type LucideIcon,
} from 'lucide-react';
import { getTenantCtx } from '@/app-layer/context';
import { getReadinessOverview } from '@/app-layer/usecases/audit-readiness';
import type { ReadinessResult } from '@/app-layer/usecases/audit-readiness-scoring';
import { BackAffordance } from '@/components/nav/BackAffordance';

export const dynamic = 'force-dynamic';

const FW_META: Record<string, { icon: LucideIcon; label: string; color: string }> = {
    ISO27001: { icon: ShieldCheck, label: 'ISO/IEC 27001:2022', color: 'from-indigo-500 to-purple-600' },
    NIS2: { icon: Flag, label: 'NIS2 Directive', color: 'from-blue-500 to-cyan-600' },
};
const FW_DEFAULT: { icon: LucideIcon; label: string; color: string } = {
    icon: ClipboardList,
    label: '',
    color: 'from-gray-500 to-gray-600',
};

function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
    const r = (size - 8) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (score / 100) * c;
    const color = score >= 80 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444';
    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth="6"
                strokeDasharray={c}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="transition-all duration-1000"
            />
            <text
                x={size / 2}
                y={size / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="transform rotate-90 origin-center"
                fill="white"
                fontSize={size / 3.5}
                fontWeight="bold"
            >
                {score}
            </text>
        </svg>
    );
}

interface CycleListItem {
    id: string;
    name: string;
    frameworkKey: string;
}

export default async function ReadinessOverviewPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    const { cycles, scoresByCycleId } = await getReadinessOverview(ctx);

    return (
        <div className="space-y-6 animate-fadeIn">
            <BackAffordance />
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold" id="readiness-heading">
                        Audit Readiness
                    </h1>
                    <p className="text-content-muted text-sm">
                        Framework readiness scores across all audit cycles
                    </p>
                </div>
                <Link href={`/t/${tenantSlug}/audits/cycles`} className="btn btn-secondary">
                    View Cycles →
                </Link>
            </div>

            {cycles.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <div className="text-4xl mb-4">
                        <BarChart3 className="w-10 h-10 text-content-muted mx-auto" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No audit cycles yet</h3>
                    <p className="text-content-muted text-sm mb-4">
                        Create an audit cycle to see readiness scores
                    </p>
                    <Link href={`/t/${tenantSlug}/audits/cycles`} className="btn btn-primary">
                        + New Audit Cycle
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {(cycles as CycleListItem[]).map((c) => {
                        const meta = FW_META[c.frameworkKey] || { ...FW_DEFAULT, label: c.frameworkKey };
                        const FwIcon = meta.icon;
                        const sc: ReadinessResult | undefined = scoresByCycleId[c.id];
                        return (
                            <Link
                                key={c.id}
                                href={`/t/${tenantSlug}/audits/cycles/${c.id}/readiness`}
                                className="glass-card p-6 hover:bg-bg-elevated/30 transition group"
                                id={`readiness-card-${c.id}`}
                            >
                                <div className="flex items-start gap-6">
                                    <div className="flex-shrink-0">
                                        {sc ? (
                                            <ScoreRing score={sc.score} />
                                        ) : (
                                            <div className="w-24 h-24 rounded-full bg-bg-elevated/50 flex items-center justify-center text-content-subtle">
                                                –
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span
                                                className={`w-8 h-8 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center text-sm`}
                                            >
                                                <FwIcon className="w-4 h-4 text-content-emphasis" aria-hidden="true" />
                                            </span>
                                            <h3 className="font-semibold text-sm truncate">{c.name}</h3>
                                        </div>
                                        <p className="text-xs text-content-muted">{meta.label}</p>
                                        {sc && (
                                            <div className="mt-3 space-y-1">
                                                {sc.recommendations?.slice(0, 2).map((r: string, i: number) => (
                                                    <p key={i} className="text-xs text-content-subtle truncate">
                                                        → {r}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
