/**
 * Coverage for `src/app-layer/jobs/register-schedules.ts` (pure).
 *
 * A fake BullMQ Queue captures every `upsertJobScheduler` call so we
 * can assert the repeat-option shape branches:
 *   - every SCHEDULED_JOBS entry is registered (return = length).
 *   - `tz` is included when present (entry.tz OR entry.options.tz),
 *     omitted otherwise.
 *   - `limit` is included only when entry.options.limit is truthy.
 *   - optional logger is called per schedule when provided, and the
 *     no-logger path also works.
 */
import type { Queue } from 'bullmq';
import { registerSchedules } from '@/app-layer/jobs/register-schedules';
import { SCHEDULED_JOBS } from '@/app-layer/jobs/schedules';

interface CapturedCall {
    name: string;
    repeat: { pattern: string; tz?: string; limit?: number };
    template: { name: string; data: unknown };
}

function makeFakeQueue() {
    const calls: CapturedCall[] = [];
    const queue = {
        upsertJobScheduler: async (
            name: string,
            repeat: CapturedCall['repeat'],
            template: CapturedCall['template'],
        ) => {
            calls.push({ name, repeat, template });
        },
    } as unknown as Queue;
    return { calls, queue };
}

describe('registerSchedules', () => {
    it('registers every SCHEDULED_JOBS entry and returns the count', async () => {
        const { queue, calls } = makeFakeQueue();
        const count = await registerSchedules(queue);
        expect(count).toBe(SCHEDULED_JOBS.length);
        expect(calls).toHaveLength(SCHEDULED_JOBS.length);
        // Each call mirrors the entry name + pattern.
        for (const entry of SCHEDULED_JOBS) {
            const call = calls.find((c) => c.name === entry.name);
            expect(call).toBeDefined();
            expect(call?.repeat.pattern).toBe(entry.pattern);
            expect(call?.template.name).toBe(entry.name);
        }
    });

    it('includes tz only when the entry (or its options) carries one', async () => {
        const { queue, calls } = makeFakeQueue();
        await registerSchedules(queue);
        for (const entry of SCHEDULED_JOBS) {
            const tz = entry.tz ?? entry.options?.tz;
            const call = calls.find((c) => c.name === entry.name)!;
            if (tz) {
                expect(call.repeat.tz).toBe(tz);
            } else {
                expect(call.repeat).not.toHaveProperty('tz');
            }
        }
    });

    it('includes limit only when options.limit is truthy', async () => {
        const { queue, calls } = makeFakeQueue();
        await registerSchedules(queue);
        for (const entry of SCHEDULED_JOBS) {
            const call = calls.find((c) => c.name === entry.name)!;
            if (entry.options?.limit) {
                expect(call.repeat.limit).toBe(entry.options.limit);
            } else {
                expect(call.repeat).not.toHaveProperty('limit');
            }
        }
    });

    it('invokes the optional logger once per schedule', async () => {
        const { queue } = makeFakeQueue();
        const info = jest.fn();
        await registerSchedules(queue, { info });
        expect(info).toHaveBeenCalledTimes(SCHEDULED_JOBS.length);
        // Each log call carries jobName + pattern.
        expect(info.mock.calls[0][0]).toHaveProperty('jobName');
        expect(info.mock.calls[0][1]).toBe('repeatable registered');
    });
});
