'use client';

/**
 * Manual trigger console (Automation Epic 10).
 *
 * "Test a rule" — pick an enabled rule, optionally dry-run (evaluate the
 * filter against the latest sample payload WITHOUT firing), or fire it for
 * real (manual re-trigger). EDITOR+ only; the API enforces the gate.
 */
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { CACHE_KEYS } from '@/lib/swr-keys';
import type { AutomationRuleRow } from '@/app/t/[tenantSlug]/(app)/processes/RulesTab';

export function ManualTriggerPanel() {
    const apiUrl = useTenantApiUrl();
    const { data: rules } = useTenantSWR<AutomationRuleRow[]>(CACHE_KEYS.automation.rules.list());
    const [ruleId, setRuleId] = useState<string>('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    const options: ComboboxOption[] = useMemo(
        () =>
            (rules ?? [])
                .filter((r) => r.status === 'ENABLED')
                .map((r) => ({ value: r.id, label: r.name })),
        [rules],
    );

    async function dryRun() {
        if (!ruleId) return;
        setBusy(true);
        setResult(null);
        try {
            const res = await fetch(apiUrl(`/automation/rules/${ruleId}/dry-run`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const json = await res.json();
            setResult(json.matches ? 'Dry run: filter MATCHES — would fire.' : 'Dry run: filter does NOT match — would skip.');
        } finally {
            setBusy(false);
        }
    }

    async function fire() {
        if (!ruleId) return;
        setBusy(true);
        setResult(null);
        try {
            const res = await fetch(apiUrl(`/automation/rules/${ruleId}/re-trigger`), {
                method: 'POST',
            });
            setResult(res.ok ? 'Fired — a manual execution was enqueued.' : 'Fire failed.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <div className="space-y-default">
                <p className="text-[11px] uppercase tracking-wide text-content-subtle">
                    Test a rule
                </p>
                <Combobox
                    options={options}
                    selected={ruleId ? options.find((o) => o.value === ruleId) ?? null : null}
                    setSelected={(o) => setRuleId(o?.value ?? '')}
                    placeholder="Select an enabled rule…"
                    matchTriggerWidth
                />
                <div className="flex gap-compact">
                    <Button variant="secondary" disabled={!ruleId || busy} loading={busy} onClick={dryRun}>
                        Dry run
                    </Button>
                    <Button variant="primary" disabled={!ruleId || busy} onClick={fire}>
                        Fire
                    </Button>
                </div>
                {result && <p className="text-sm text-content-muted">{result}</p>}
            </div>
        </Card>
    );
}
