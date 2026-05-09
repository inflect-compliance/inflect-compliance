'use client';

/**
 * Epic O-4 — Tenant creation form (org context).
 *
 * Three fields: name, slug, framework. Only `name` and `slug` are
 * POSTed to `/api/org/{slug}/tenants` (Epic O-2 contract); the
 * framework selection is captured client-side and threaded through to
 * the new tenant's frameworks page on success so the user lands one
 * click away from installation. When "Choose later" is selected, we
 * just redirect to the new tenant's dashboard.
 *
 * The slug is auto-derived from the name on the first keystroke and
 * stops auto-syncing once the user edits it manually — the same
 * UX pattern used in the standard onboarding flow.
 *
 * Validation mirrors the server schema (`CreateOrgTenantInput` in
 * `organization.schemas.ts`) so the user gets fast feedback without a
 * round-trip; the server remains the source of truth.
 */
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button, buttonVariants } from '@/components/ui/button';
import { Heading } from '@/components/ui/typography';

interface Props {
    orgSlug: string;
}

interface FrameworkOption {
    key: string;
    label: string;
    description: string;
}

// The framework catalog lives behind a per-tenant context and isn't
// reachable from org-scope, so the picker shows a curated short list
// of the well-known compliance frameworks (matches the catalog used
// on the per-tenant frameworks page). "later" is the no-redirect
// fall-through.
const FRAMEWORK_OPTIONS: FrameworkOption[] = [
    { key: 'later', label: 'Choose later', description: 'Skip framework selection — pick on the new tenant dashboard.' },
    { key: 'ISO27001', label: 'ISO/IEC 27001', description: 'Information security management.' },
    { key: 'NIS2', label: 'NIS2', description: 'EU cybersecurity directive.' },
    { key: 'ISO9001', label: 'ISO 9001', description: 'Quality management system.' },
    { key: 'ISO28000', label: 'ISO 28000', description: 'Supply chain security.' },
    { key: 'ISO39001', label: 'ISO 39001', description: 'Road traffic safety management.' },
];

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function slugify(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
}

interface FieldErrors {
    name?: string;
    slug?: string;
}

function validate({ name, slug }: { name: string; slug: string }): FieldErrors {
    const errors: FieldErrors = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
        errors.name = 'Name is required.';
    } else if (trimmedName.length > 120) {
        errors.name = 'Name must be 120 characters or fewer.';
    }
    const trimmedSlug = slug.trim();
    if (!trimmedSlug) {
        errors.slug = 'Slug is required.';
    } else if (!SLUG_RE.test(trimmedSlug)) {
        errors.slug =
            'Slug must be lowercase letters, numbers, and dashes (no leading or trailing dashes).';
    }
    return errors;
}

export function NewTenantForm({ orgSlug }: Props) {
    const router = useRouter();

    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [slugTouched, setSlugTouched] = useState(false);
    const [framework, setFramework] = useState<string>('later');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [touched, setTouched] = useState<{ name: boolean; slug: boolean }>({
        name: false,
        slug: false,
    });

    const errors = useMemo(() => validate({ name, slug }), [name, slug]);
    const hasErrors = Boolean(errors.name || errors.slug);

    const onNameChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const next = e.target.value;
            setName(next);
            if (!slugTouched) {
                setSlug(slugify(next));
            }
        },
        [slugTouched],
    );

    const onSlugChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSlug(e.target.value);
        setSlugTouched(true);
    }, []);

    const onSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            setTouched({ name: true, slug: true });
            if (hasErrors) return;

            setSubmitting(true);
            setSubmitError(null);
            try {
                const res = await fetch(`/api/org/${orgSlug}/tenants`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ name: name.trim(), slug: slug.trim() }),
                });
                if (!res.ok) {
                    let message = `Tenant creation failed (${res.status}).`;
                    try {
                        const body = (await res.json()) as { error?: { message?: string } };
                        if (body?.error?.message) message = body.error.message;
                    } catch {
                        /* response wasn't JSON; keep the generic message */
                    }
                    setSubmitError(message);
                    setSubmitting(false);
                    return;
                }
                const body = (await res.json()) as { tenant: { slug: string } };
                const newSlug = body.tenant.slug;
                if (framework === 'later') {
                    router.push(`/t/${newSlug}/dashboard`);
                } else {
                    // Land on the frameworks page with a hint so the user
                    // can install the chosen framework in one step.
                    router.push(`/t/${newSlug}/frameworks?install=${framework}`);
                }
            } catch (err) {
                setSubmitError(
                    err instanceof Error
                        ? err.message
                        : 'Unexpected error while creating tenant.',
                );
                setSubmitting(false);
            }
        },
        [orgSlug, name, slug, framework, hasErrors, router],
    );

    return (
        <div className="max-w-xl mx-auto space-y-section">
            <div>
                <Link
                    href={`/org/${orgSlug}/tenants`}
                    className="inline-flex items-center gap-1 text-sm text-content-muted hover:text-content-emphasis"
                    data-testid="org-new-tenant-back"
                >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Back to tenants
                </Link>
                <Heading level={1} className="mt-3">
                    Create a new tenant
                </Heading>
                <p className="text-sm text-content-muted mt-1">
                    Tenants are isolated workspaces under this organization. Other
                    org admins are auto-provisioned with AUDITOR access on creation.
                </p>
            </div>

            <form
                onSubmit={onSubmit}
                noValidate
                data-testid="org-new-tenant-form"
                className="glass-card p-6 space-y-5"
            >
                <FormField
                    label="Name"
                    description="Display name shown across the tenant workspace and audit reports."
                    error={touched.name ? errors.name : undefined}
                    required
                >
                    <Input
                        name="name"
                        value={name}
                        onChange={onNameChange}
                        onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                        autoComplete="off"
                        autoFocus
                        maxLength={120}
                        placeholder="Acme EU Operations"
                        data-testid="org-new-tenant-name"
                    />
                </FormField>

                <FormField
                    label="Slug"
                    description="Lowercase URL identifier. Auto-derived from the name; edit if you need something different."
                    error={touched.slug ? errors.slug : undefined}
                    required
                >
                    <Input
                        name="slug"
                        value={slug}
                        onChange={onSlugChange}
                        onBlur={() => setTouched((t) => ({ ...t, slug: true }))}
                        autoComplete="off"
                        maxLength={64}
                        placeholder="acme-eu"
                        data-testid="org-new-tenant-slug"
                    />
                </FormField>

                {/* Elevation PR-8 — fieldset/legend/native-radio cocktail
                    replaced with the canonical <RadioGroup> primitive
                    (Radix-backed). Card-shape labels preserved, but
                    state + a11y now flow through Radix. data-testid
                    naming preserved verbatim — no spec changes. */}
                <div className="space-y-tight" data-testid="org-new-tenant-framework-group">
                    <p className="text-sm font-medium text-content-emphasis">
                        Starting framework
                    </p>
                    <p className="text-xs text-content-muted">
                        Pick the compliance framework you want to install first. You can
                        add more (or change this choice) from the new tenant dashboard.
                    </p>
                    <RadioGroup
                        value={framework}
                        onValueChange={(v) => setFramework(v as typeof framework)}
                        aria-label="Starting framework"
                        className="space-y-1.5 pt-1"
                    >
                        {FRAMEWORK_OPTIONS.map((opt) => {
                            const id = `org-new-tenant-framework-${opt.key}`;
                            const checked = framework === opt.key;
                            return (
                                <label
                                    key={opt.key}
                                    htmlFor={id}
                                    className={`flex items-start gap-compact rounded-lg border p-3 cursor-pointer transition-colors duration-150 ease-out ${
                                        checked
                                            ? 'border-border-emphasis bg-bg-subtle'
                                            : 'border-border-subtle hover:bg-bg-muted'
                                    }`}
                                >
                                    <RadioGroupItem
                                        id={id}
                                        value={opt.key}
                                        size="sm"
                                        className="mt-0.5"
                                        data-testid={id}
                                    />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-content-emphasis">
                                            {opt.label}
                                        </p>
                                        <p className="text-xs text-content-muted">
                                            {opt.description}
                                        </p>
                                    </div>
                                </label>
                            );
                        })}
                    </RadioGroup>
                </div>

                {submitError && (
                    <p
                        className="text-sm text-content-error"
                        role="alert"
                        data-testid="org-new-tenant-error"
                    >
                        {submitError}
                    </p>
                )}

                <div className="flex items-center justify-end gap-tight pt-2">
                    <Link
                        href={`/org/${orgSlug}/tenants`}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                        data-testid="org-new-tenant-cancel"
                    >
                        Cancel
                    </Link>
                    <Button
                        type="submit"
                        variant="primary"
                        loading={submitting}
                        disabled={submitting || hasErrors}
                        data-testid="org-new-tenant-submit"
                        text={submitting ? 'Creating…' : 'Create tenant'}
                    />
                </div>
            </form>
        </div>
    );
}
