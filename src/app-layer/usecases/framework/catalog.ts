 
import { RequestContext } from '../../types';
import { assertCanViewFrameworks } from '../../policies/framework.policies';
import { notFound } from '@/lib/errors/types';
import { prisma } from '@/lib/prisma';

// в”Ђв”Ђв”Ђ Framework Catalog (global, no tenant filter needed) в”Ђв”Ђв”Ђ

export async function listFrameworks(ctx: RequestContext) {
    assertCanViewFrameworks(ctx);
    const db = prisma;
    return db.framework.findMany({
        include: { _count: { select: { requirements: true, packs: true } } },
        orderBy: { key: 'asc' },
    });
}

/**
 * Installable-framework catalog for the onboarding wizard.
 *
 * Returns every framework that carries at least one control pack — i.e.
 * the frameworks a tenant can actually "set up" (a pack is what install
 * turns into a baseline control register). Frameworks that exist as
 * requirement-only reference data (no pack) are intentionally excluded:
 * selecting one in onboarding would install nothing.
 *
 * The shape is the minimal projection the picker cards need. As packs are
 * authored for more frameworks they appear here automatically — the
 * onboarding picker is data-driven, never a hand-maintained list.
 */
export async function listInstallableFrameworks(ctx: RequestContext) {
    assertCanViewFrameworks(ctx);
    const db = prisma;
    const frameworks = await db.framework.findMany({
        where: { packs: { some: {} } },
        include: {
            _count: { select: { requirements: true } },
            packs: { select: { _count: { select: { templateLinks: true } } } },
        },
        orderBy: { key: 'asc' },
    });
    return frameworks.map((f) => ({
        key: f.key,
        name: f.name,
        version: f.version,
        description: f.description,
        kind: f.kind,
        requirementCount: f._count.requirements,
        controlCount: f.packs.reduce((sum, p) => sum + p._count.templateLinks, 0),
    }));
}

export async function getFramework(ctx: RequestContext, frameworkKey: string, version?: string) {
    assertCanViewFrameworks(ctx);
    const db = prisma;
    const where = version ? { key_version: { key: frameworkKey, version } } : undefined;
    const fw = where
        ? await db.framework.findUnique({ where, include: { _count: { select: { requirements: true, packs: true } } } })
        : await db.framework.findFirst({ where: { key: frameworkKey }, include: { _count: { select: { requirements: true, packs: true } } } });
    if (!fw) throw notFound('Framework not found');
    return fw;
}

export async function getFrameworkRequirements(ctx: RequestContext, frameworkKey: string, version?: string) {
    assertCanViewFrameworks(ctx);
    const db = prisma;
    const fw = version
        ? await db.framework.findUnique({ where: { key_version: { key: frameworkKey, version } } })
        : await db.framework.findFirst({ where: { key: frameworkKey } });
    if (!fw) throw notFound('Framework not found');
    return db.frameworkRequirement.findMany({
        where: { frameworkId: fw.id },
        orderBy: { sortOrder: 'asc' },
    });
}

export async function listFrameworkPacks(ctx: RequestContext, frameworkKey: string, version?: string) {
    assertCanViewFrameworks(ctx);
    const db = prisma;
    const fw = version
        ? await db.framework.findUnique({ where: { key_version: { key: frameworkKey, version } } })
        : await db.framework.findFirst({ where: { key: frameworkKey } });
    if (!fw) throw notFound('Framework not found');
    return db.frameworkPack.findMany({
        where: { frameworkId: fw.id },
        include: { _count: { select: { templateLinks: true } } },
    });
}
