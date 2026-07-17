/**
 * B6 — frontend-safe Zod schema for the new-task modal form.
 *
 * The server's `CreateTaskSchema` lives in
 * `src/app-layer/schemas/`; this is the frontend mirror used by
 * the modal-form UX layer. Server re-validates on POST.
 *
 * Field set (mirrors `<NewTaskFields>`):
 *   - title — required, min 1.
 *   - description — optional free text.
 *   - type — one of TASK / IMPROVEMENT / AUDIT_FINDING /
 *     CONTROL_GAP / INCIDENT.
 *   - severity — one of INFO / LOW / MEDIUM / HIGH / CRITICAL.
 *   - priority — one of P0 / P1 / P2 / P3.
 *   - dueAt — optional `YYYY-MM-DD`.
 *   - assigneeUserId — optional cuid.
 *   - reviewerUserId — optional cuid.
 *   - controlId — optional cuid.
 */
import { z } from 'zod';

const optionalYmd = z
    .string()
    .trim()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), {
        message: 'Must be YYYY-MM-DD',
    });

const optionalCuid = z.string().trim().default('');

export const NewTaskFormSchema = z.object({
    title: z.string().trim().min(1, 'Title is required').max(255),
    description: z.string().trim().max(4000).default(''),
    type: z.enum([
        'TASK',
        'IMPROVEMENT',
        'AUDIT_FINDING',
        'CONTROL_GAP',
        'INCIDENT',
    ]),
    severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']),
    dueAt: optionalYmd.default(''),
    assigneeUserId: optionalCuid,
    reviewerUserId: optionalCuid,
    controlId: optionalCuid,
});

export type NewTaskFormValues = z.input<typeof NewTaskFormSchema>;
