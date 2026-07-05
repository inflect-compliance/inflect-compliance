'use client';
import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import Link from 'next/link';
import { Combobox } from '@/components/ui/combobox';
import { EmptyState } from '@/components/ui/empty-state';
import { FileText, SearchX } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { Card, cardVariants } from '@/components/ui/card';
import { BackAffordance } from '@/components/nav/BackAffordance';
import { cn } from '@/lib/cn';
import { TemplateControlSuggestModal, type SuggestionResultDTO } from './TemplateControlSuggestModal';

interface PolicyTemplateRow {
    id: string;
    title: string;
    category: string | null;
    language: string | null;
    tags: string | null;
    contentText: string;
    source: string | null;
    externalRef: string | null;
    /** Installed frameworks this template pre-maps to (powers the badge). */
    mappedFrameworks?: string[];
}

const FRAMEWORK_LABEL: Record<string, string> = { ISO27001: 'ISO 27001', NIS2: 'NIS2' };

function mappedFrameworksLabel(keys: string[]): string {
    return keys.map((k) => FRAMEWORK_LABEL[k] ?? k).join(' + ');
}

export default function TemplatesPage() {
    const tx = useTranslations('policies');
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const router = useRouter();
    const tenant = useTenantContext();

    const [templates, setTemplates] = useState<PolicyTemplateRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [creating, setCreating] = useState('');
    const [suggestModal, setSuggestModal] = useState<{ policyId: string; policyTitle: string; result: SuggestionResultDTO } | null>(null);

    useEffect(() => {
        fetch(apiUrl('/policies/templates'))
            .then(r => r.json())
            .then(t => { setTemplates(t); setLoading(false); })
            .catch(() => setLoading(false));
    }, [apiUrl]);

    const categories = useMemo(() =>
        [...new Set(templates.map(t => t.category).filter((c): c is string => Boolean(c)))].sort(),
        [templates]
    );

    // R14-PR7 — the standalone search input was dropped. Users
    // find templates by category combobox below or the global
    // command palette (⌘K). If granular search becomes load-bearing
    // here, adopt the FilterToolbar primitive — never reintroduce a
    // hand-rolled `<input type="search">` per CLAUDE.md filter
    // strategy.
    const filtered = useMemo(() => {
        if (!categoryFilter) return templates;
        return templates.filter(t => t.category === categoryFilter);
    }, [templates, categoryFilter]);

    const handleUseTemplate = async (tpl: PolicyTemplateRow) => {
        if (!tenant.permissions.canWrite) return;
        setCreating(tpl.id);
        try {
            const res = await fetch(apiUrl('/policies'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: tpl.title, templateId: tpl.id, category: tpl.category }),
            });
            if (res.ok) {
                const policy = await res.json();
                const suggestions: SuggestionResultDTO | null = policy.suggestedControlLinks ?? null;
                // Framework-aware template with installed-framework matches →
                // show the explicit confirm-and-link panel before navigating.
                if (suggestions && suggestions.totalSuggested > 0) {
                    setSuggestModal({ policyId: policy.id, policyTitle: policy.title, result: suggestions });
                    return;
                }
                router.push(tenantHref(`/policies/${policy.id}`));
            }
        } finally {
            setCreating('');
        }
    };

    const handleConfirmLinks = async (controlIds: string[]) => {
        if (!suggestModal) return;
        await fetch(apiUrl(`/policies/${suggestModal.policyId}/control-links`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ controlIds }),
        }).catch(() => {});
        router.push(tenantHref(`/policies/${suggestModal.policyId}`));
    };

    const handleSkipLinks = () => {
        if (!suggestModal) return;
        router.push(tenantHref(`/policies/${suggestModal.policyId}`));
    };

    return (
        <div className="space-y-section animate-fadeIn">
            <BackAffordance />
            <div className="flex items-center justify-between">
                <div>
                    <Heading level={1}>{tx('templates.pageTitle')}</Heading>
                    <p className="text-content-muted text-sm">{tx('templates.countAvailable', { count: templates.length })}</p>
                </div>
                <Link href={tenantHref('/policies')} className={buttonVariants({ variant: 'secondary' })}>← {tx('templates.backToPolicies')}</Link>
            </div>

            {/* Filters */}
            <div className={cn(cardVariants({ density: 'compact' }), 'flex flex-wrap gap-compact items-center')}>
                <Combobox
                    hideSearch
                    id="template-category-filter"
                    selected={categories.map(c => ({ value: c, label: c })).find(o => o.value === categoryFilter) ?? null}
                    setSelected={(opt) => setCategoryFilter(opt?.value ?? '')}
                    options={categories.map(c => ({ value: c, label: c }))}
                    placeholder={tx('templates.allCategories')}
                    matchTriggerWidth
                    buttonProps={{ className: 'w-48' }}
                />
            </div>

            {/* Grid */}
            {loading ? (
                <div className="p-12 text-center text-content-subtle animate-pulse">{tx('templates.loadingTemplates')}</div>
            ) : filtered.length === 0 ? (
                <div className={cardVariants({ density: 'none' })}>
                    {templates.length === 0 ? (
                        <EmptyState
                            icon={FileText}
                            variant="no-records"
                            title={tx('templates.emptyTitle')}
                            description={tx('templates.emptyDesc')}
                        />
                    ) : (
                        <EmptyState
                            icon={SearchX}
                            variant="no-results"
                            title={tx('templates.emptyFilterTitle')}
                            description={tx('templates.emptyFilterDesc')}
                        />
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-default" id="template-grid">
                    {filtered.map(tpl => (
                        <Card className="flex flex-col justify-between hover:ring-1 hover:ring-[var(--brand-default)]/30 transition" key={tpl.id}>
                            <div>
                                <Heading level={3} className="mb-1">{tpl.title}</Heading>
                                <div className="flex gap-tight mb-2 flex-wrap items-center">
                                    {tpl.category && <StatusBadge variant="neutral">{tpl.category}</StatusBadge>}
                                    {tpl.language && <span className="text-xs text-content-subtle">{tpl.language.toUpperCase()}</span>}
                                    {tpl.mappedFrameworks && tpl.mappedFrameworks.length > 0 && (
                                        <StatusBadge variant="info">{tx('templates.mapsTo', { frameworks: mappedFrameworksLabel(tpl.mappedFrameworks) })}</StatusBadge>
                                    )}
                                </div>
                                {tpl.tags && (
                                    <div className="flex flex-wrap gap-1 mb-3">
                                        {tpl.tags.split(',').map((tag: string) => (
                                            <span key={tag.trim()} className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated/50 text-content-muted">
                                                {tag.trim()}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <p className="text-xs text-content-subtle line-clamp-3">
                                    {tpl.contentText?.substring(0, 150)}...
                                </p>
                                {tpl.source === 'ciso-toolkit' && (
                                    <p className="mt-2 text-[10px] text-content-subtle italic" data-testid="template-source-credit">
                                        {tx.rich('templates.adaptedFrom', {
                                            link: (c) => (
                                                <a
                                                    href="https://github.com/D4d0/ciso-toolkit"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="underline hover:text-content-muted"
                                                >
                                                    {c}
                                                </a>
                                            ),
                                        })}
                                    </p>
                                )}
                            </div>
                            {tenant.permissions.canWrite && (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    className="mt-4 w-full"
                                    onClick={() => handleUseTemplate(tpl)}
                                    disabled={!!creating}
                                    id={`use-template-${tpl.id}`}
                                >
                                    {creating === tpl.id ? tx('templates.creating') : tx('templates.useTemplate')}
                                </Button>
                            )}
                        </Card>
                    ))}
                </div>
            )}

            {suggestModal && (
                <TemplateControlSuggestModal
                    policyTitle={suggestModal.policyTitle}
                    result={suggestModal.result}
                    onConfirm={handleConfirmLinks}
                    onSkip={handleSkipLinks}
                />
            )}
        </div>
    );
}
