/**
 * Item 28 — task-due-notification wiring ratchet.
 *
 * The reminders (one week / one day / day-of) are produced by a daily
 * cron whose chain has several links; a break in ANY one makes the
 * reminders silently never fire. This locks the full chain so a future
 * edit can't half-wire it again:
 *
 *   1. The schedule exists in SCHEDULED_JOBS (daily, tz-aware).
 *   2. The executor registry has a handler for it.
 *   3. The NotificationType enum carries TASK_DUE.
 *   4. The three reminder windows are exactly 7 / 1 / 0 days.
 *   5. The long-running worker self-registers schedules on boot, so a
 *      running worker ALWAYS implies the cron exists (the durable fix
 *      for the drifted-deploy failure mode) — and both the worker and
 *      the standalone scheduler go through the ONE shared registrar.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SCHEDULED_JOBS } from '@/app-layer/jobs/schedules';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('item 28 — task-due-notification wiring', () => {
    it('1. the daily task-due schedule is registered (tz-aware)', () => {
        const entry = SCHEDULED_JOBS.find((s) => s.name === 'task-due-notification');
        expect(entry).toBeDefined();
        // Daily at 08:00.
        expect(entry!.pattern).toBe('0 8 * * *');
        // tz-aware so the windows match the local calendar day. The
        // resolved value is env-dependent (undefined under test env), so
        // assert the binding structurally — the entry declares a tz from
        // NOTIFICATIONS_TZ.
        expect('tz' in entry!).toBe(true);
        const schedulesSrc = read('src/app-layer/jobs/schedules.ts');
        expect(schedulesSrc).toMatch(
            /name:\s*'task-due-notification'[\s\S]*?tz:\s*env\.NOTIFICATIONS_TZ/,
        );
    });

    it('2. the executor registry has a task-due-notification handler', () => {
        const src = read('src/app-layer/jobs/executor-registry.ts');
        expect(src).toContain("executorRegistry.register('task-due-notification'");
    });

    it('3. the NotificationType enum carries TASK_DUE', () => {
        const enums = read('prisma/schema/enums.prisma');
        const block = enums.slice(enums.indexOf('enum NotificationType'));
        expect(block).toMatch(/\bTASK_DUE\b/);
    });

    it('4. the reminder windows are exactly 7 / 1 / 0 days', () => {
        const src = read('src/app-layer/notifications/task-due.ts');
        expect(src).toMatch(/week:\s*\{\s*days:\s*7/);
        expect(src).toMatch(/day:\s*\{\s*days:\s*1/);
        expect(src).toMatch(/today:\s*\{\s*days:\s*0/);
    });

    it('5. the worker self-registers schedules on boot via the shared registrar', () => {
        const worker = read('scripts/worker.ts');
        expect(worker).toContain('registerSchedules');
        // Both entry points must use the ONE shared registrar — no
        // duplicated upsert shape that could drift.
        const scheduler = read('scripts/scheduler.ts');
        expect(scheduler).toContain('registerSchedules');
        const shared = read('src/app-layer/jobs/register-schedules.ts');
        expect(shared).toContain('upsertJobScheduler');
    });
});
