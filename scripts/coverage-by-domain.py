"""
Aggregate coverage-summary.json into per-domain buckets.

Reads `coverage/coverage-summary.json` and bins every src file into a
domain based on the table below, then prints a markdown table with
weighted coverage percentages per domain.

Run from repo root after `npm run test:coverage`:
    python3 scripts/coverage-by-domain.py
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
SUMMARY = REPO_ROOT / "coverage" / "coverage-summary.json"


# Order matters — first matching prefix wins. Keep "Misc / utility" last.
# Path is relative to repo root and uses POSIX separators.
DOMAIN_RULES: List[Tuple[str, List[str]]] = [
    # ── Compliance core ─────────────────────────────────────────────
    ("Compliance core (controls, policies, frameworks)", [
        "src/app-layer/usecases/control/",
        "src/app-layer/usecases/control-test.ts",
        "src/app-layer/usecases/policy.ts",
        "src/app-layer/usecases/framework/",
        "src/app-layer/usecases/clause.ts",
        "src/app-layer/usecases/mapping.ts",
        "src/app-layer/usecases/traceability.ts",
        "src/app-layer/usecases/soa.ts",
        "src/app-layer/usecases/soa-checks.ts",
        "src/app-layer/usecases/gap-analysis.ts",
        "src/app-layer/usecases/compliance-trends.ts",
        "src/app-layer/repositories/ControlRepository.ts",
        "src/app-layer/repositories/ControlTemplateRepository.ts",
        "src/app-layer/repositories/PolicyRepository.ts",
        "src/app-layer/repositories/PolicyVersionRepository.ts",
        "src/app-layer/repositories/PolicyTemplateRepository.ts",
        "src/app-layer/repositories/PolicyApprovalRepository.ts",
        "src/app-layer/repositories/FrameworkRepository.ts",
        "src/app-layer/repositories/ClauseRepository.ts",
        "src/app-layer/repositories/MappingRepository.ts",
        "src/app-layer/repositories/TraceabilityRepository.ts",
        "src/app-layer/repositories/RequirementMappingRepository.ts",
    ]),
    # ── Risk ────────────────────────────────────────────────────────
    ("Risk", [
        "src/app-layer/usecases/risk.ts",
        "src/app-layer/usecases/risk-matrix-config.ts",
        "src/app-layer/usecases/risk-suggestions.ts",
        "src/app-layer/repositories/RiskRepository.ts",
        "src/app-layer/repositories/RiskTemplateRepository.ts",
    ]),
    # ── Vendor ──────────────────────────────────────────────────────
    ("Vendor", [
        "src/app-layer/usecases/vendor.ts",
        "src/app-layer/usecases/vendor-audit.ts",
        "src/app-layer/repositories/VendorRepository.ts",
        "src/app-layer/repositories/AssessmentRepository.ts",
    ]),
    # ── Asset ───────────────────────────────────────────────────────
    ("Asset", [
        "src/app-layer/usecases/asset.ts",
        "src/app-layer/repositories/AssetRepository.ts",
    ]),
    # ── Evidence + files ────────────────────────────────────────────
    ("Evidence + files", [
        "src/app-layer/usecases/evidence.ts",
        "src/app-layer/usecases/evidence-maintenance.ts",
        "src/app-layer/usecases/evidence-retention.ts",
        "src/app-layer/usecases/file.ts",
        "src/app-layer/usecases/data-portability.ts",
        "src/app-layer/repositories/EvidenceRepository.ts",
        "src/app-layer/repositories/EvidenceBundleRepository.ts",
        "src/app-layer/repositories/FileRepository.ts",
    ]),
    # ── Work items (tasks / findings / issues) ──────────────────────
    ("Work items (tasks, findings, issues)", [
        "src/app-layer/usecases/task.ts",
        "src/app-layer/usecases/finding.ts",
        "src/app-layer/usecases/issue.ts",
        "src/app-layer/usecases/due-planning.ts",
        "src/app-layer/repositories/TaskRepository.ts",
        "src/app-layer/repositories/WorkItemRepository.ts",
        "src/app-layer/repositories/FindingRepository.ts",
        "src/app-layer/repositories/IssueRepository.ts",
    ]),
    # ── Audit + audit trail ─────────────────────────────────────────
    ("Audit + audit trail", [
        "src/app-layer/usecases/audit.ts",
        "src/app-layer/usecases/auditLog.ts",
        "src/app-layer/usecases/audit-hardening.ts",
        "src/app-layer/usecases/audit-readiness.ts",
        "src/app-layer/usecases/audit-readiness/",
        "src/app-layer/usecases/audit-readiness-scoring.ts",
        "src/app-layer/usecases/org-audit.ts",
        "src/app-layer/repositories/AuditRepository.ts",
        "src/app-layer/repositories/AuditLogRepository.ts",
        "src/app-layer/events/",
    ]),
    # ── Test plans + runs (compliance testing internals) ───────────
    ("Test plans + runs", [
        "src/app-layer/usecases/test-hardening.ts",
        "src/app-layer/usecases/test-readiness.ts",
        "src/app-layer/repositories/TestPlanRepository.ts",
        "src/app-layer/repositories/TestRunRepository.ts",
        "src/app-layer/repositories/TestEvidenceRepository.ts",
    ]),
    # ── Reports / dashboards / portfolio ───────────────────────────
    ("Reports + dashboards + portfolio", [
        "src/app-layer/usecases/dashboard.ts",
        "src/app-layer/usecases/portfolio.ts",
        "src/app-layer/usecases/portfolio-data.ts",
        "src/app-layer/usecases/report.ts",
        "src/app-layer/usecases/org-dashboard-presets.ts",
        "src/app-layer/usecases/org-dashboard-widgets.ts",
        "src/app-layer/repositories/PortfolioRepository.ts",
        "src/app-layer/repositories/DashboardRepository.ts",
        "src/app-layer/repositories/ReportRepository.ts",
    ]),
    # ── Tenant lifecycle + org management ──────────────────────────
    ("Tenant lifecycle + org management", [
        "src/app-layer/usecases/onboarding.ts",
        "src/app-layer/usecases/onboarding-automation.ts",
        "src/app-layer/usecases/tenant-admin.ts",
        "src/app-layer/usecases/tenant-invites.ts",
        "src/app-layer/usecases/tenant-lifecycle.ts",
        "src/app-layer/usecases/custom-roles.ts",
        "src/app-layer/usecases/org-invites.ts",
        "src/app-layer/usecases/org-members.ts",
        "src/app-layer/usecases/org-provisioning.ts",
        "src/app-layer/usecases/org-tenants.ts",
        "src/app-layer/repositories/OnboardingRepository.ts",
    ]),
    # ── Auth + security + sessions ─────────────────────────────────
    ("Auth + security + sessions", [
        "src/app-layer/usecases/mfa.ts",
        "src/app-layer/usecases/mfa-challenge.ts",
        "src/app-layer/usecases/mfa-enrollment.ts",
        "src/app-layer/usecases/session-security.ts",
        "src/app-layer/usecases/sso.ts",
        "src/app-layer/usecases/scim-users.ts",
        "src/app-layer/usecases/api-keys.ts",
        "src/app-layer/policies/",
        "src/app-layer/repositories/SsoConfigRepository.ts",
        "src/app-layer/repositories/IdentityLinkRepository.ts",
    ]),
    # ── Automation + integrations + notifications ──────────────────
    ("Automation + integrations + notifications", [
        "src/app-layer/usecases/integrations.ts",
        "src/app-layer/usecases/library-sync.ts",
        "src/app-layer/usecases/notification.ts",
        "src/app-layer/usecases/webhook-processor.ts",
        "src/app-layer/automation/",
        "src/app-layer/integrations/",
        "src/app-layer/services/",
        "src/app-layer/jobs/",
        "src/app-layer/repositories/NotificationRepository.ts",
    ]),
    # ── Cross-cutting lifecycle (soft delete + editable) ───────────
    ("Cross-cutting lifecycle (soft-delete / editable)", [
        "src/app-layer/usecases/editable-lifecycle-usecase.ts",
        "src/app-layer/usecases/soft-delete-lifecycle.ts",
        "src/app-layer/usecases/soft-delete-operations.ts",
    ]),
    # ── lib infrastructure (catch-all for src/lib/*) ───────────────
    ("lib infrastructure", [
        "src/lib/",
    ]),
    # ── App layer (anything in app-layer not bucketed yet) ─────────
    ("App layer — uncategorized", [
        "src/app-layer/",
    ]),
]


def domain_for(path: str) -> str:
    for label, rules in DOMAIN_RULES:
        for rule in rules:
            if path.startswith(rule) or path == rule.rstrip("/"):
                return label
    return "Other"


def main() -> int:
    if not SUMMARY.exists():
        print(f"ERROR: {SUMMARY} not found — run `npm run test:coverage` first.", file=sys.stderr)
        return 1

    data = json.loads(SUMMARY.read_text())
    buckets: Dict[str, Dict[str, Dict[str, int]]] = defaultdict(
        lambda: {
            "statements": {"total": 0, "covered": 0},
            "branches": {"total": 0, "covered": 0},
            "functions": {"total": 0, "covered": 0},
            "lines": {"total": 0, "covered": 0},
            "files": {"total": 0, "covered": 0},  # files = with any coverage
        }
    )

    for abs_path, m in data.items():
        if abs_path == "total":
            continue
        # Normalize to repo-relative POSIX path.
        try:
            rel = os.path.relpath(abs_path, REPO_ROOT).replace(os.sep, "/")
        except ValueError:
            rel = abs_path
        if not rel.startswith("src/"):
            continue
        label = domain_for(rel)
        b = buckets[label]
        for metric in ("statements", "branches", "functions", "lines"):
            b[metric]["total"] += m[metric]["total"]
            b[metric]["covered"] += m[metric]["covered"]
        b["files"]["total"] += 1
        if m["statements"]["covered"] > 0:
            b["files"]["covered"] += 1

    def pct(b: Dict[str, int]) -> float:
        return (b["covered"] / b["total"] * 100.0) if b["total"] else 100.0

    # Print markdown table
    print("| Domain | Files | Stmts % | Branch % | Func % | Lines % | Covered stmts / total |")
    print("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    # Sort by statement % ascending so worst-covered domains surface first.
    rows = sorted(
        buckets.items(),
        key=lambda kv: pct(kv[1]["statements"]),
    )
    for label, b in rows:
        print(
            f"| {label} | {b['files']['total']} "
            f"| {pct(b['statements']):.1f} "
            f"| {pct(b['branches']):.1f} "
            f"| {pct(b['functions']):.1f} "
            f"| {pct(b['lines']):.1f} "
            f"| {b['statements']['covered']}/{b['statements']['total']} |"
        )

    # Global
    g = data["total"]
    print()
    print(
        f"**Global:** stmts {g['statements']['pct']:.2f} %, "
        f"branches {g['branches']['pct']:.2f} %, "
        f"functions {g['functions']['pct']:.2f} %, "
        f"lines {g['lines']['pct']:.2f} %"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
