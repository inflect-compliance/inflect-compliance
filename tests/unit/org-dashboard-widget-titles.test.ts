/**
 * Unit coverage for the canonical org-dashboard widget title resolver.
 *
 * `resolveWidgetTitle` is the single source the create usecase, the
 * dispatcher, and the null-title backfill all share to guarantee a
 * widget NEVER renders a raw slug or an empty title. These assertions
 * lock the three-tier resolution order: own title → canonical map →
 * sentence-cased slug fallback.
 */

import {
    resolveWidgetTitle,
    WIDGET_TITLES,
    widgetTitleKey,
    sentenceCaseSlug,
} from '@/app-layer/usecases/org-dashboard-widget-titles';

describe('resolveWidgetTitle', () => {
    it('returns the widget-provided title when present (trimmed)', () => {
        expect(resolveWidgetTitle('KPI', 'coverage', '  My Coverage  ')).toBe(
            'My Coverage',
        );
    });

    it('falls back to the canonical map when no title is given', () => {
        expect(resolveWidgetTitle('KPI', 'coverage')).toBe('Coverage');
        expect(resolveWidgetTitle('TREND', 'risks-open')).toBe(
            'Open Risks (90 days)',
        );
    });

    it('treats null / empty / whitespace titles as absent', () => {
        expect(resolveWidgetTitle('KPI', 'tenants', null)).toBe('Tenants');
        expect(resolveWidgetTitle('KPI', 'tenants', '')).toBe('Tenants');
        expect(resolveWidgetTitle('KPI', 'tenants', '   ')).toBe('Tenants');
    });

    it('sentence-cases an unknown slug as the last resort (never a raw slug)', () => {
        expect(resolveWidgetTitle('KPI', 'made-up-metric')).toBe(
            'Made Up Metric',
        );
    });

    it('keys the canonical map by `${type}/${chartType}`', () => {
        expect(widgetTitleKey('KPI', 'coverage')).toBe('KPI/coverage');
        expect(WIDGET_TITLES['TENANT_LIST/coverage']).toBe('Coverage by Tenant');
    });

    it('sentenceCaseSlug degrades a falsy slug to "Widget"', () => {
        expect(sentenceCaseSlug('')).toBe('Widget');
    });
});
