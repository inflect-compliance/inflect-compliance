/**
 * Control-specific RBAC policies.
 */
import { RequestContext } from '../types';
import { forbidden } from '@/lib/errors/types';

/** All roles can read controls */
export function assertCanReadControls(ctx: RequestContext) {
    if (!ctx.permissions.canRead) {
        throw forbidden('You do not have permission to view controls.');
    }
}

/** ADMIN/EDITOR can create controls */
export function assertCanCreateControl(ctx: RequestContext) {
    if (!ctx.permissions.canWrite) {
        throw forbidden('You do not have permission to create controls.');
    }
}

/** ADMIN/EDITOR can update controls */
export function assertCanUpdateControl(ctx: RequestContext) {
    if (!ctx.permissions.canWrite) {
        throw forbidden('You do not have permission to update controls.');
    }
}

/** ADMIN/EDITOR can link evidence */
export function assertCanLinkEvidence(ctx: RequestContext) {
    if (!ctx.permissions.canWrite) {
        throw forbidden('You do not have permission to link evidence to controls.');
    }
}

/** ADMIN/EDITOR can set control applicability */
export function assertCanSetApplicability(ctx: RequestContext) {
    if (!ctx.permissions.canWrite) {
        throw forbidden('You do not have permission to set control applicability.');
    }
}

/** ADMIN/EDITOR can map frameworks */
export function assertCanMapFramework(ctx: RequestContext) {
    if (!ctx.permissions.canWrite) {
        throw forbidden('You do not have permission to map framework requirements.');
    }
}
