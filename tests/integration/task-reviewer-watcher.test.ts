/**
 * TP-2 — behavioural integration for the reviewer sign-off gate + the
 * watcher notification fan-out. Live DB (project convention).
 *
 *   • A task WITH a reviewer cannot close directly from an active state:
 *     it must pass through IN_REVIEW, and only the reviewer may sign off.
 *   • CANCELED is exempt (cancelling is not completing).
 *   • A task WITHOUT a reviewer closes in one step (unchanged).
 *   • Watching a task delivers comment/status/assign activity to the
 *     watcher's bell (a Notification row), never to the actor.
 */
import { PrismaClient, Role, MembershipStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { DB_URL, DB_AVAILABLE } from './db-helper';
import { hashForLookup } from '@/lib/security/encryption';
import { makeRequestContext } from '../helpers/make-context';
import { createTask, setTaskStatus, addTaskWatcher, addTaskComment } from '@/app-layer/usecases/task';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
const describeFn = DB_AVAILABLE ? describe : describe.skip;

const TAG = `trw-${randomUUID().slice(0, 8)}`;
const TENANT = `t-${TAG}`;

let reviewerId: string;
let actorId: string;
let ctxActor: ReturnType<typeof makeRequestContext>;
let ctxReviewer: ReturnType<typeof makeRequestContext>;

async function makeUser(label: string): Promise<string> {
    const email = `${TAG}-${label}@example.test`;
    const u = await db.user.create({ data: { email, emailHash: hashForLookup(email) } });
    await db.tenantMembership.create({
        data: { tenantId: TENANT, userId: u.id, role: Role.OWNER, status: MembershipStatus.ACTIVE },
    });
    return u.id;
}

describeFn('task reviewer gate + watcher fan-out (integration)', () => {
    beforeAll(async () => {
        await db.tenant.upsert({ where: { id: TENANT }, update: {}, create: { id: TENANT, name: `t ${TAG}`, slug: TENANT } });
        actorId = await makeUser('actor');
        reviewerId = await makeUser('reviewer');
        ctxActor = makeRequestContext('OWNER', { tenantId: TENANT, tenantSlug: TENANT, userId: actorId });
        ctxReviewer = makeRequestContext('OWNER', { tenantId: TENANT, tenantSlug: TENANT, userId: reviewerId });
    });

    afterAll(async () => {
        try {
            for (const t of ['Notification', 'TaskWatcher', 'TaskComment', 'Task']) {
                await db.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, TENANT);
            }
            await db.$executeRawUnsafe(`DELETE FROM "TenantMembership" WHERE "tenantId" = $1`, TENANT);
            await db.$executeRawUnsafe(`DELETE FROM "User" WHERE "id" = ANY($1)`, [actorId, reviewerId]);
            await db.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE "id" = $1`, TENANT);
        } catch (e) { void e; }
        await db.$disconnect().catch(() => {});
    });

    // ─── Reviewer sign-off gate ──────────────────────────────────────

    it('a reviewed task cannot close directly — it must pass through IN_REVIEW', async () => {
        const task = await createTask(ctxActor, { title: 'Reviewed task', type: 'TASK', reviewerUserId: reviewerId });
        await expect(
            setTaskStatus(ctxActor, task.id, 'CLOSED', 'done'),
        ).rejects.toThrow(/IN_REVIEW/);
    });

    it('only the reviewer can sign off an IN_REVIEW task to a terminal state', async () => {
        const task = await createTask(ctxActor, { title: 'Needs sign-off', type: 'TASK', reviewerUserId: reviewerId });
        // Submit for review (OPEN → IN_REVIEW) — anyone with write can.
        await setTaskStatus(ctxActor, task.id, 'IN_REVIEW');
        // A non-reviewer cannot complete it.
        await expect(
            setTaskStatus(ctxActor, task.id, 'CLOSED', 'done'),
        ).rejects.toThrow(/reviewer/i);
        // The reviewer signs off.
        const closed = await setTaskStatus(ctxReviewer, task.id, 'CLOSED', 'looks good');
        expect(closed.status).toBe('CLOSED');
    });

    it('CANCELED is exempt from the reviewer gate (cancelling is not completing)', async () => {
        const task = await createTask(ctxActor, { title: 'To cancel', type: 'TASK', reviewerUserId: reviewerId });
        const canceled = await setTaskStatus(ctxActor, task.id, 'CANCELED', 'no longer needed');
        expect(canceled.status).toBe('CANCELED');
    });

    it('a task WITHOUT a reviewer still closes in one step', async () => {
        const task = await createTask(ctxActor, { title: 'No reviewer', type: 'TASK' });
        const closed = await setTaskStatus(ctxActor, task.id, 'CLOSED', 'done');
        expect(closed.status).toBe('CLOSED');
    });

    // ─── Watcher fan-out ─────────────────────────────────────────────

    it('a status change notifies the watcher (bell), not the actor', async () => {
        const task = await createTask(ctxActor, { title: 'Watched task', type: 'TASK' });
        await addTaskWatcher(ctxActor, task.id, reviewerId); // reviewer is watching

        await setTaskStatus(ctxActor, task.id, 'IN_PROGRESS');

        const watcherNotif = await db.notification.findFirst({
            where: { tenantId: TENANT, userId: reviewerId, type: 'TASK_WATCH_UPDATE' },
        });
        expect(watcherNotif).not.toBeNull();
        expect(watcherNotif!.message).toContain('OPEN → IN_PROGRESS');

        // The actor (who made the change) is NOT notified as a watcher.
        const actorNotif = await db.notification.findFirst({
            where: { tenantId: TENANT, userId: actorId, type: 'TASK_WATCH_UPDATE' },
        });
        expect(actorNotif).toBeNull();
    });

    it('a comment notifies the watcher', async () => {
        const task = await createTask(ctxActor, { title: 'Commented task', type: 'TASK' });
        await addTaskWatcher(ctxActor, task.id, reviewerId);

        await addTaskComment(ctxActor, task.id, 'please review the attached log');

        const notif = await db.notification.findFirst({
            where: { tenantId: TENANT, userId: reviewerId, type: 'TASK_WATCH_UPDATE', message: { contains: 'comment' } },
        });
        expect(notif).not.toBeNull();
    });
});
