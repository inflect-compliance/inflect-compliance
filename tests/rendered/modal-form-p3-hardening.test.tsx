/**
 * Modal-form P3 — production hardening ratchet.
 *
 * P3 deliverables locked structurally:
 *   1. Each form hook exposes `isDirty` on its return shape.
 *   2. Each form hook sets `isDirty: true` on first edit and clears
 *      it on submit-success.
 *   3. Each modal wraps `setOpen` with an unsaved-changes guard that
 *      checks `form.isDirty` (and `form.submitting`) before
 *      surrendering the modal.
 *   4. The Modal primitive's `setShowModal` receives the GUARDED
 *      setter — that's how X / Escape / outside-click all route
 *      through the warning uniformly.
 *
 * Structural-only — no DOM mounts. The modal primitive's Radix
 * portal + jsdom focus-trap interplay is fragile in rendered tests;
 * the assertions here verify the WIRING contract, not the runtime.
 * E2E specs cover the runtime behaviour.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const APP = path.join(ROOT, 'src/app/t/[tenantSlug]/(app)');

interface HardenedFlow {
    label: string;
    hookPath: string;
    hookExport: string;
    modalPath: string;
    confirmCopy: RegExp;
}

const FLOWS: HardenedFlow[] = [
    {
        label: 'policies',
        hookPath: 'policies/_form/useNewPolicyForm.ts',
        hookExport: 'useNewPolicyForm',
        modalPath: 'policies/NewPolicyModal.tsx',
        confirmCopy: /Discard policy\?/,
    },
    {
        label: 'tasks',
        hookPath: 'tasks/_form/useNewTaskForm.ts',
        hookExport: 'useNewTaskForm',
        modalPath: 'tasks/NewTaskModal.tsx',
        confirmCopy: /Discard task\?/,
    },
    {
        label: 'vendors',
        hookPath: 'vendors/_form/useNewVendorForm.ts',
        hookExport: 'useNewVendorForm',
        modalPath: 'vendors/NewVendorModal.tsx',
        confirmCopy: /Discard vendor\?/,
    },
    {
        label: 'assets',
        hookPath: 'assets/_form/useEditAssetForm.ts',
        hookExport: 'useEditAssetForm',
        modalPath: 'assets/EditAssetModal.tsx',
        confirmCopy: /Discard changes\?/,
    },
];

function read(rel: string): string {
    return fs.readFileSync(path.join(APP, rel), 'utf8');
}

describe.each(FLOWS)('modal-form P3 — $label hook exposes isDirty', (flow) => {
    const src = read(flow.hookPath);

    it('declares an `isDirty` state hook', () => {
        // The single-flag pattern (`useState(false)`) is the canonical
        // shape for P3 dirty-tracking — set to true on first edit,
        // cleared on submit-success.
        expect(src).toMatch(/setIsDirty\s*[,(]?/);
        expect(src).toMatch(/const\s*\[\s*isDirty\s*,\s*setIsDirty\s*\]/);
    });

    it('sets isDirty true on `setField`', () => {
        // Find the setField function body and check it calls setIsDirty(true).
        // Match `setField = ... { ... setIsDirty(true) ... }`.
        expect(src).toMatch(/setField[\s\S]{0,400}setIsDirty\(true\)/);
    });

    it('clears isDirty on submit success', () => {
        // Look for `setIsDirty(false)` somewhere — typically before
        // the `onSuccess(...)` call inside the try block.
        expect(src).toMatch(/setIsDirty\(false\)/);
    });

    it('returns isDirty on the hook contract', () => {
        // Both the type-shape interface AND the return object must
        // carry it. (Modal compositions read `form.isDirty`.)
        expect(src).toMatch(/isDirty:\s*boolean/);
        expect(src).toMatch(/return\s*\{[\s\S]*\bisDirty\b[\s\S]*\}/);
    });
});

describe.each(FLOWS)('modal-form P3 — $label modal wires the guard', (flow) => {
    const src = read(flow.modalPath);

    it('declares a `guardedSetOpen` callback', () => {
        expect(src).toMatch(/guardedSetOpen/);
    });

    it('guard reads form.isDirty + form.submitting', () => {
        expect(src).toMatch(/form\.isDirty/);
        expect(src).toMatch(/form\.submitting/);
    });

    it('guard prompts before discarding', () => {
        expect(src).toMatch(/window\.confirm\(/);
        expect(src).toMatch(flow.confirmCopy);
    });

    it("Modal's setShowModal receives the guarded setter (not bare setOpen)", () => {
        // Every close path (Cancel button, X, Escape, outside click)
        // is routed through the guard ONLY if Radix's onOpenChange
        // (wired via `setShowModal`) hits guardedSetOpen, not setOpen.
        expect(src).toMatch(/setShowModal=\{guardedSetOpen\}/);
        // Defensive: no remaining `setShowModal={setOpen}` in the modal.
        expect(src).not.toMatch(/setShowModal=\{setOpen\}/);
    });
});
