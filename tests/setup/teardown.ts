// Prisma 7 — `new PrismaClient()` requires an adapter. The teardown
// is purely a "close anything that survived" hook; it does not need
// to issue queries. Skip the local construction and just disconnect
// any singletons the parent process has on `globalThis`.

const teardown = async () => {
    type Globals = typeof globalThis & {
        prisma?: { $disconnect?: () => Promise<void> };
        __bullmq_queue?: { close?: () => Promise<void> };
    };
    const g = globalThis as Globals;
    if (g.prisma?.$disconnect) {
        await g.prisma.$disconnect().catch(() => {});
    }
    if (g.__bullmq_queue?.close) {
        await g.__bullmq_queue.close().catch(() => {});
    }

    // Drop the per-worker DBs globalSetup created (best-effort) + clear
    // the marker. All workers have exited by now, so no live connections.
    try {
        const fs = await import('fs');
        const { Client } = await import('pg');
        const { PER_WORKER_MARKER, adminConnectionString } = await import('../helpers/db');
        const marker = JSON.parse(fs.readFileSync(PER_WORKER_MARKER, 'utf8')) as {
            perWorker: boolean; count: number; baseName: string;
        };
        if (marker.perWorker) {
            const admin = new Client({ connectionString: adminConnectionString() });
            await admin.connect();
            for (let i = 1; i <= marker.count; i++) {
                await admin
                    .query(`DROP DATABASE IF EXISTS "${marker.baseName}_w${i}" WITH (FORCE)`)
                    .catch(() => {});
            }
            await admin.end();
        }
        fs.unlinkSync(PER_WORKER_MARKER);
    } catch {
        /* marker absent / DB down — nothing to clean */
    }
};

export default teardown;
