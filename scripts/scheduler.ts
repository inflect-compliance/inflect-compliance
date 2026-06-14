#!/usr/bin/env tsx
/**
 * BullMQ Scheduler — Register Repeatable Jobs
 *
 * Reads the schedule definitions from `src/app-layer/jobs/schedules.ts`
 * and registers them as BullMQ repeatable jobs. Idempotent: BullMQ
 * deduplicates repeatables by job name + cron pattern.
 *
 * Usage:
 *   npx tsx scripts/scheduler.ts                # register all schedules
 *   npx tsx scripts/scheduler.ts --list         # list current repeatables
 *   npx tsx scripts/scheduler.ts --clean        # remove all repeatables
 *
 * This script runs once and exits — it is NOT a long-running process.
 * The worker (`scripts/worker.ts`) is the long-running process that
 * picks up and processes the scheduled jobs.
 *
 * Typical deployment:
 *   1. npx tsx scripts/scheduler.ts     ← run once on deploy
 *   2. npx tsx scripts/worker.ts        ← run as daemon
 *
 * @module scripts/scheduler
 */
import 'dotenv/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { QUEUE_NAME } from '../src/app-layer/jobs/types';
import { SCHEDULED_JOBS } from '../src/app-layer/jobs/schedules';
import { registerSchedules } from '../src/app-layer/jobs/register-schedules';

// ─── Logger ───

const log = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname', translateTime: 'HH:MM:ss.l' } }
        : undefined,
});

// ─── Redis ───

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
    log.fatal('REDIS_URL is not set. Cannot register schedules.');
    process.exit(1);
}

// ─── GAP-03: production encryption-key fail-fast ───────────────────
//
// The scheduler is short-lived (runs once on deploy, exits) and does
// not itself decrypt any column — it only registers BullMQ
// repeatable jobs. But it shares the prod-deploy pipeline with the
// long-running worker, so a missing or bad key here is a strong
// signal that the worker will fail too. Refusing to register
// schedules in that state surfaces the misconfiguration on the
// deploy that introduces it, not three jobs later.
//
// Awaited at the TOP of main() — previously this ran as a
// fire-and-forget IIFE at module load, so registration could begin
// (and connect to Redis) before the check resolved and before its
// `process.exit(1)` could take effect. Now the gate strictly precedes
// any registration work.
async function assertProductionEncryptionKey(): Promise<void> {
    if (process.env.NODE_ENV !== 'production') return;
    const { checkProductionEncryptionKey } = await import(
        '../src/lib/security/startup-encryption-check'
    );
    const config = checkProductionEncryptionKey(process.env);
    if (!config.ok) {
        log.fatal('[startup] FATAL: ' + config.reason);
        process.exit(1);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const listOnly = args.includes('--list');
    const cleanAll = args.includes('--clean');

    await assertProductionEncryptionKey();

    const connection = new Redis(REDIS_URL!, {
        maxRetriesPerRequest: null,
        connectTimeout: 10000,
    });

    const queue = new Queue(QUEUE_NAME, { connection });

    try {
        if (listOnly) {
            await listRepeatables(queue);
            return;
        }

        if (cleanAll) {
            await removeAll(queue);
            return;
        }

        await registerAll(queue);
    } finally {
        await queue.close();
        await connection.quit();
    }
}

async function registerAll(queue: Queue): Promise<void> {
    log.info({ count: SCHEDULED_JOBS.length }, 'registering repeatable jobs');
    // Single source of truth for the upsert shape — shared with the
    // worker's boot-time self-registration (item 28).
    await registerSchedules(queue, log);
    log.info('all schedules registered ✓');
}

async function listRepeatables(queue: Queue): Promise<void> {
    const schedulers = await queue.getJobSchedulers();
    if (schedulers.length === 0) {
        log.info('no repeatable jobs registered');
        return;
    }

    log.info({ count: schedulers.length }, 'current repeatable jobs:');
    for (const s of schedulers) {
        log.info({
            name: s.name,
            pattern: s.pattern,
            next: s.next ? new Date(s.next).toISOString() : 'not set',
        }, 'repeatable');
    }
}

async function removeAll(queue: Queue): Promise<void> {
    const schedulers = await queue.getJobSchedulers();
    log.info({ count: schedulers.length }, 'removing all repeatable jobs');

    for (const s of schedulers) {
        await queue.removeJobScheduler(s.name ?? '');
        log.info({ name: s.name }, 'removed');
    }

    log.info('all repeatables removed ✓');
}

main().catch(err => {
    log.fatal({ err }, 'scheduler failed');
    process.exit(1);
});
