/**
 * gcp-posture → IC control mapping (ORIGINAL — foundation subset, PR-3).
 *
 * Maps a Powerpipe (steampipe-mod-gcp-compliance, Apache-2.0) benchmark
 * control id to IC framework requirement code(s). ORIGINALLY authored against
 * IC's OWN library codes (SOC 2 + NIST CSF 2.0) — no mod HCL/SQL transcribed.
 */
import type { CloudPostureControlMapEntry } from '@/app-layer/integrations/cloud-posture/powerpipe-core';

export const GCP_POSTURE_CONTROL_MAP: Record<string, CloudPostureControlMapEntry> = {
    // ── Identity & access (CC6 / PR.AA) ──
    iam_no_service_account_has_admin_privilege: { label: 'No service account has admin', soc2: ['CC6.1'], nistCsf: ['PR.AA-01'] },
    iam_user_not_use_service_account_user_role: { label: 'No user SA-user role at project', soc2: ['CC6.1'], nistCsf: ['PR.AA-01'] },
    iam_service_account_no_user_managed_key: { label: 'No user-managed SA keys', soc2: ['CC6.1'], nistCsf: ['PR.AA-01'] },
    kms_key_not_publicly_accessible: { label: 'KMS keys not public', soc2: ['CC6.1'], nistCsf: ['PR.DS-01'] },
    // ── Data protection (CC6 / PR.DS) ──
    storage_bucket_uniform_bucket_level_access_enabled: { label: 'Uniform bucket-level access', soc2: ['CC6.1'], nistCsf: ['PR.AA-01'] },
    storage_bucket_not_publicly_accessible: { label: 'Buckets not public', soc2: ['CC6.1'], nistCsf: ['PR.AA-01'] },
    sql_instance_encrypted_with_cmek: { label: 'Cloud SQL CMEK encryption', soc2: ['CC6.1'], nistCsf: ['PR.DS-01'] },
    // ── Monitoring & detection (CC7 / DE.CM) ──
    logging_sink_configured_for_all_resource: { label: 'Logging sink configured', soc2: ['CC7.1'], nistCsf: ['DE.CM-01'] },
    audit_logging_configured_for_all_service: { label: 'Audit logging enabled', soc2: ['CC7.1'], nistCsf: ['DE.CM-01'] },
    alert_policy_configured_project_ownership_assignment: { label: 'Alert on ownership changes', soc2: ['CC7.1'], nistCsf: ['DE.CM-01'] },
    // ── Network (CC6 / PR.AA) ──
    compute_firewall_rule_restrict_ingress_ssh_all: { label: 'SSH not open to the world', soc2: ['CC6.1'], nistCsf: ['PR.AA-01'] },
    compute_instance_no_public_ip: { label: 'Instances not public', soc2: ['CC6.1'], nistCsf: ['PR.AA-01'] },
};

export function allMappedRequirementCodes(): { soc2: string[]; nistCsf: string[] } {
    const soc2 = new Set<string>();
    const nistCsf = new Set<string>();
    for (const e of Object.values(GCP_POSTURE_CONTROL_MAP)) {
        e.soc2.forEach((c) => soc2.add(c));
        e.nistCsf?.forEach((c) => nistCsf.add(c));
    }
    return { soc2: [...soc2], nistCsf: [...nistCsf] };
}
