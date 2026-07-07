/**
 * Integration Provider Bootstrap
 *
 * Registers all available integration providers with the global registries.
 * Import this module once at application startup to enable all providers.
 *
 * Two registries are populated:
 *   - `registry` (ProviderRegistry) — automation key routing for checks/webhooks
 *   - `integrationRegistry` (IntegrationRegistry) — client + mapper bundles for CRUD
 *
 * Usage:
 *   import '@/app-layer/integrations/bootstrap';
 *
 * @module integrations/bootstrap
 */
import { registry, integrationRegistry } from './registry';
import { GitHubProvider } from './providers/github';
import { AwsPostureProvider } from './aws-posture-provider';
import { OktaProvider } from './providers/okta';
import { GoogleWorkspaceProvider } from './providers/google-workspace';
import { AzurePostureProvider } from './providers/azure-posture-provider';
import { GcpPostureProvider } from './providers/gcp-posture-provider';
import { BambooHrProvider } from './providers/hris';
import { PersonnelProvider } from './providers/personnel';
import { GitHubClient } from './providers/github-client';
import { GitHubBranchProtectionMapper } from './providers/github-mapper';
import { GitHubSyncOrchestrator } from './providers/github/sync';
import { SharePointClient } from './providers/sharepoint/client';
import { SharePointMapper } from './providers/sharepoint/mapper';

// ─── ProviderRegistry: Automation Key Routing ────────────────────────

// GitHub — branch protection, repo security
registry.register(new GitHubProvider());

// AWS cloud posture — Powerpipe steampipe-mod-aws-compliance benchmark evidence.
registry.register(new AwsPostureProvider());

// Okta — directory sync + identity posture checks (MFA, dormant admins, …).
registry.register(new OktaProvider());

// Google Workspace — directory sync + identity posture checks.
registry.register(new GoogleWorkspaceProvider());

// Azure cloud posture — Powerpipe steampipe-mod-azure-compliance benchmark evidence.
registry.register(new AzurePostureProvider());

// GCP cloud posture — Powerpipe steampipe-mod-gcp-compliance benchmark evidence.
registry.register(new GcpPostureProvider());

// BambooHR — HRIS roster sync into the personnel hub.
registry.register(new BambooHrProvider());

// Personnel — internal checks (offboarded access, onboarding SLA, manager coverage).
registry.register(new PersonnelProvider());

// Future providers:
// registry.register(new GitLabProvider());

// ─── IntegrationRegistry: Client + Mapper Bundles ────────────────────

integrationRegistry.register({
    name: 'github',
    type: 'scm',
    displayName: 'GitHub',
    description: 'GitHub repository compliance — branch protection, security settings',
    clientClass: GitHubClient,
    mapperClass: GitHubBranchProtectionMapper,
    orchestratorClass: GitHubSyncOrchestrator,
});

// SharePoint — document libraries: evidence import + policy sync (SP-1).
// No orchestratorClass yet — the sync orchestrator lands in SP-3.
integrationRegistry.register({
    name: 'sharepoint',
    type: 'document',
    displayName: 'Microsoft SharePoint',
    description: 'SharePoint document libraries — evidence import, policy sync, audit-pack export',
    clientClass: SharePointClient,
    mapperClass: SharePointMapper,
});

// Future bundles:
// integrationRegistry.register({ name: 'jira', type: 'itsm', ... });
// integrationRegistry.register({ name: 'servicenow', type: 'itsm', ... });

