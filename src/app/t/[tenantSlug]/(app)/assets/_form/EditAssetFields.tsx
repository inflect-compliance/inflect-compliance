'use client';

/**
 * Controlled field markup for the asset-edit form.
 *
 * Composes the same six fields the legacy inline-edit panel exposed.
 * The detail page renders this inline (existing behaviour); the P2
 * `<EditAssetModal>` renders it inside Modal.Body. State + submit
 * live in `useEditAssetForm`.
 */
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { UserCombobox } from '@/components/ui/user-combobox';
import type { EditAssetFormReturn } from './useEditAssetForm';

const TYPES = [
    'INFORMATION',
    'APPLICATION',
    'SYSTEM',
    'SERVICE',
    'DATA_STORE',
    'INFRASTRUCTURE',
    'VENDOR',
    'PROCESS',
    'PEOPLE_PROCESS',
    'OTHER',
];
const TYPE_OPTIONS: ComboboxOption[] = TYPES.map((t) => ({
    value: t,
    label: t.replace(/_/g, ' '),
}));
const CRITICALITIES = ['LOW', 'MEDIUM', 'HIGH'];
const CRIT_OPTIONS: ComboboxOption[] = CRITICALITIES.map((c) => ({
    value: c,
    label: c,
}));
const STATUS_OPTIONS: ComboboxOption[] = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'RETIRED', label: 'Retired' },
];

export function EditAssetFields({
    form,
    tenantSlug,
}: {
    form: EditAssetFormReturn;
    tenantSlug: string;
}) {
    return (
        <div className="grid grid-cols-2 gap-default">
            <div>
                <label className="input-label">Name *</label>
                <input
                    className="input"
                    value={form.fields.name}
                    onChange={(e) => form.setField('name', e.target.value)}
                />
            </div>
            <div>
                <label className="input-label">Type</label>
                <Combobox
                    hideSearch
                    selected={
                        TYPE_OPTIONS.find((o) => o.value === form.fields.type) ??
                        null
                    }
                    setSelected={(opt) =>
                        form.setField('type', opt?.value ?? 'SYSTEM')
                    }
                    options={TYPE_OPTIONS}
                    matchTriggerWidth
                />
            </div>
            <div>
                <label className="input-label">Criticality</label>
                <Combobox
                    hideSearch
                    selected={
                        CRIT_OPTIONS.find(
                            (o) => o.value === form.fields.criticality,
                        ) ?? null
                    }
                    setSelected={(opt) =>
                        form.setField('criticality', opt?.value || '')
                    }
                    options={CRIT_OPTIONS}
                    placeholder="—"
                    matchTriggerWidth
                />
            </div>
            <div>
                <label className="input-label">Status</label>
                <Combobox
                    hideSearch
                    selected={
                        STATUS_OPTIONS.find(
                            (o) => o.value === form.fields.status,
                        ) ?? null
                    }
                    setSelected={(opt) =>
                        form.setField('status', opt?.value ?? 'ACTIVE')
                    }
                    options={STATUS_OPTIONS}
                    matchTriggerWidth
                />
            </div>
            <div>
                <label className="input-label">Assigned to</label>
                <UserCombobox
                    tenantSlug={tenantSlug}
                    selectedId={form.fields.ownerUserId || null}
                    onChange={(userId) =>
                        form.setField('ownerUserId', userId ?? '')
                    }
                    forceDropdown
                    matchTriggerWidth
                    id="asset-assignee"
                    placeholder="Unassigned"
                />
            </div>
            <div>
                <label className="input-label">Owner (label)</label>
                <input
                    className="input"
                    value={form.fields.owner}
                    onChange={(e) => form.setField('owner', e.target.value)}
                />
            </div>
            <div>
                <label className="input-label">External Ref</label>
                <input
                    className="input"
                    value={form.fields.externalRef}
                    onChange={(e) => form.setField('externalRef', e.target.value)}
                />
            </div>
            <div>
                <label className="input-label">Classification</label>
                <input
                    className="input"
                    value={form.fields.classification}
                    onChange={(e) =>
                        form.setField('classification', e.target.value)
                    }
                />
            </div>
            <div>
                <label className="input-label">Location</label>
                <input
                    className="input"
                    value={form.fields.location}
                    onChange={(e) => form.setField('location', e.target.value)}
                />
            </div>
        </div>
    );
}
