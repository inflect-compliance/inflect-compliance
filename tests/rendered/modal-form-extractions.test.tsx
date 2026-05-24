/**
 * Modal-form P1 — structural lock that the four entity form
 * extractions (`use<Entity>Form` + `<Entity>Fields`) exist and
 * compose the canonical pattern. P2 adds the modal wrappers; P3
 * hardens a11y/focus/unsaved-state. See
 * `docs/implementation-notes/2026-05-24-modal-form-architecture.md`.
 *
 * This is a structural test, not a deep behavioural one — the
 * full-page wrappers (`policies/new`, `tasks/new`, `vendors/new`,
 * `assets/[id]`) cover the existing user-facing flows via E2E. The
 * job here is to keep the extracted seam intact so the P2 modal
 * migration has a stable contract to bolt onto.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const APP = path.join(ROOT, 'src/app/t/[tenantSlug]/(app)');

interface Extraction {
    /** Human-readable label for the assertion error message. */
    name: string;
    /** Relative to APP root. */
    hookPath: string;
    /** Relative to APP root. */
    fieldsPath: string;
    /** Exported hook name (`useFooForm`). */
    hookExport: string;
    /** Exported component name (`FooFields`). */
    fieldsExport: string;
    /** Each return-shape key the hook must surface to the wrappers. */
    requiredReturnKeys: string[];
    /** Page that must wire the hook + fields (refactored in P1). */
    pageWrapperPath: string;
}

const EXTRACTIONS: Extraction[] = [
    {
        name: 'policies (create)',
        hookPath: 'policies/_form/useNewPolicyForm.ts',
        fieldsPath: 'policies/_form/NewPolicyFields.tsx',
        hookExport: 'useNewPolicyForm',
        fieldsExport: 'NewPolicyFields',
        requiredReturnKeys: [
            'fields',
            'setField',
            'submitting',
            'error',
            'canSubmit',
            'submit',
        ],
        pageWrapperPath: 'policies/new/page.tsx',
    },
    {
        name: 'tasks (create)',
        hookPath: 'tasks/_form/useNewTaskForm.ts',
        fieldsPath: 'tasks/_form/NewTaskFields.tsx',
        hookExport: 'useNewTaskForm',
        fieldsExport: 'NewTaskFields',
        requiredReturnKeys: [
            'fields',
            'setField',
            'pendingLinks',
            'addPendingLink',
            'removePendingLink',
            'submitting',
            'error',
            'canSubmit',
            'validationMessage',
            'submit',
        ],
        pageWrapperPath: 'tasks/new/page.tsx',
    },
    {
        name: 'vendors (create)',
        hookPath: 'vendors/_form/useNewVendorForm.ts',
        fieldsPath: 'vendors/_form/NewVendorFields.tsx',
        hookExport: 'useNewVendorForm',
        fieldsExport: 'NewVendorFields',
        requiredReturnKeys: [
            'fields',
            'setField',
            'submitting',
            'error',
            'canSubmit',
            'submit',
        ],
        pageWrapperPath: 'vendors/new/page.tsx',
    },
    {
        name: 'assets (edit)',
        hookPath: 'assets/_form/useEditAssetForm.ts',
        fieldsPath: 'assets/_form/EditAssetFields.tsx',
        hookExport: 'useEditAssetForm',
        fieldsExport: 'EditAssetFields',
        requiredReturnKeys: [
            'fields',
            'setField',
            'submitting',
            'error',
            'canSubmit',
            'submit',
        ],
        pageWrapperPath: 'assets/[id]/page.tsx',
    },
];

function read(rel: string): string {
    return fs.readFileSync(path.join(APP, rel), 'utf8');
}

describe.each(EXTRACTIONS)('modal-form extraction — $name', (extraction) => {
    it('the hook file exists and exports the named hook', () => {
        const src = read(extraction.hookPath);
        expect(src).toMatch(new RegExp(`export function ${extraction.hookExport}\\b`));
    });

    it('the hook return shape carries every key the wrappers compose against', () => {
        const src = read(extraction.hookPath);
        for (const key of extraction.requiredReturnKeys) {
            // Look for the key on the return object — `key,` or `key:` form.
            const re = new RegExp(`\\b${key}\\b\\s*[:,}]`);
            expect(src).toMatch(re);
        }
    });

    it('the fields component file exists and exports the named component', () => {
        const src = read(extraction.fieldsPath);
        expect(src).toMatch(
            new RegExp(`export function ${extraction.fieldsExport}\\b`),
        );
    });

    it('the fields component reads from a form prop typed as the hook return', () => {
        // Canonical pattern: the fields component receives
        // `{ form: <HookReturn> }` and reads `form.fields.<key>` /
        // `form.setField(...)`. The structural check is that the
        // component never declares its own form state — it must be
        // controlled. `useState` would indicate state leakage.
        const src = read(extraction.fieldsPath);
        expect(src).not.toMatch(/\buseState\s*\(/);
        expect(src).toMatch(/\bform\.fields\b|\bform\.setField\b/);
    });

    it('the page wrapper composes the hook + fields', () => {
        const src = read(extraction.pageWrapperPath);
        expect(src).toContain(extraction.hookExport);
        expect(src).toContain(extraction.fieldsExport);
    });

    it('the page wrapper does not re-declare the hook state inline', () => {
        // Page wrappers must not maintain a parallel `useState` set for
        // the same form fields — the hook is the single source.
        // (`useState` is allowed for non-form chrome like tab state.)
        const src = read(extraction.pageWrapperPath);
        // Heuristic — bare `setTitle`/`setName`/`setForm` calls in the
        // page wrapper indicate the old inline form survived.
        expect(src).not.toMatch(/\bsetForm\(/);
    });
});

describe('modal-form architecture — design doc anchor', () => {
    it('the design-doc lives at the documented path', () => {
        const docPath = path.join(
            ROOT,
            'docs/implementation-notes/2026-05-24-modal-form-architecture.md',
        );
        expect(fs.existsSync(docPath)).toBe(true);
    });

    it('the design doc names every entity covered by P1', () => {
        const docPath = path.join(
            ROOT,
            'docs/implementation-notes/2026-05-24-modal-form-architecture.md',
        );
        const content = fs.readFileSync(docPath, 'utf8');
        for (const e of EXTRACTIONS) {
            // Look for the entity name (without `(create)` / `(edit)`).
            const entity = e.name.split(' ')[0];
            expect(content.toLowerCase()).toContain(entity);
        }
    });
});
