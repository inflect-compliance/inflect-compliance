'use client';

import { createContext, useContext, useCallback } from 'react';
import type { Role } from '@prisma/client';
import type { PermissionSet } from '@/lib/permissions';

// ─── Tenant context ───

export interface TenantContextValue {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    /** RQ3-OB-A — display currency for monetary surfaces (default €). */
    currencySymbol?: string;
    role: Role;
    plan?: string;
    permissions: {
        canRead: boolean;
        canWrite: boolean;
        canAdmin: boolean;
        canAudit: boolean;
        canExport: boolean;
    };
    appPermissions: PermissionSet;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({
    value,
    children,
}: {
    value: TenantContextValue;
    children: React.ReactNode;
}) {
    return (
        <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
    );
}

export function useTenantContext(): TenantContextValue {
    const ctx = useContext(TenantContext);
    if (!ctx) {
        throw new Error('useTenantContext must be used within a TenantProvider');
    }
    return ctx;
}

/**
 * Hook to retrieve granular app permissions for UI rendering logic.
 */
export function usePermissions(): PermissionSet {
    return useTenantContext().appPermissions;
}

/**
 * Build a tenant-scoped href: `/t/<slug>/<path>`
 */
export function useTenantHref() {
    const { tenantSlug } = useTenantContext();
    return useCallback(
        (path: string) => `/t/${tenantSlug}${path.startsWith('/') ? path : `/${path}`}`,
        [tenantSlug]
    );
}

/**
 * Build a tenant-scoped API URL: `/api/t/<slug>/<path>`
 */
export function useTenantApiUrl() {
    const { tenantSlug } = useTenantContext();
    return useCallback(
        (path: string) => `/api/t/${tenantSlug}${path.startsWith('/') ? path : `/${path}`}`,
        [tenantSlug]
    );
}

// ─── RQ3-OB-A — tenant-bound money formatter ─────────────────────────
//
// One symbol per tenant, one formatter per product. Components call
// `useMoneyFormatter()` instead of importing formatCompactCurrency
// with a hardcoded symbol — the hook closes over the tenant's
// configured currencySymbol (default €).

import { formatCompactCurrency } from '@/lib/risk-coherence';

export function useMoneyFormatter(): (v: number | null | undefined) => string {
    const ctx = useTenantContext();
    const symbol = ctx.currencySymbol ?? '€';
    return useCallback((v: number | null | undefined) => formatCompactCurrency(v, symbol), [symbol]);
}
