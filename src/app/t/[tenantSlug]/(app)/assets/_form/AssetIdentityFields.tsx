'use client';

/**
 * Product-identity fields — shared by the asset create + edit forms.
 *
 * CPE 2.3 / Vendor / Product / Version are the machine-readable identity
 * that powers CVE→asset matching: the vulnerability scanner chain keys
 * incoming CVEs against these columns to decide which assets are exposed.
 * All four are optional free text; an asset with none simply won't be
 * matched against the CVE feed (the detail Overview surfaces a hint).
 */
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { InfoTooltip } from '@/components/ui/tooltip';
import { Heading } from '@/components/ui/typography';

export interface AssetIdentityValues {
    cpe: string;
    vendor: string;
    product: string;
    version: string;
}

export function AssetIdentityFields({
    values,
    onChange,
    idPrefix = 'asset',
}: {
    values: AssetIdentityValues;
    onChange: (key: keyof AssetIdentityValues, value: string) => void;
    idPrefix?: string;
}) {
    const t = useTranslations('assets');
    return (
        <div className="space-y-default border-t border-border-subtle pt-4">
            <div className="flex items-center gap-1.5">
                <Heading level={3}>{t('form.identityHeading')}</Heading>
                <InfoTooltip
                    content={t('form.identityTooltip')}
                    aria-label={t('form.identityHeading')}
                />
            </div>
            <FormField label={t('form.cpe')}>
                <Input
                    id={`${idPrefix}-cpe-input`}
                    value={values.cpe}
                    onChange={(e) => onChange('cpe', e.target.value)}
                    placeholder={t('form.cpePlaceholder')}
                />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-default">
                <FormField label={t('form.vendor')}>
                    <Input
                        id={`${idPrefix}-vendor-input`}
                        value={values.vendor}
                        onChange={(e) => onChange('vendor', e.target.value)}
                    />
                </FormField>
                <FormField label={t('form.product')}>
                    <Input
                        id={`${idPrefix}-product-input`}
                        value={values.product}
                        onChange={(e) => onChange('product', e.target.value)}
                    />
                </FormField>
                <FormField label={t('form.version')}>
                    <Input
                        id={`${idPrefix}-version-input`}
                        value={values.version}
                        onChange={(e) => onChange('version', e.target.value)}
                    />
                </FormField>
            </div>
        </div>
    );
}
