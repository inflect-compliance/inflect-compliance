'use client';

/**
 * Controlled field markup for the policy-create form. Reads its state
 * from a `useNewPolicyForm()` instance — does not own any state itself.
 *
 * See `docs/implementation-notes/2026-05-24-modal-form-architecture.md`
 * for the design context. Both the legacy `/policies/new` page wrapper
 * and the future `<NewPolicyModal>` (P2) render this component
 * unchanged; the wrapper supplies its own submit button + chrome.
 */
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Heading } from '@/components/ui/typography';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import type { NewPolicyFormReturn } from './useNewPolicyForm';

const POLICY_CATEGORIES: ComboboxOption[] = [
    'Information Security',
    'Access Control',
    'HR',
    'Physical',
    'Compliance',
    'Operations',
    'Risk Management',
    'Business Continuity',
    'Supplier',
    'Other',
].map((c) => ({ value: c, label: c }));

export function NewPolicyFields({ form }: { form: NewPolicyFormReturn }) {
    return (
        <>
            {/* Template picker — only in template mode. */}
            {form.isTemplateMode && (
                <div
                    className={cn(
                        cardVariants({ density: 'compact' }),
                        'space-y-compact',
                    )}
                >
                    <Heading level={3}>Choose a Template</Heading>
                    {form.templates.length === 0 ? (
                        <p className="text-sm text-content-subtle">
                            No templates available.
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-tight max-h-60 overflow-y-auto">
                            {form.templates.map((tpl) => (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    onClick={() => form.selectTemplate(tpl)}
                                    className={`text-left p-3 rounded-lg border transition text-sm ${
                                        form.fields.templateId === tpl.id
                                            ? 'border-[var(--brand-default)] bg-[var(--brand-subtle)] text-content-emphasis'
                                            : 'border-border-default bg-bg-default/50 text-content-default hover:bg-bg-muted/50'
                                    }`}
                                >
                                    <p className="font-medium">{tpl.title}</p>
                                    {tpl.category && (
                                        <p className="text-xs text-content-subtle mt-0.5">
                                            {tpl.category}
                                        </p>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Form fields */}
            <FormField
                label="Title"
                required
                error={
                    form.fields.title.length > 0 && !form.fields.title.trim()
                        ? 'Title cannot be empty.'
                        : undefined
                }
            >
                <Input
                    id="policy-title-input"
                    required
                    value={form.fields.title}
                    onChange={(e) => form.setField('title', e.target.value)}
                    placeholder="e.g. Information Security Policy"
                />
            </FormField>
            <FormField label="Description">
                <Input
                    value={form.fields.description}
                    onChange={(e) => form.setField('description', e.target.value)}
                    placeholder="Brief description of this policy"
                />
            </FormField>
            <FormField label="Category">
                <Combobox
                    id="policy-category-select"
                    name="category"
                    options={POLICY_CATEGORIES}
                    selected={
                        POLICY_CATEGORIES.find(
                            (o) => o.value === form.fields.category,
                        ) ?? null
                    }
                    setSelected={(o) => form.setField('category', o?.value ?? '')}
                    placeholder="Select category…"
                    searchPlaceholder="Search categories…"
                    matchTriggerWidth
                    buttonProps={{ className: 'w-full' }}
                    caret
                />
            </FormField>

            {/* Initial content for blank mode only */}
            {!form.isTemplateMode && (
                <FormField label="Initial Content (Markdown)">
                    <Textarea
                        id="policy-content-input"
                        className="min-h-[200px] font-mono text-sm"
                        value={form.fields.content}
                        onChange={(e) => form.setField('content', e.target.value)}
                        placeholder="# Policy Content&#10;&#10;Write your policy here in Markdown..."
                    />
                </FormField>
            )}
        </>
    );
}
