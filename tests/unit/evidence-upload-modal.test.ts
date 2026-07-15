/**
 * Epic 54 — Evidence modal + upload migration.
 *
 * Node-env jest can't render .tsx. These source-contract tests assert
 * the Evidence create/upload flows have been lifted onto the shared
 * `<Modal>` + `<FileDropzone>` primitives while preserving:
 *
 *   1. UploadEvidenceModal — drag-and-drop dropzone, FormData POST to
 *      /evidence/uploads, conditional retention POST, optimistic
 *      pending row, cache invalidation, preserved E2E form IDs.
 *   2. NewEvidenceTextModal — POST /evidence with type=TEXT, cache
 *      invalidation, preserved `text-evidence-form` id.
 *   3. EvidenceClient — old inline forms removed; triggers now open
 *      modals; modals mounted with tenant-scoped helpers.
 *   4. FileDropzone primitive — generic dropzone that replaces the
 *      legacy `<FileUpload>` (the rename happened mid-Epic-54; the
 *      old `file-upload.tsx` is still on disk for legacy callers but
 *      the evidence modal flow uses `FileDropzone` now).
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../');
function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

const UPLOAD_MODAL_SRC = read(
    'src/app/t/[tenantSlug]/(app)/evidence/UploadEvidenceModal.tsx',
);
const TEXT_MODAL_SRC = read(
    'src/app/t/[tenantSlug]/(app)/evidence/NewEvidenceTextModal.tsx',
);
const CLIENT_SRC = read(
    'src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx',
);
// FileDropzone is the canonical primitive; file-upload.tsx still
// exists for legacy callers but the evidence flow has migrated.
const FILE_DROPZONE_SRC = read('src/components/ui/FileDropzone.tsx');

// ─── 1. UploadEvidenceModal — composition ──────────────────────

describe('UploadEvidenceModal — shared Modal composition', () => {
    it('is a client component', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/^'use client'/);
    });

    it('uses the shared <Modal> primitive, not a bespoke overlay', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(
            /from ['"]@\/components\/ui\/modal['"]/,
        );
        expect(UPLOAD_MODAL_SRC).not.toMatch(/fixed inset-0 bg-black/);
    });

    it('uses the shared <FileDropzone> primitive (reuse, not rebuild)', () => {
        // The original Epic 54 plan called for `<FileUpload>` but the
        // implementation migrated mid-epic to a more generic
        // `<FileDropzone>` that supports drag-and-drop, queued
        // uploads, per-file progress, and submit-driven uploads.
        expect(UPLOAD_MODAL_SRC).toMatch(
            /from ['"]@\/components\/ui\/FileDropzone['"]/,
        );
        expect(UPLOAD_MODAL_SRC).toMatch(/<FileDropzone\b/);
    });

    it('renders Modal.Form + Modal.Body + Modal.Actions', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/<Modal\.Form\b/);
        expect(UPLOAD_MODAL_SRC).toMatch(/<Modal\.Body\b/);
        expect(UPLOAD_MODAL_SRC).toMatch(/<Modal\.Actions\b/);
    });

    it('uses size="lg" so the upload + metadata fields breathe', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/size=["']lg["']/);
    });

    it('guards close-during-upload via preventDefaultClose', () => {
        // Accept either the legacy `mutation.isPending` shape or the
        // FileDropzone-era `uploadingAll` ref-tracked flag (the
        // dropzone owns the queue, so the modal tracks "any upload
        // in flight" via its imperative handle, not via the React
        // Query mutation alone).
        expect(UPLOAD_MODAL_SRC).toMatch(
            /preventDefaultClose=\{(mutation\.isPending|uploadingAll)\}/,
        );
    });

    // NOTE: the original `accept="evidence"` preset + `variant="document"`
    // props were specific to the legacy `<FileUpload>`. FileDropzone
    // takes a raw `accept` string and has no variant axis. The size-cap
    // contract that survives is asserted in the UX-invariants section
    // below ("enforces a generous but finite client-side max size").
});

// ─── 2. UploadEvidenceModal — preserved E2E IDs ───────────────

describe('UploadEvidenceModal — preserved E2E IDs', () => {
    // `file-input` is now forwarded via FileDropzone's `inputId` prop
    // (the dropzone hides its own <input type="file"> and lets the
    // caller pin its DOM id for setInputFiles selectors). Every
    // other id is a direct `id=` attribute on a regular element.
    const REQUIRED_PLAIN_IDS = [
        'upload-form',
        'upload-title-input',
        // Epic 55 Prompt 4: `control-search-input` was removed when the
        // paired input + native <select> was migrated to a searchable
        // <Combobox>. The Combobox keeps `id="control-select"` (below)
        // and exposes its own search via cmdk's Command.Input.
        'control-select',
        'retention-date-input',
        'submit-upload-btn',
        'upload-error',
    ];

    it.each(REQUIRED_PLAIN_IDS)('preserves id="%s"', (id) => {
        expect(UPLOAD_MODAL_SRC).toMatch(new RegExp(`id=["']${id}["']`));
    });

    it('preserves the file-input selector via FileDropzone.inputId', () => {
        // E2E uses `setInputFiles('#file-input', …)`. FileDropzone
        // forwards `inputId` to its hidden <input>, so this still
        // works post-migration without an `id="file-input"` literal
        // on a separate element.
        expect(UPLOAD_MODAL_SRC).toMatch(/inputId=["']file-input["']/);
    });
});

// ─── 3. UploadEvidenceModal — business contract ───────────────

describe('UploadEvidenceModal — business contract preserved', () => {
    it('POSTs FormData to /evidence/uploads', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(
            /apiUrl\(['"]\/evidence\/uploads['"]\)/,
        );
        expect(UPLOAD_MODAL_SRC).toMatch(/method:\s*['"]POST['"]/);
        expect(UPLOAD_MODAL_SRC).toMatch(/new FormData\(\)/);
        // After the FileDropzone migration, retention is sent via a
        // separate POST (see `fires the follow-up retention POST` test
        // below) — NOT in the upload's FormData. The upload payload
        // still carries file + title + controlId.
        for (const field of ['file', 'title', 'controlId']) {
            // Allow for whitespace/newlines between the paren and the
            // field name — prettier may wrap long appends.
            expect(UPLOAD_MODAL_SRC).toMatch(
                new RegExp(`formData\\.append\\(\\s*['"]${field}['"]`),
            );
        }
    });

    it('fires the follow-up retention POST only when a date is supplied', () => {
        // Mutation handler captures vars-destructured args, so the
        // closure variable is `vars.retentionUntil`, not the bare
        // `retentionUntil`. Either shape is acceptable for the
        // "conditional retention POST" contract.
        expect(UPLOAD_MODAL_SRC).toMatch(
            /if \(\s*(vars\.)?retentionUntil\s*&&\s*uploaded\?\.id\s*\)/,
        );
        expect(UPLOAD_MODAL_SRC).toMatch(
            /apiUrl\(`\/evidence\/\$\{uploaded\.id\}\/retention`\)/,
        );
        expect(UPLOAD_MODAL_SRC).toMatch(
            /retentionPolicy:\s*['"]FIXED_DATE['"]/,
        );
    });

    // Epic 69 migrated this surface from React Query's
    // `useMutation` + `onMutate` / `onError` / `onSettled` lifecycle
    // hooks to `useTenantMutation`. The optimistic-apply / rollback
    // / invalidation behaviour is preserved — the test shape just
    // points at the new symbols (`optimisticUpdate:`, the hook's
    // built-in `rollbackOnError: true` default, and the
    // `swrMutate(matcher)` fan-out).
    it('inserts an optimistic PENDING_UPLOAD row into the list cache', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/optimisticUpdate:/);
        expect(UPLOAD_MODAL_SRC).toMatch(/status:\s*['"]PENDING_UPLOAD['"]/);
        // Each per-file call generates a fresh temp id at trigger
        // time so concurrent uploads don't collide. The literal
        // `temp:` prefix is the marker the EvidenceClient renderer
        // recognises to draw the pending row.
        expect(UPLOAD_MODAL_SRC).toMatch(/temp:/);
    });

    it('rolls back the temp row on error', () => {
        // SWR's `useTenantMutation` enables `rollbackOnError: true`
        // by default, so the rollback machinery doesn't appear as
        // an explicit `onError` handler in the source. The negative
        // pin: callers MUST NOT set `rollbackOnError: false` (which
        // would suppress the auto-rollback). Pin the safe default
        // by asserting the disable flag is absent.
        expect(UPLOAD_MODAL_SRC).not.toMatch(/rollbackOnError:\s*false/);
        expect(UPLOAD_MODAL_SRC).toContain('useTenantMutation');
    });

    it('invalidates the evidence cache fan-out via swrMutate matcher on success', () => {
        // The post-success invalidation is now a function-form
        // `swrMutate((key) => key.startsWith(prefix), …)` so every
        // `/evidence?…` filter variant gets a refetch — which is
        // a strict superset of what `queryKeys.evidence.all` did.
        expect(UPLOAD_MODAL_SRC).toContain('swrMutate');
        expect(UPLOAD_MODAL_SRC).toMatch(/swrMutate\(\s*\(key\)/);
    });

    it('closes the modal once every queued file uploaded successfully', () => {
        // FileDropzone-era shape — closing happens in `onAllSettled`
        // (when the entire queue of N files has reached terminal
        // states), gated on `every(e => e.status === 'success')`.
        // The legacy single-file `onSuccess: ... close()` pattern
        // also matches if the modal hasn't migrated yet.
        expect(UPLOAD_MODAL_SRC).toMatch(
            /(onAllSettled[\s\S]{0,400}allOk[\s\S]{0,200}close\(\)|onSuccess:[\s\S]{0,800}close\(\))/,
        );
    });
});

// ─── 4. UploadEvidenceModal — UX invariants ───────────────────

describe('UploadEvidenceModal — UX invariants', () => {
    it('disables submit while no file is queued or while uploading', () => {
        // FileDropzone-era shape — the dropzone owns the file queue,
        // so the modal tracks `queuedCount` + `uploadingAll` instead
        // of the legacy `!!file && !mutation.isPending`.
        expect(UPLOAD_MODAL_SRC).toMatch(
            /(submitDisabled\s*=\s*queuedCount\s*===\s*0\s*\|\|\s*uploadingAll|canSubmit\s*=\s*!!file\s*&&\s*!mutation\.isPending)/,
        );
    });

    it('fieldset disables every field during an in-flight upload', () => {
        // Accept either the legacy mutation.isPending or the dropzone-
        // era uploadingAll flag — both stop interactive controls
        // mid-upload.
        expect(UPLOAD_MODAL_SRC).toMatch(
            /<fieldset[\s\S]*?disabled=\{(mutation\.isPending|uploadingAll)\}/,
        );
    });

    it('surfaces upload errors in a role="alert" region', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/role=["']alert["']/);
        expect(UPLOAD_MODAL_SRC).toMatch(
            /data-testid=["']upload-evidence-error["']/,
        );
    });

    it('enforces a generous but finite client-side max size', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/MAX_FILE_SIZE_MB\s*=\s*\d+/);
        expect(UPLOAD_MODAL_SRC).toMatch(/maxFileSizeMB=\{MAX_FILE_SIZE_MB\}/);
    });
});

// ─── 5. NewEvidenceTextModal ──────────────────────────────────

describe('NewEvidenceTextModal — shared Modal composition', () => {
    it('is a client component', () => {
        expect(TEXT_MODAL_SRC).toMatch(/^'use client'/);
    });

    it('uses the shared <Modal> primitive', () => {
        expect(TEXT_MODAL_SRC).toMatch(
            /from ['"]@\/components\/ui\/modal['"]/,
        );
    });

    it('renders Modal.Form + Modal.Body + Modal.Actions at size="lg"', () => {
        expect(TEXT_MODAL_SRC).toMatch(/<Modal\.Form\b/);
        expect(TEXT_MODAL_SRC).toMatch(/<Modal\.Body\b/);
        expect(TEXT_MODAL_SRC).toMatch(/<Modal\.Actions\b/);
        expect(TEXT_MODAL_SRC).toMatch(/size=["']lg["']/);
    });

    it('preserves the legacy `text-evidence-form` id', () => {
        expect(TEXT_MODAL_SRC).toMatch(/id=["']text-evidence-form["']/);
    });

    it('POSTs to /evidence with type=TEXT', () => {
        expect(TEXT_MODAL_SRC).toMatch(/apiUrl\(['"]\/evidence['"]\)/);
        expect(TEXT_MODAL_SRC).toMatch(/method:\s*['"]POST['"]/);
        expect(TEXT_MODAL_SRC).toMatch(/type:\s*['"]TEXT['"]/);
    });

    it('revalidates the evidence SWR cache on success and closes', () => {
        // SWR migration Wave 4b removed the React Query invalidation; the
        // create path is now a plain async handler that revalidates every
        // `/evidence?…` SWR cache entry via the `swrMutate(matcher, …)`
        // fan-out, then closes.
        expect(TEXT_MODAL_SRC).not.toMatch(/queryKeys\.evidence\.all/);
        expect(TEXT_MODAL_SRC).toContain('swrMutate');
        expect(TEXT_MODAL_SRC).toMatch(/CACHE_KEYS\.evidence\.list\(\)/);
        // The fan-out + close() both live inside the success branch.
        expect(TEXT_MODAL_SRC).toMatch(/swrMutate\([\s\S]{0,400}close\(\)/);
    });

    it('focuses the title input shortly after open', () => {
        expect(TEXT_MODAL_SRC).toMatch(/titleRef\.current\?\.focus\(\)/);
    });

    it('gates submit behind non-empty title + not submitting', () => {
        expect(TEXT_MODAL_SRC).toMatch(
            /form\.title\.trim\(\)\.length\s*>\s*0[\s\S]{0,80}!submitting/,
        );
    });
});

// ─── 6. EvidenceClient wiring ─────────────────────────────────

describe('EvidenceClient — modal entry points', () => {
    it('EP-3: imports all four create surfaces for the create menu', () => {
        // EP-3 Part 1 reversed UI-18: the single +Evidence upload button
        // became a Popover create-menu offering file upload, text note,
        // link/URL, and bulk ZIP import — so all four modals are imported.
        for (const mod of [
            'UploadEvidenceModal',
            'NewEvidenceTextModal',
            'NewEvidenceLinkModal',
            'EvidenceBulkImportModal',
        ]) {
            const imported =
                new RegExp(`from ['"]\\./${mod}['"]`).test(CLIENT_SRC) ||
                new RegExp(`import\\(['"]\\./${mod}['"]\\)`).test(CLIENT_SRC);
            expect(imported).toBe(true);
        }
    });

    it('mounts <UploadEvidenceModal> with tenant helpers and controls', () => {
        expect(CLIENT_SRC).toMatch(/<UploadEvidenceModal\b/);
        expect(CLIENT_SRC).toMatch(/open=\{showUpload\}/);
        expect(CLIENT_SRC).toMatch(/setOpen=\{setShowUpload\}/);
        expect(CLIENT_SRC).toMatch(/tenantSlug=\{tenantSlug\}/);
        expect(CLIENT_SRC).toMatch(/apiUrl=\{apiUrl\}/);
        expect(CLIENT_SRC).toMatch(/controls=\{controls\}/);
    });

    it('EP-3: mounts all four create modals (upload + text + link + bulk)', () => {
        // EP-3 restored the text + link + ZIP-import surfaces alongside
        // upload, each mounted so the create menu can open them.
        expect(CLIENT_SRC).toMatch(/<UploadEvidenceModal\b/);
        expect(CLIENT_SRC).toMatch(/<NewEvidenceTextModal\b/);
        expect(CLIENT_SRC).toMatch(/<NewEvidenceLinkModal\b/);
        expect(CLIENT_SRC).toMatch(/<EvidenceBulkImportModal\b/);
    });

    it('EP-3: the +Evidence trigger is a Popover create-menu opening the four surfaces', () => {
        // One primary trigger opens a Popover.Menu; each item flips a
        // distinct modal-visibility flag.
        expect(CLIENT_SRC).toMatch(/<Popover\b/);
        expect(CLIENT_SRC).toMatch(/<Popover\.Menu\b/);
        expect(CLIENT_SRC).toMatch(/id=["']add-evidence-btn["']/);
        expect(CLIENT_SRC).toMatch(/setShowUpload\(true\)/);
        expect(CLIENT_SRC).toMatch(/setShowTextModal\(true\)/);
        expect(CLIENT_SRC).toMatch(/setShowLinkModal\(true\)/);
        expect(CLIENT_SRC).toMatch(/setShowBulkImport\(true\)/);
    });

    it('removes the legacy inline forms entirely', () => {
        // The old inline forms rendered these fields outside the modal
        // surface; after migration the only remaining `#upload-form` +
        // `#text-evidence-form` references should live in the modal
        // components, not EvidenceClient.
        expect(CLIENT_SRC).not.toMatch(/id=["']upload-form["']/);
        expect(CLIENT_SRC).not.toMatch(/id=["']text-evidence-form["']/);
        // Drift sentinel — the old `glass-card` inline-form wrapper
        // should not reappear here.
        expect(CLIENT_SRC).not.toMatch(/glass-card[\s\S]{0,40}id=["']upload/);
    });
});

// ─── 7. FileDropzone primitive contract ───────────────────────
//
// The legacy `<FileUpload>` "evidence preset" + "document variant"
// tests were removed when the modal migrated to `<FileDropzone>`.
// FileDropzone takes a raw `accept` string + has no preset/variant
// axes. The contracts that survive — what the UPLOAD MODAL actually
// depends on — are pinned here against the new primitive.

describe('FileDropzone — primitives the modal relies on', () => {
    it('forwards `inputId` to a hidden <input type="file">', () => {
        // E2E selectors use `setInputFiles('#file-input', …)`. The
        // dropzone must propagate the caller's id to its hidden input.
        expect(FILE_DROPZONE_SRC).toMatch(/inputId\s*\?:/);
        expect(FILE_DROPZONE_SRC).toMatch(/type=["']file["']/);
    });

    it('exposes an imperative handle for submit-driven uploads', () => {
        // The modal queues files on drop and triggers uploads on form
        // submit via `dropzoneRef.current.startAll()`. Without the
        // handle, the modal can't bridge React Query mutations into
        // the dropzone's per-file lifecycle.
        expect(FILE_DROPZONE_SRC).toMatch(
            /export interface FileDropzoneHandle/,
        );
        expect(FILE_DROPZONE_SRC).toMatch(/startAll\b/);
    });

    it('caps file size via `maxFileSizeMB`', () => {
        expect(FILE_DROPZONE_SRC).toMatch(/maxFileSizeMB\s*\?:/);
    });
});
