'use client';
/* TODO(swr-migration): this file has fetch-on-mount + setState
 * patterns flagged by react-hooks/set-state-in-effect. Each call site
 * carries an inline disable directive; collectively they should
 * migrate to useTenantSWR (Epic 69 shape) so the rule can lift. */

import { formatDate } from '@/lib/format-date';
import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { Paperclip } from 'lucide-react';
import { textLinkVariants } from '@/components/ui/typography';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Tooltip } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Plus } from '@/components/ui/icons/nucleo';
import { buttonVariants } from '@/components/ui/button-variants';
import { EntityDetailLayout } from '@/components/layout/EntityDetailLayout';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { MetaStrip } from '@/components/ui/meta-strip';
import { Card, cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';

const EV_KIND_OPTIONS: ComboboxOption[] = [
    { value: 'FILE_UPLOAD', label: 'Upload File' },
    { value: 'LINK', label: 'URL / Link' },
    { value: 'EVIDENCE', label: 'Existing Evidence Record' },
];

interface EvidenceLink {
    id: string;
    kind: string;
    url: string | null;
    note: string | null;
    fileId: string | null;
    evidenceId: string | null;
    evidence?: { id: string; title: string; type: string } | null;
    createdBy?: { name: string | null; email: string } | null;
    createdAt: string;
}

interface TestRunDetail {
    id: string;
    status: string;
    result: string | null;
    notes: string | null;
    findingSummary: string | null;
    executedAt: string | null;
    controlId: string;
    testPlanId: string;
    testPlan?: { id: string; name: string; controlId: string; frequency: string } | null;
    executedBy?: { name: string | null; email: string } | null;
    createdBy?: { name: string | null; email: string } | null;
    evidence: EvidenceLink[];
    createdAt: string;
}

const RESULT_BADGE: Record<string, StatusBadgeVariant> = {
    PASS: 'success', FAIL: 'error', INCONCLUSIVE: 'warning',
};

export default function TestRunPage() {
    const t = useTranslations('controlTests');
    const params = useParams();
    const router = useRouter();
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions } = useTenantContext();
    const runId = params?.runId as string;

    const [run, setRun] = useState<TestRunDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Complete form
    const [result, setResult] = useState<'PASS' | 'FAIL' | 'INCONCLUSIVE'>('PASS');
    const [notes, setNotes] = useState('');
    const [findingSummary, setFindingSummary] = useState('');
    const [completing, setCompleting] = useState(false);

    // Evidence form
    const [showEvForm, setShowEvForm] = useState(false);
    const [evKind, setEvKind] = useState<'LINK' | 'EVIDENCE' | 'FILE_UPLOAD'>('FILE_UPLOAD');
    const [evUrl, setEvUrl] = useState('');
    const [evNote, setEvNote] = useState('');
    const [evEvidenceId, setEvEvidenceId] = useState('');
    const [evFile, setEvFile] = useState<File | null>(null);
    const [evFileTitle, setEvFileTitle] = useState('');
    const [evError, setEvError] = useState('');
    const [linkingEv, setLinkingEv] = useState(false);
    const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

    const [retesting, setRetesting] = useState(false);

    const handleRetest = async () => {
        setRetesting(true);
        try {
            const res = await fetch(apiUrl(`/tests/runs/${runId}/retest`), { method: 'POST' });
            if (res.ok) {
                const newRun = await res.json();
                router.push(tenantHref(`/tests/runs/${newRun.id}`));
            }
        } finally {
            setRetesting(false);
        }
    };

    const fetchRun = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(apiUrl(`/tests/runs/${runId}`));
            if (!res.ok) throw new Error(t('run.errors.notFound'));
            setRun(await res.json());
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : t('run.errors.unknown'));
        } finally {
            setLoading(false);
        }
    }, [apiUrl, runId, t]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchRun(); }, [fetchRun]);

    const completeRun = async () => {
        setCompleting(true);
        try {
            const body: Record<string, unknown> = { result, notes: notes || null };
            if (result === 'FAIL') body.findingSummary = findingSummary || null;
            const res = await fetch(apiUrl(`/tests/runs/${runId}/complete`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                await fetchRun();
            }
        } finally {
            setCompleting(false);
        }
    };

    // Attach evidence to this run. Both new uploads (FILE) and new links
    // (LINK) are created as first-class Evidence Library records LINKED TO
    // THE CONTROL (run.controlId) — so they surface in the control's
    // Evidence tab and the Evidence Library, not just on this run. The
    // created (or pre-existing) evidence record is then linked to the run.
    const linkEvidence = async () => {
        if (!run) return;
        setLinkingEv(true);
        setEvError('');
        try {
            let evidenceId = evEvidenceId;

            if (evKind === 'FILE_UPLOAD') {
                if (!evFile) return;
                // Canonical multipart upload — creates FileRecord +
                // Evidence(FILE) + the ControlEvidenceLink in one flow.
                const formData = new FormData();
                formData.append('file', evFile);
                formData.append('title', evFileTitle || evFile.name);
                formData.append('controlId', run.controlId);
                const uploadRes = await fetch(apiUrl('/evidence/uploads'), {
                    method: 'POST',
                    body: formData,
                });
                if (!uploadRes.ok) {
                    throw new Error((await uploadRes.text()) || t('run.errors.uploadFailed'));
                }
                evidenceId = (await uploadRes.json()).id;
            } else if (evKind === 'LINK') {
                if (!evUrl) return;
                // Create a LINK evidence record in the library, linked to
                // the control. `content` carries the URL (createEvidence
                // maps it onto the control evidence-link's `url`).
                const createRes = await fetch(apiUrl('/evidence'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'LINK',
                        title: evFileTitle || evUrl,
                        content: evUrl,
                        controlId: run.controlId,
                    }),
                });
                if (!createRes.ok) {
                    throw new Error((await createRes.text()) || t('run.errors.createLinkFailed'));
                }
                evidenceId = (await createRes.json()).id;
            }

            // Link the evidence record (newly-created or pre-existing) to
            // this test run.
            const linkRes = await fetch(apiUrl(`/tests/runs/${runId}/evidence`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'EVIDENCE', evidenceId, note: evNote || null }),
            });
            if (!linkRes.ok) throw new Error(t('run.errors.linkFailed'));

            setShowEvForm(false);
            setEvUrl('');
            setEvNote('');
            setEvEvidenceId('');
            setEvFile(null);
            setEvFileTitle('');
            await fetchRun();
        } catch (err) {
            setEvError(err instanceof Error ? err.message : t('run.errors.addFailed'));
        } finally {
            setLinkingEv(false);
        }
    };

    const unlinkEvidence = async (linkId: string) => {
        setUnlinkingId(linkId);
        try {
            await fetch(apiUrl(`/tests/runs/${runId}/evidence/${linkId}`), { method: 'DELETE' });
            await fetchRun();
        } finally {
            setUnlinkingId(null);
        }
    };

    const fallbackBreadcrumbs = [
        { label: t('crumb.dashboard'), href: tenantHref('/dashboard') },
        { label: t('crumb.tests'), href: tenantHref('/tests') },
        { label: run?.testPlan?.name ?? t('run.run') },
    ];
    if (loading) {
        return (
            <EntityDetailLayout loading title="" breadcrumbs={fallbackBreadcrumbs}>
                <></>
            </EntityDetailLayout>
        );
    }
    if (error) {
        return (
            <EntityDetailLayout error={error} title="" breadcrumbs={fallbackBreadcrumbs}>
                <></>
            </EntityDetailLayout>
        );
    }
    if (!run) {
        return (
            <EntityDetailLayout empty={{ message: t('run.notFoundEmpty') }} title="" breadcrumbs={fallbackBreadcrumbs}>
                <></>
            </EntityDetailLayout>
        );
    }

    const isCompleted = run.status === 'COMPLETED';

    // Determine if "Link" button should be disabled
    const canSubmitEvidence = evKind === 'LINK' ? !!evUrl : evKind === 'EVIDENCE' ? !!evEvidenceId : !!evFile;

    const breadcrumbs = run.testPlan
        ? [
            { label: t('crumb.dashboard'), href: tenantHref('/dashboard') },
            { label: t('run.controls'), href: tenantHref('/controls') },
            { label: run.testPlan.name, href: tenantHref(`/controls/${run.testPlan.controlId}/tests/${run.testPlanId}`) },
            { label: t('run.run') },
        ]
        : fallbackBreadcrumbs;

    return (
        <EntityDetailLayout
            id="test-run-detail-page"
            back={{ smart: true }}
            breadcrumbs={breadcrumbs}

            title={
                <span id="test-run-title">
                    {t('run.title')}{run.testPlan ? ` — ${run.testPlan.name}` : ''}
                </span>
            }
            meta={
                <MetaStrip
                    items={[
                        {
                            kind: 'status',
                            id: 'test-run-status',
                            label: t('run.meta.status'),
                            value: run.status,
                            variant:
                                run.status === 'COMPLETED'
                                    ? 'success'
                                    : run.status === 'RUNNING'
                                      ? 'info'
                                      : 'neutral',
                        },
                        ...(run.result
                            ? [
                                  {
                                      kind: 'status' as const,
                                      id: 'test-run-result',
                                      label: t('run.meta.result'),
                                      value: run.result,
                                      variant:
                                          RESULT_BADGE[run.result] ?? 'neutral',
                                  },
                              ]
                            : []),
                        ...(run.executedAt
                            ? [
                                  {
                                      label: t('run.meta.executed'),
                                      value: formatDate(run.executedAt),
                                  } as const,
                              ]
                            : []),
                    ]}
                />
            }
        >
            {/* Complete Form — only if not completed */}
            {!isCompleted && permissions.canWrite && (
                <Card className="space-y-default border-l-4 border-[var(--brand-default)]">
                    <Heading level={3}>{t('run.completeHeading')}</Heading>

                    <div>
                        <label className="text-xs text-content-muted block mb-1">{t('run.resultLabel')}</label>
                        <div className="flex gap-compact">
                            {(['PASS', 'FAIL', 'INCONCLUSIVE'] as const).map(r => (
                                <button
                                    key={r}
                                    className={buttonVariants({ variant: result === r ? (r === 'FAIL' ? 'destructive' : 'primary') : 'ghost', size: 'sm', className: result === r ? (r === 'PASS' ? 'bg-bg-success-emphasis text-content-emphasis' : r === 'FAIL' ? 'bg-bg-error-emphasis text-content-emphasis' : 'bg-bg-warning-emphasis text-content-emphasis') : '' })}
                                    onClick={() => setResult(r)}
                                    id={`result-btn-${r}`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-content-muted block mb-1">{t('run.notes')}</label>
                        <textarea
                            className="input w-full h-20"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder={t('run.notesPlaceholder')}
                            id="test-run-notes"
                        />
                    </div>

                    {result === 'FAIL' && (
                        <div className="animate-fadeIn">
                            <label className="text-xs text-content-muted block mb-1">{t('run.findingLabel')}</label>
                            <textarea
                                className="input w-full h-16"
                                value={findingSummary}
                                onChange={e => setFindingSummary(e.target.value)}
                                placeholder={t('run.findingPlaceholder')}
                                id="test-run-finding-summary"
                            />
                        </div>
                    )}

                    <Button
                        variant="primary"
                        size="sm"
                        onClick={completeRun}
                        disabled={completing}
                        id="complete-test-run-btn"
                    >
                        {completing ? t('run.completing') : t('run.completeAs', { result })}
                    </Button>
                </Card>
            )}

            {/* Completed Info */}
            {isCompleted && (
                <div className={cn(cardVariants({ density: 'compact' }), 'space-y-tight')}>
                    {run.notes && (
                        <div>
                            <span className="text-xs text-content-muted">{t('run.notesColon')}</span>
                            <p className="text-sm text-content-default whitespace-pre-wrap mt-1">{run.notes}</p>
                        </div>
                    )}
                    {run.findingSummary && (
                        <div>
                            <span className="text-xs text-content-error">{t('run.findingColon')}</span>
                            <p className="text-sm text-content-error whitespace-pre-wrap mt-1">{run.findingSummary}</p>
                        </div>
                    )}
                    {run.executedBy && (
                        <div className="text-xs text-content-subtle mt-2">
                            {t('run.executedBy', { name: run.executedBy.name || run.executedBy.email, date: formatDate(run.executedAt) })}
                        </div>
                    )}

                    {/* Retest button for FAIL/INCONCLUSIVE */}
                    {permissions.canWrite && (run.result === 'FAIL' || run.result === 'INCONCLUSIVE') && (
                        <div className="mt-3 pt-3 border-t border-border-default/50">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleRetest}
                                disabled={retesting}
                                id="retest-btn"
                            >
                                {retesting ? t('run.creating') : t('run.retest')}
                            </Button>
                            <span className="text-xs text-content-subtle ml-2">{t('run.retestHint')}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Evidence Section */}
            <div className={cardVariants({ density: 'compact' })}>
                <div className="flex items-center justify-between mb-3">
                    <Heading level={3}>{t('run.evidenceHeading', { count: run.evidence?.length ?? 0 })}</Heading>
                    {permissions.canWrite && (
                        <Button
                            variant="primary"
                            icon={showEvForm ? undefined : <Plus className="-ml-0.5 -mr-2.5" />}
                            onClick={() => { setShowEvForm(!showEvForm); setEvError(''); }}
                            id="link-evidence-btn"
                        >
                            {showEvForm ? t('run.cancel') : t('run.evidence')}
                        </Button>
                    )}
                </div>

                {showEvForm && (
                    <div className="space-y-compact mb-4 p-3 rounded bg-bg-default/50 animate-fadeIn">
                        {evError && (
                            <div className="rounded border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error" role="alert" id="evidence-error">
                                {evError}
                            </div>
                        )}
                        <div>
                            <label className="text-xs text-content-muted block mb-1">{t('run.evidenceType')}</label>
                            <Combobox
                                hideSearch
                                id="evidence-kind-select"
                                selected={EV_KIND_OPTIONS.find(o => o.value === evKind) ?? null}
                                setSelected={(opt) => setEvKind((opt?.value ?? 'FILE_UPLOAD') as 'LINK' | 'EVIDENCE' | 'FILE_UPLOAD')}
                                options={EV_KIND_OPTIONS}
                                matchTriggerWidth
                            />
                        </div>
                        {evKind === 'FILE_UPLOAD' && (
                            <>
                                <div>
                                    <label className="text-xs text-content-muted block mb-1">{t('run.file')}</label>
                                    <label className="flex flex-col items-center justify-center w-full p-4 border-2 border-dashed border-border-emphasis rounded-lg cursor-pointer hover:border-[var(--brand-default)]/50 transition-colors bg-bg-page/30">
                                        <input
                                            type="file"
                                            className="hidden"
                                            onChange={e => {
                                                const f = e.target.files?.[0] || null;
                                                setEvFile(f);
                                                if (f && !evFileTitle) setEvFileTitle(f.name);
                                            }}
                                            id="evidence-file-input"
                                        />
                                        {evFile ? (
                                            <div className="text-sm text-content-emphasis flex items-center gap-tight">
                                                <Paperclip className="w-4 h-4 text-[var(--brand-default)]" aria-hidden="true" />
                                                <span>{evFile.name}</span>
                                                <span className="text-xs text-content-subtle">({(evFile.size / 1024).toFixed(1)} KB)</span>
                                            </div>
                                        ) : (
                                            <div className="text-center">
                                                <p className="text-sm text-content-muted">{t('run.selectFile')}</p>
                                                <p className="text-xs text-content-subtle mt-1">{t('run.fileHint')}</p>
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </>
                        )}
                        {evKind === 'LINK' && (
                            <div>
                                <label className="text-xs text-content-muted block mb-1">{t('run.url')}</label>
                                <input className="input w-full" value={evUrl} onChange={e => setEvUrl(e.target.value)} placeholder="https://..." id="evidence-url-input" />
                            </div>
                        )}
                        {evKind === 'EVIDENCE' && (
                            <div>
                                <label className="text-xs text-content-muted block mb-1">{t('run.evidenceId')}</label>
                                <input className="input w-full" value={evEvidenceId} onChange={e => setEvEvidenceId(e.target.value)} placeholder={t('run.evidenceIdPlaceholder')} id="evidence-id-input" />
                            </div>
                        )}
                        {(evKind === 'FILE_UPLOAD' || evKind === 'LINK') && (
                            <div>
                                <label className="text-xs text-content-muted block mb-1">{t('run.title2')}</label>
                                <input className="input w-full" value={evFileTitle} onChange={e => setEvFileTitle(e.target.value)} placeholder={t('run.titlePlaceholder')} id="evidence-file-title-input" />
                            </div>
                        )}
                        <div>
                            <label className="text-xs text-content-muted block mb-1">{t('run.note')}</label>
                            <input className="input w-full" value={evNote} onChange={e => setEvNote(e.target.value)} placeholder={t('run.notePlaceholder')} id="evidence-note-input" />
                        </div>
                        <Button
                            variant="primary"
                            size="xs"
                            onClick={linkEvidence}
                            disabled={linkingEv || !canSubmitEvidence}
                            id="save-evidence-link-btn"
                        >
                            {linkingEv ? (evKind === 'FILE_UPLOAD' ? t('run.uploading') : t('run.linking')) : (evKind === 'FILE_UPLOAD' ? t('run.uploadLink') : t('run.link'))}
                        </Button>
                    </div>
                )}

                {run.evidence.length === 0 ? (
                    <p className="text-sm text-content-subtle">{t('run.evidenceEmpty')}</p>
                ) : (
                    <div className="divide-y divide-border-default/50">
                        {run.evidence.map(ev => (
                            <div key={ev.id} className="flex items-center justify-between py-2 group">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-tight">
                                        <StatusBadge variant="neutral" size="sm">{ev.kind}</StatusBadge>
                                        {ev.evidence && (
                                            <span className="text-sm text-content-default">{ev.evidence.title}</span>
                                        )}
                                        {ev.url && (
                                            <a href={ev.url} target="_blank" rel="noopener noreferrer" className={`${textLinkVariants({ tone: 'link' })} text-sm truncate`}>
                                                {ev.url}
                                            </a>
                                        )}
                                    </div>
                                    {ev.note && <p className="text-xs text-content-subtle mt-0.5">{ev.note}</p>}
                                    <p className="text-xs text-content-subtle mt-0.5">
                                        {ev.createdBy?.name || ev.createdBy?.email} • {formatDate(ev.createdAt)}
                                    </p>
                                </div>
                                {permissions.canWrite && (
                                    <Tooltip content={t('run.unlinkTooltip')}>
                                        <Button
                                            variant="ghost"
                                            size="xs"
                                            className="text-content-error opacity-0 group-hover:opacity-100 transition"
                                            onClick={() => unlinkEvidence(ev.id)}
                                            disabled={unlinkingId === ev.id}
                                            aria-label={t('run.unlinkAria')}
                                        >
                                            {unlinkingId === ev.id ? '...' : <span aria-hidden="true">×</span>}
                                        </Button>
                                    </Tooltip>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Meta */}
            <div className="text-xs text-content-subtle">
                {t('run.createdBy', { date: formatDate(run.createdAt), name: run.createdBy?.name || run.createdBy?.email || t('run.unknown') })}
            </div>
        </EntityDetailLayout>
    );
}
