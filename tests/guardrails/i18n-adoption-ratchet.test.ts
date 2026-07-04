/**
 * i18n adoption ratchet — new UI surfaces MUST go through next-intl.
 *
 * Companion to the GAP-19 completeness guard
 * (`i18n-completeness.test.ts`). That test guarantees every key in
 * `en.json` has a translated `bg.json` counterpart — but it can only
 * police strings that already live in the message catalog. It says
 * nothing about a brand-new page that hardcodes `<h1>Dashboard</h1>`
 * and never reaches the catalog at all. Those screens render in
 * English regardless of the user's locale, and nothing caught them —
 * until this ratchet.
 *
 * ## The invariant
 *
 * Every `.tsx` file under the tenant app tree that renders
 * user-facing text MUST adopt next-intl (import `useTranslations` or
 * `getTranslations`). "Renders user-facing text" is detected
 * heuristically (see `hasHardcodedUiText`): a JSX text node with a
 * real word, or a UI-text prop / object key (`title` / `placeholder`
 * / `label` / `header` / …) carrying a string LITERAL. The `{t(...)}`
 * migrated form never matches — a value in `{}` braces is not a
 * quoted literal.
 *
 * ## Ratchet policy (mirrors the `as any` ratchet)
 *
 *   • `UNMIGRATED_BASELINE` is the frozen set of files that hardcode
 *     text today. It is grandfathered debt — the i18n migration is
 *     retiring it surface-by-surface (vendors, assets, …).
 *     Membership only moves DOWN.
 *   • FORWARD: a text-bearing file that neither uses next-intl NOR
 *     sits in the baseline FAILS. That is a new un-localised surface
 *     — wire `useTranslations` / `getTranslations` before it ships.
 *   • NO-STALE: every baseline entry must still exist AND still be
 *     un-migrated-with-text. Migrate a file (adopt next-intl) or
 *     delete it ⇒ remove it from the baseline in the SAME diff. The
 *     list can only shrink, so the debt is visible and monotonic.
 *
 * ## Scope + known limitations (deliberate, documented)
 *
 *   • Scope is `.tsx` under `src/app/t/[tenantSlug]/(app)` — where
 *     the migration is happening. Module-level shared label maps in
 *     `.ts` files (filter-defs, `*-options.ts` enum labels) are the
 *     same documented follow-up the vendors/assets PRs carved out.
 *   • This enforces next-intl ADOPTION, not per-string completeness.
 *     A file already on next-intl can still carry a residual literal
 *     (some partial migrations do today); catching every straggler is
 *     the migration PRs' job, not this ratchet's. The high-value
 *     invariant here is: no NEW surface ships without next-intl.
 *   • Regex-based, so text reaching the DOM only via a variable or a
 *     child component is invisible to it. It catches the common case
 *     — literal strings in JSX / props — which is exactly what "new
 *     UI strings go through next-intl" means in practice.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const APP_DIR = path.join(REPO_ROOT, 'src/app/t/[tenantSlug]/(app)');

// ─── Detection ──────────────────────────────────────────────────

/** Strip block + line comments so prose in comments never matches. */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const USES_INTL = /\b(useTranslations|getTranslations)\b/;

// A JSX text node holding a real (>=3-char lowercase) word, with no
// nested tags/expressions inside the node.
const JSX_TEXT = />[^<>{}]*[a-z]{3,}[^<>{}]*</;

// UI-text-bearing props / object keys whose value is a STRING LITERAL
// containing a >=2-char lowercase run (skips acronyms like 'ISO',
// 'NIS2'). The ["'] immediately after =/: is load-bearing: the
// migrated {t('key')} form is in braces, so it can never match here.
const UI_PROP =
    /\b(?:title|placeholder|label|description|aria-label|searchPlaceholder|confirmLabel|heading|subtitle|emptyTitle|emptyDescription|tooltip|header|confirmText|cancelText|actionLabel)\s*[=:]\s*["'][^"'\n]*[a-z]{2,}[^"'\n]*["']/;

/** Heuristic: does this source render hardcoded, user-facing text? */
export function hasHardcodedUiText(raw: string): boolean {
    const src = stripComments(raw);
    return JSX_TEXT.test(src) || UI_PROP.test(src);
}

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(p));
        else if (e.name.endsWith('.tsx')) out.push(p);
    }
    return out;
}

function rel(abs: string): string {
    return path.relative(REPO_ROOT, abs);
}

// ─── Frozen baseline — grandfathered un-migrated files ──────────
//
// Files that hardcode user-facing text and do NOT use next-intl.
// This list ONLY shrinks. When you localise a file, remove it here
// in the same PR (the no-stale test enforces this).
const UNMIGRATED_BASELINE: ReadonlySet<string> = new Set([
    "src/app/t/[tenantSlug]/(app)/access-reviews/AccessReviewsClient.tsx",
    "src/app/t/[tenantSlug]/(app)/access-reviews/[reviewId]/AccessReviewDetailClient.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/api-keys/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/audit-log/AuditLogClient.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/billing/BillingEventLog.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/billing/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/entra/GroupMappingsSection.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/entra/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/integrations/SharePointCard.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/integrations/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/integrations/sharepoint-health/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/layout.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/mcp/agent-receipts/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/mcp/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/members/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/notifications/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/rbac/MembersTable.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/rbac/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/risk-appetite/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/risk-matrix/RiskMatrixAdminClient.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/roles/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/scim/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/security/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/sso/page.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/trust-center/TrustCenterAdminClient.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/vendor-assessment-reviews/[assessmentId]/VendorAssessmentReviewClient.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/vendor-templates/VendorTemplatesIndexClient.tsx",
    "src/app/t/[tenantSlug]/(app)/admin/vendor-templates/[templateId]/VendorTemplateBuilderClient.tsx",
    "src/app/t/[tenantSlug]/(app)/agent-proposals/AgentProposalsClient.tsx",
    "src/app/t/[tenantSlug]/(app)/agent-proposals/page.tsx",
    "src/app/t/[tenantSlug]/(app)/agent-runs/AgentRunsClient.tsx",
    "src/app/t/[tenantSlug]/(app)/agent-runs/page.tsx",
    "src/app/t/[tenantSlug]/(app)/assets/AssetDetailPanel.tsx",
    "src/app/t/[tenantSlug]/(app)/assets/[id]/page.tsx",
    "src/app/t/[tenantSlug]/(app)/assets/loading.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/AuditsClient.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/NewAuditModal.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/_form/NewAuditFields.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/auditor/page.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/business-continuity/BusinessContinuityClient.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/business-continuity/NewBiaModal.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/business-continuity/[id]/BiaDetailClient.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/cycles/[cycleId]/page.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/cycles/[cycleId]/readiness/page.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/cycles/page.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/loading.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/nis2-gap/Nis2GapLifecycleClient.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/nis2-gap/respond/[assignmentId]/RespondClient.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/nis2-gap/respond/[assignmentId]/loading.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/packs/[packId]/SharePointExportButton.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/packs/[packId]/page.tsx",
    "src/app/t/[tenantSlug]/(app)/audits/readiness/page.tsx",
    "src/app/t/[tenantSlug]/(app)/auth/mfa/page.tsx",
    "src/app/t/[tenantSlug]/(app)/calendar/CalendarClient.tsx",
    "src/app/t/[tenantSlug]/(app)/clauses/loading.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/ControlDetailSheet.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/ControlEditPanel.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/ControlTaskRows.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/PanelActivityFeed.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/PanelTabs.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/TaskEditPanel.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/[controlId]/_components/ControlRoiCard.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/[controlId]/_modals/EditControlModal.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/[controlId]/_modals/NewControlTaskModal.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/[controlId]/_tabs/ControlMappingsTab.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/[controlId]/_tabs/EvidenceSubTable.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/[controlId]/tests/[planId]/page.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/_components/BestValueControls.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/dashboard/page.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/page.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/sankey/ControlsSankeyClient.tsx",
    "src/app/t/[tenantSlug]/(app)/controls/templates/page.tsx",
    "src/app/t/[tenantSlug]/(app)/coverage/CoverageClient.tsx",
    "src/app/t/[tenantSlug]/(app)/coverage/loading.tsx",
    "src/app/t/[tenantSlug]/(app)/dashboard/PostureHeroCard.tsx",
    "src/app/t/[tenantSlug]/(app)/dashboard/page.tsx",
    "src/app/t/[tenantSlug]/(app)/error.tsx",
    "src/app/t/[tenantSlug]/(app)/evidence/EditEvidenceModal.tsx",
    "src/app/t/[tenantSlug]/(app)/evidence/EvidenceBulkImportModal.tsx",
    "src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx",
    "src/app/t/[tenantSlug]/(app)/evidence/EvidenceDetailSheet.tsx",
    "src/app/t/[tenantSlug]/(app)/evidence/NewEvidenceTextModal.tsx",
    "src/app/t/[tenantSlug]/(app)/evidence/UploadEvidenceModal.tsx",
    "src/app/t/[tenantSlug]/(app)/evidence/loading.tsx",
    "src/app/t/[tenantSlug]/(app)/findings/CreateFindingModal.tsx",
    "src/app/t/[tenantSlug]/(app)/findings/FindingsClient.tsx",
    "src/app/t/[tenantSlug]/(app)/framework-updates/FrameworkUpdatesClient.tsx",
    "src/app/t/[tenantSlug]/(app)/frameworks/FrameworksClient.tsx",
    "src/app/t/[tenantSlug]/(app)/frameworks/[frameworkKey]/diff/page.tsx",
    "src/app/t/[tenantSlug]/(app)/frameworks/[frameworkKey]/install/page.tsx",
    "src/app/t/[tenantSlug]/(app)/frameworks/[frameworkKey]/page.tsx",
    "src/app/t/[tenantSlug]/(app)/frameworks/[frameworkKey]/readiness/Nis2ReadinessClient.tsx",
    "src/app/t/[tenantSlug]/(app)/frameworks/[frameworkKey]/readiness/page.tsx",
    "src/app/t/[tenantSlug]/(app)/frameworks/[frameworkKey]/self-assessment/Nis2SelfAssessmentResume.tsx",
    "src/app/t/[tenantSlug]/(app)/frameworks/[frameworkKey]/self-assessment/page.tsx",
    "src/app/t/[tenantSlug]/(app)/frameworks/[frameworkKey]/templates/page.tsx",
    "src/app/t/[tenantSlug]/(app)/frameworks/loading.tsx",
    "src/app/t/[tenantSlug]/(app)/incidents/IncidentsClient.tsx",
    "src/app/t/[tenantSlug]/(app)/incidents/NewIncidentModal.tsx",
    "src/app/t/[tenantSlug]/(app)/incidents/[incidentId]/page.tsx",
    "src/app/t/[tenantSlug]/(app)/issues/dashboard/page.tsx",
    "src/app/t/[tenantSlug]/(app)/issues/loading.tsx",
    "src/app/t/[tenantSlug]/(app)/issues/new/page.tsx",
    "src/app/t/[tenantSlug]/(app)/policies/NewPolicyModal.tsx",
    "src/app/t/[tenantSlug]/(app)/policies/PoliciesClient.tsx",
    "src/app/t/[tenantSlug]/(app)/policies/[policyId]/PolicyEvidenceChecklist.tsx",
    "src/app/t/[tenantSlug]/(app)/policies/[policyId]/PolicySharePointSection.tsx",
    "src/app/t/[tenantSlug]/(app)/policies/[policyId]/page.tsx",
    "src/app/t/[tenantSlug]/(app)/policies/_form/NewPolicyFields.tsx",
    "src/app/t/[tenantSlug]/(app)/policies/loading.tsx",
    "src/app/t/[tenantSlug]/(app)/policies/new/page.tsx",
    "src/app/t/[tenantSlug]/(app)/policies/templates/TemplateControlSuggestModal.tsx",
    "src/app/t/[tenantSlug]/(app)/policies/templates/page.tsx",
    "src/app/t/[tenantSlug]/(app)/processes/AnalyticsTab.tsx",
    "src/app/t/[tenantSlug]/(app)/processes/MonitorTab.tsx",
    "src/app/t/[tenantSlug]/(app)/processes/ProcessesClient.tsx",
    "src/app/t/[tenantSlug]/(app)/processes/RulesTab.tsx",
    "src/app/t/[tenantSlug]/(app)/processes/governance/page.tsx",
    "src/app/t/[tenantSlug]/(app)/reports/ReportsClient.tsx",
    "src/app/t/[tenantSlug]/(app)/reports/loading.tsx",
    "src/app/t/[tenantSlug]/(app)/reports/soa/SoAClient.tsx",
    "src/app/t/[tenantSlug]/(app)/reports/soa/print/SoAPrintView.tsx",
    "src/app/t/[tenantSlug]/(app)/security-testing/SecurityTestingClient.tsx",
    "src/app/t/[tenantSlug]/(app)/security-testing/page.tsx",
    "src/app/t/[tenantSlug]/(app)/security/mfa/page.tsx",
    "src/app/t/[tenantSlug]/(app)/tasks/NewTaskModal.tsx",
    "src/app/t/[tenantSlug]/(app)/tasks/TasksClient.tsx",
    "src/app/t/[tenantSlug]/(app)/tasks/[taskId]/_modals/EditTaskModal.tsx",
    "src/app/t/[tenantSlug]/(app)/tasks/[taskId]/page.tsx",
    "src/app/t/[tenantSlug]/(app)/tasks/_form/NewTaskFields.tsx",
    "src/app/t/[tenantSlug]/(app)/tasks/dashboard/page.tsx",
    "src/app/t/[tenantSlug]/(app)/tasks/loading.tsx",
    "src/app/t/[tenantSlug]/(app)/tasks/page.tsx",
    "src/app/t/[tenantSlug]/(app)/tests/dashboard/page.tsx",
    "src/app/t/[tenantSlug]/(app)/tests/due/page.tsx",
    "src/app/t/[tenantSlug]/(app)/tests/page.tsx",
    "src/app/t/[tenantSlug]/(app)/tests/runs/[runId]/page.tsx",
    "src/app/t/[tenantSlug]/(app)/vendors/[vendorId]/_components/VendorMonitoringPanel.tsx",
    "src/app/t/[tenantSlug]/(app)/vendors/[vendorId]/assessment/[assessmentId]/_components/AssessmentPrefillPanel.tsx",
    "src/app/t/[tenantSlug]/(app)/vendors/[vendorId]/assessment/[assessmentId]/page.tsx",
    "src/app/t/[tenantSlug]/(app)/vendors/[vendorId]/page.tsx",
    "src/app/t/[tenantSlug]/(app)/vendors/dashboard/page.tsx",
    "src/app/t/[tenantSlug]/(app)/vendors/loading.tsx",
    "src/app/t/[tenantSlug]/(app)/vendors/page.tsx",
    "src/app/t/[tenantSlug]/(app)/vulnerabilities/VulnerabilitiesClient.tsx",
]);

// ─── The ratchet ────────────────────────────────────────────────

describe('i18n adoption ratchet — new UI goes through next-intl', () => {
    const files = walk(APP_DIR);

    const textBearingWithoutIntl = files
        .filter((f) => {
            const raw = fs.readFileSync(f, 'utf-8');
            return hasHardcodedUiText(raw) && !USES_INTL.test(raw);
        })
        .map(rel)
        .sort();

    it('has no NEW un-localised surface (text-bearing + no next-intl + not grandfathered)', () => {
        const offenders = textBearingWithoutIntl.filter((f) => !UNMIGRATED_BASELINE.has(f));
        if (offenders.length > 0) {
            throw new Error(
                `${offenders.length} file(s) render hardcoded UI text without next-intl:\n` +
                    offenders.map((f) => `  ${f}`).join('\n') +
                    `\n\nWire the strings through next-intl:\n` +
                    `  • Server component / page:  const t = await getTranslations('<ns>')\n` +
                    `  • Client component:         const t = useTranslations('<ns>')\n` +
                    `then move the literals into messages/en.json + messages/bg.json ` +
                    `(the GAP-19 completeness guard requires both).\n\n` +
                    `See docs/i18n.md. Adding the file to UNMIGRATED_BASELINE is possible ` +
                    `but discouraged — it books permanent English-only debt for a brand-new surface.`,
            );
        }
    });

    it('has no stale baseline entries (every grandfathered file still exists + is still un-migrated)', () => {
        const current = new Set(textBearingWithoutIntl);
        const stale = [...UNMIGRATED_BASELINE].filter((f) => !current.has(f)).sort();
        if (stale.length > 0) {
            throw new Error(
                `${stale.length} UNMIGRATED_BASELINE entr(y/ies) are stale — the file was ` +
                    `migrated to next-intl, lost its hardcoded text, or was deleted:\n` +
                    stale.map((f) => `  ${f}`).join('\n') +
                    `\n\nRemove them from UNMIGRATED_BASELINE in this PR. The ratchet only ` +
                    `moves down — grandfathered debt must be deleted as it is paid off.`,
            );
        }
    });
});

// ─── Self-test: prove the detector actually fires ───────────────
//
// Guards the heuristic itself. A future refactor that broke
// hasHardcodedUiText would otherwise let every un-migrated file slip
// through with this suite still green.
describe('i18n adoption ratchet — detector self-test', () => {
    it('flags a JSX text node with a real word', () => {
        expect(hasHardcodedUiText('<h1>Dashboard overview</h1>')).toBe(true);
    });

    it('flags a hardcoded UI-text prop literal', () => {
        expect(hasHardcodedUiText('<Input placeholder="Search assets" />')).toBe(true);
        expect(hasHardcodedUiText("const col = { header: 'Criticality' };")).toBe(true);
    });

    it('does NOT flag the next-intl {t(...)} form', () => {
        expect(hasHardcodedUiText("<h1>{t('dashboard.title')}</h1>")).toBe(false);
        expect(hasHardcodedUiText("<Input placeholder={t('search')} />")).toBe(false);
    });

    it('does NOT flag acronym-only / proper-noun literals', () => {
        expect(hasHardcodedUiText('<span>ISO27001</span>')).toBe(false);
        expect(hasHardcodedUiText("{ label: 'NIS2' }")).toBe(false);
    });

    it('does NOT flag prose inside comments', () => {
        expect(hasHardcodedUiText('// This renders the Dashboard heading for users')).toBe(false);
        expect(hasHardcodedUiText('/* Shows a friendly Welcome message here */')).toBe(false);
    });

    it('does NOT flag non-UI attributes (className / href / id)', () => {
        expect(hasHardcodedUiText('<div className="flex items-center" id="asset-row" />')).toBe(false);
    });
});
