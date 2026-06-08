/**
 * EI-1 — Zod schema for `TenantIdentityProvider.configJson` when
 * `type = ENTRA_ID`. Keeping the Entra shape distinct from generic OIDC lets
 * the group-sync + SCIM-Groups paths gate on `type === 'ENTRA_ID'` without
 * inspecting free-form config.
 */
import { z } from 'zod';

export const EntraProviderConfigSchema = z.object({
    /** The tenant's AAD directory tenant ID (NOT IC's tenant). */
    aadTenantId: z.string().uuid(),
    /** App-registration client ID used for the group-claims assignment. */
    clientId: z.string().uuid(),
    /**
     * 'securityGroup'   → security-group OIDs in the `groups` claim (the only
     *                     mode the resolver implements today).
     * 'applicationRole' → RESERVED, not yet implemented. The value is kept in
     *                     the enum for stored-config back-compat, but the admin
     *                     UI no longer offers it and nothing reads it — the
     *                     resolver always reads the `groups` claim. Wire App
     *                     Role (`roles` claim) handling before exposing it.
     */
    groupClaimMode: z.enum(['securityGroup', 'applicationRole']).default('securityGroup'),
    /**
     * When true, a user must belong to at least one mapped group to gain a
     * TenantMembership — access is denied otherwise (the enforce gate).
     */
    enforceGroupGate: z.boolean().default(false),
    /** Optional — restrict sign-in to these AAD email domains only. */
    allowedDomains: z.array(z.string()).optional(),
});

export type EntraProviderConfig = z.infer<typeof EntraProviderConfigSchema>;

/** Parse-or-null helper for reading a stored configJson at runtime. */
export function parseEntraConfig(raw: unknown): EntraProviderConfig | null {
    const parsed = EntraProviderConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
}
