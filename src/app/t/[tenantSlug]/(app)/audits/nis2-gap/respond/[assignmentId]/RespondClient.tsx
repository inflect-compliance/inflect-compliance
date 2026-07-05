'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/typography';
import { InlineNotice } from '@/components/ui/inline-notice';
import { StatusBadge } from '@/components/ui/status-badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PageHeader } from '@/components/layout/PageHeader';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';

// CC BY 4.0 attribution — carries everywhere derived NIS2 content renders.
const NIS2_ATTRIBUTION =
    'NIS2 gap-assessment questions © NISD2 contributors (Kardashev Catalyst UG / nisd2.eu), CC BY 4.0';
const NIS2_SOURCE_URL = 'https://github.com/NISD2/nis2-gap-assessment-schema';
const ANSWERS = ['YES', 'PARTIALLY', 'NO', 'NA'] as const;

type Bilingual = { en: string; de: string };
type Question = { id: string; domainId: number; plainText: Bilingual; legalBasis: string; criticality: string };
type Domain = { id: number; code: string; name: Bilingual };
type Assignment = { id: string; respondentRole: string; status: string; questionIds: string[] };
type Payload = { assignment: Assignment; questions: Question[]; domains: Domain[]; answers: Array<{ questionId: string; answer: string }> };

export function RespondClient({ tenantSlug, assignmentId }: { tenantSlug: string; assignmentId: string }) {
    const tx = useTranslations('audits');
    const locale = useLocale();
    const lang = locale === 'de' ? 'de' : 'en';
    const base = `/api/t/${tenantSlug}/gap-assignments/${assignmentId}`;

    const [data, setData] = useState<Payload | null>(null);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(base);
            if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } })?.error?.message ?? tx('respond.loadFailed'));
            const payload = (await res.json()) as Payload;
            setData(payload);
            setAnswers(Object.fromEntries(payload.answers.map((a) => [a.questionId, a.answer])));
        } catch (e) {
            setError(e instanceof Error ? e.message : tx('respond.loadFailed'));
        } finally {
            setLoading(false);
        }
    }, [base, tx]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void load(); }, [load]);

    const byDomain = useMemo(() => {
        const groups = new Map<number, Question[]>();
        for (const q of data?.questions ?? []) {
            const arr = groups.get(q.domainId) ?? [];
            arr.push(q);
            groups.set(q.domainId, arr);
        }
        return groups;
    }, [data]);

    const handleSubmit = useCallback(async () => {
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            const payload = Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer }));
            const res = await fetch(`${base}/submit`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ answers: payload }),
            });
            if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } })?.error?.message ?? tx('respond.submitFailed'));
            setNotice(tx('respond.submitted'));
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : tx('respond.submitFailed'));
        } finally {
            setSaving(false);
        }
    }, [answers, base, load, tx]);

    const answeredCount = Object.keys(answers).length;

    return (
        <div className="space-y-section animate-fadeIn">
            <BackAffordance />
            <PageHeader
                breadcrumbs={[
                    { label: tx('crumb.dashboard'), href: `/t/${tenantSlug}/dashboard` },
                    { label: tx('crumb.audits'), href: `/t/${tenantSlug}/audits` },
                    { label: tx('nav.nis2Gap'), href: `/t/${tenantSlug}/audits/nis2-gap` },
                    { label: tx('crumb.respond') },
                ]}
                title={tx('respond.title')}
                description={tx('respond.description')}
                actions={
                    data && data.assignment.status !== 'SUBMITTED' ? (
                        <Button variant="primary" onClick={handleSubmit} disabled={saving || answeredCount === 0} id="nis2-respond-submit-btn">
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            {answeredCount > 0 ? tx('respond.submitN', { count: answeredCount }) : tx('respond.submitZero')}
                        </Button>
                    ) : undefined
                }
            />

            {notice && <InlineNotice variant="success">{notice}</InlineNotice>}
            {error && <p className="text-sm text-content-error">{error}</p>}

            {loading ? (
                <div className="flex items-center gap-tight p-6 text-content-muted text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> {tx('respond.loading')}
                </div>
            ) : !data ? null : (
                <>
                    {data.assignment.status === 'SUBMITTED' && (
                        <InlineNotice variant="info">{tx('respond.alreadySubmitted')}</InlineNotice>
                    )}
                    {data.domains
                        .filter((d) => (byDomain.get(d.id) ?? []).length > 0)
                        .map((d) => (
                            <div key={d.id} className="space-y-default">
                                <Heading level={3}>{d.name?.[lang] ?? d.code}</Heading>
                                <ul className="space-y-tight">
                                    {(byDomain.get(d.id) ?? []).map((q) => (
                                        <li key={q.id} className={cn(cardVariants({ density: 'compact' }), 'space-y-tight')}>
                                            <div className="flex items-start gap-tight flex-wrap">
                                                <StatusBadge variant="neutral" size="sm">{q.criticality}</StatusBadge>
                                                <span className="text-sm font-medium text-content-emphasis">{q.plainText?.[lang] ?? q.id}</span>
                                            </div>
                                            <p className="text-xs text-content-muted">{tx('respond.legalBasis', { legalBasis: q.legalBasis })}</p>
                                            <RadioGroup
                                                value={answers[q.id] ?? ''}
                                                onValueChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                                                className="flex gap-default flex-wrap"
                                            >
                                                {ANSWERS.map((a) => (
                                                    <label key={a} className="flex items-center gap-tight text-sm cursor-pointer">
                                                        <RadioGroupItem value={a} /> {a}
                                                    </label>
                                                ))}
                                            </RadioGroup>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}

                    <p className="text-xs text-content-subtle">
                        {NIS2_ATTRIBUTION}{' '}
                        <a href={NIS2_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-content-muted">{tx('nis2Gap.sourceLink')}</a>
                    </p>
                </>
            )}
        </div>
    );
}
