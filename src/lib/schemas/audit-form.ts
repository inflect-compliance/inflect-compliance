/**
 * B6 — frontend-safe Zod schema for the new-audit modal form.
 *
 * Mirrors `<NewAuditFields>`:
 *   - title — required.
 *   - scope — optional free text.
 *   - auditors — optional free text.
 *   - generateChecklist — boolean, defaults to true.
 */
import { z } from 'zod';

export const NewAuditFormSchema = z.object({
    title: z.string().trim().min(1, 'Audit title is required').max(255),
    scope: z.string().trim().max(4000).default(''),
    auditors: z.string().trim().max(1024).default(''),
    // B8 — Framework.key the audit assesses (e.g. "ISO27001"). Empty
    // string = no link; the API treats `''` and `undefined` as null.
    frameworkKey: z.string().trim().max(60).default(''),
    // feat/audit-cycle-unify — the AuditCycle this audit is fieldwork
    // within. Empty string = standalone / ad-hoc audit (null on the wire).
    auditCycleId: z.string().trim().max(60).default(''),
    generateChecklist: z.boolean().default(true),
});

export type NewAuditFormValues = z.input<typeof NewAuditFormSchema>;
