/**
 * aws-posture → IC control mapping (ORIGINAL — foundation subset).
 *
 * Maps a Powerpipe (steampipe-mod-aws-compliance, Apache-2.0) benchmark control
 * id to the IC framework requirement code(s) it helps satisfy. This is an
 * ORIGINALLY-authored thin crosswalk for the subset IC supports today — it does
 * NOT transcribe the mod's HCL/SQL or its embedded framework mappings (which are
 * not cleanly extractable). The join key is IC's OWN library requirement code
 * (`FrameworkRequirement.code`), so the mapping resolves against installed
 * frameworks with no dangling refs.
 *
 * FRAMEWORK NOTE: IC's library has SOC 2 (codes CC1.1/CC2.1/CC3.1/CC5.1/CC6.1/
 * CC7.1/CC8.1) but does NOT yet have NIST CSF 2.0 as a requirement library
 * (it exists only as the maturity-radar domain enum). The foundation therefore
 * maps to SOC 2. When a NIST CSF 2.0 framework is seeded, add a `nistCsf` key
 * to these entries — the connector + runtime resolver are framework-agnostic.
 *
 * Powerpipe control ids below are the stable check names emitted in the
 * benchmark JSON (`control.<name>`); each maps to the SOC 2 Trust Services
 * Criterion the check most directly evidences (CC6 logical access, CC7 system
 * operations/monitoring, CC8 change management, CC3 risk assessment).
 */

export interface AwsPostureControlMapEntry {
    /** Human label for the check (UI + audit trail). */
    label: string;
    /** IC SOC 2 requirement codes this passing check evidences. */
    soc2: string[];
}

/** Powerpipe control id → IC requirement codes. */
export const AWS_POSTURE_CONTROL_MAP: Record<string, AwsPostureControlMapEntry> = {
    // ── Logical & physical access (CC6) ──
    iam_root_user_mfa_enabled: { label: 'Root account MFA enabled', soc2: ['CC6.1'] },
    iam_user_mfa_enabled: { label: 'IAM users have MFA', soc2: ['CC6.1'] },
    iam_root_user_no_access_keys: { label: 'No root access keys', soc2: ['CC6.1'] },
    iam_password_policy_strong: { label: 'Strong IAM password policy', soc2: ['CC6.1'] },
    iam_user_no_inline_attached_admin_policy: { label: 'No inline admin policies', soc2: ['CC6.1'] },
    s3_bucket_public_access_blocked: { label: 'S3 public access blocked', soc2: ['CC6.1'] },
    s3_bucket_default_encryption_enabled: { label: 'S3 default encryption', soc2: ['CC6.1'] },
    ec2_instance_no_public_ip: { label: 'EC2 instances not public', soc2: ['CC6.1'] },
    rds_db_instance_encryption_at_rest_enabled: { label: 'RDS encryption at rest', soc2: ['CC6.1'] },
    vpc_security_group_restrict_ingress_ssh_all: { label: 'SSH not open to the world', soc2: ['CC6.1'] },

    // ── System operations & monitoring (CC7) ──
    cloudtrail_multi_region_trail_enabled: { label: 'Multi-region CloudTrail', soc2: ['CC7.1'] },
    cloudtrail_trail_logs_encrypted: { label: 'CloudTrail logs encrypted', soc2: ['CC7.1', 'CC6.1'] },
    cloudwatch_alarm_action_enabled: { label: 'CloudWatch alarm actions enabled', soc2: ['CC7.1'] },
    guardduty_enabled: { label: 'GuardDuty enabled', soc2: ['CC7.1'] },
    securityhub_enabled: { label: 'Security Hub enabled', soc2: ['CC7.1'] },
    vpc_flow_logs_enabled: { label: 'VPC flow logs enabled', soc2: ['CC7.1'] },

    // ── Change management (CC8) ──
    config_enabled_all_regions: { label: 'AWS Config recording all regions', soc2: ['CC8.1', 'CC7.1'] },
    cloudformation_stack_drift_detection: { label: 'CloudFormation drift detection', soc2: ['CC8.1'] },

    // ── Risk assessment (CC3) ──
    inspector_enabled: { label: 'Amazon Inspector enabled', soc2: ['CC3.1', 'CC7.1'] },
};

/** All distinct IC requirement codes referenced by the map (for ratchet resolution). */
export function allMappedRequirementCodes(): { soc2: string[] } {
    const soc2 = new Set<string>();
    for (const entry of Object.values(AWS_POSTURE_CONTROL_MAP)) {
        for (const c of entry.soc2) soc2.add(c);
    }
    return { soc2: [...soc2] };
}

/** SOC 2 codes a given Powerpipe control id evidences (empty if unmapped). */
export function soc2CodesForControl(powerpipeControlId: string): string[] {
    return AWS_POSTURE_CONTROL_MAP[powerpipeControlId]?.soc2 ?? [];
}
