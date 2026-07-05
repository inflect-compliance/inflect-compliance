"use client";

/**
 * Read-only activity feed for the control / task side-panel "Activity" tab.
 * Fetches the entity's hash-chained audit entries (newest first) and renders
 * each as a plain-language sentence — "Dana Lee changed the status · 2 hours
 * ago" — rather than a raw action-code log. Shared by both edit panels.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatRelativeTime } from "@/lib/format-date";

interface ActivityEntry {
    id: string;
    action: string;
    details?: string | null;
    createdAt: string | Date;
    user?: { name?: string | null; email?: string | null } | null;
}

// Action code → natural verb phrase ("{actor} {phrase}"). Falls back to the
// lowercased, space-separated code so an unmapped action still reads as a
// sentence ("Dana Lee status changed") rather than "STATUS_CHANGED".
const ACTION_PHRASE: Record<string, string> = {
    CREATED: "created this",
    UPDATED: "updated the details",
    EDITED: "updated the details",
    STATUS_CHANGED: "changed the status",
    STATE_CHANGED: "changed the status",
    ASSIGNED: "changed the assignee",
    ASSIGNEE_CHANGED: "changed the assignee",
    REASSIGNED: "reassigned it",
    OWNER_CHANGED: "changed the owner",
    DUE_DATE_CHANGED: "changed the due date",
    PRIORITY_CHANGED: "changed the priority",
    SEVERITY_CHANGED: "changed the severity",
    EVIDENCE_ADDED: "added evidence",
    EVIDENCE_UPLOADED: "uploaded evidence",
    EVIDENCE_LINKED: "linked evidence",
    EVIDENCE_REMOVED: "removed evidence",
    EVIDENCE_DETACHED: "removed evidence",
    COMMENT_ADDED: "left a comment",
    COMMENTED: "left a comment",
    LINKED: "linked an item",
    UNLINKED: "removed a link",
    ARCHIVED: "archived it",
    DELETED: "deleted this",
    TASK_CREATED: "added a task",
    TASK_COMPLETED: "completed a task",
    TEST_COMPLETED: "logged a test result",
    TEST_LOGGED: "logged a test result",
    TEST_PASSED: "logged a passing test",
    TEST_FAILED: "logged a failing test",
};

// Audit actions are entity-prefixed (CONTROL_OWNER_CHANGED, TASK_UPDATED, …).
// Strip the leading entity so the shared verb phrases match.
const ENTITY_PREFIX = /^(CONTROL|TASK|RISK|ASSET|POLICY|VENDOR|AUDIT|EVIDENCE)_/;

const phraseFor = (action: string): string => {
    const up = action?.toUpperCase?.() ?? "";
    return (
        ACTION_PHRASE[up] ??
        ACTION_PHRASE[up.replace(ENTITY_PREFIX, "")] ??
        (action ?? "").replace(/_/g, " ").toLowerCase()
    );
};

/**
 * Reduce a raw audit `details` string to NARRATIVE ONLY — never code.
 *
 * Audit details are authored as "<human phrase> Context: {json}", and some
 * carry a raw change-dump (`{"name":…,"category":…}`) or a bare id
 * ("Owner set to: cmq12y…"). The Activity tab must read as prose, so we:
 *   1. cut the machine "Context: {…}" suffix,
 *   2. drop any embedded JSON object/array blob,
 *   3. strip raw uuid / cuid identifier tokens,
 *   4. trim leftover assignment labels / dangling punctuation, and
 *   5. drop the whole detail unless real words (or a date/number) survive —
 *      a lone leftover label like "Owner" is noise the verb phrase already says.
 */
export function humanizeDetail(raw?: string | null): string | null {
    if (!raw) return null;
    let s = raw.split(/\s*Context:\s*/i)[0];
    s = s.replace(/\{[\s\S]*\}/g, " ").replace(/\[[\s\S]*\]/g, " ");
    s = s.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, " ");
    s = s.replace(/\bc[a-z0-9]{20,}\b/gi, " ");
    s = s.replace(/\s+/g, " ").trim();
    // Drop a trailing "… set to:" / "… changed to:" assignment label left
    // behind once its id was stripped.
    s = s.replace(/\b[\w ]*\b(set|changed|assigned|updated)\s+to\s*:?\s*$/i, "").trim();
    // Trim dangling separators/punctuation at either end.
    s = s.replace(/^[—\-:,.\s]+|[—\-:,\s]+$/g, "").trim();
    if (!s) return null;
    // A lone short label (no second word, no number) carries no narrative.
    if (s.split(/\s+/).filter(Boolean).length < 2 && !/\d/.test(s)) return null;
    return s;
}

export function PanelActivityFeed({
    tenantSlug,
    endpoint,
}: {
    tenantSlug: string;
    /** Tenant-scoped path, e.g. `/controls/{id}/activity` or `/tasks/{id}/activity`. */
    endpoint: string;
}) {
    const tx = useTranslations("controls");
    const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let active = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEntries(null);
        setError(false);
        fetch(`/api/t/${tenantSlug}${endpoint}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
            .then((data) => {
                if (!active) return;
                setEntries(Array.isArray(data) ? data : (data?.rows ?? []));
            })
            .catch(() => active && setError(true));
        return () => {
            active = false;
        };
    }, [tenantSlug, endpoint]);

    if (error) {
        return <p className="py-3 text-xs text-content-error">{tx("detail.activity.error")}</p>;
    }
    if (entries === null) {
        return <p className="py-3 text-xs text-content-subtle">{tx("detail.activity.loading")}</p>;
    }
    if (entries.length === 0) {
        return <p className="py-3 text-xs text-content-subtle">{tx("detail.activity.empty")}</p>;
    }

    // Entries only render after the client fetch, so a render-time `now` is
    // safe (no SSR hydration mismatch).
    const now = new Date();

    return (
        <ol className="space-y-default" data-testid="panel-activity-feed">
            {entries.map((e) => {
                const actor = e.user?.name || e.user?.email || tx("detail.activity.system");
                const detail = humanizeDetail(e.details);
                return (
                    <li key={e.id} className="border-l-2 border-border-subtle pl-3">
                        <p className="break-words text-sm text-content-default">
                            <span className="font-medium text-content-emphasis">
                                {actor}
                            </span>{" "}
                            {phraseFor(e.action)}
                            {detail ? (
                                <span className="text-content-muted"> — {detail}</span>
                            ) : (
                                "."
                            )}
                        </p>
                        <p className="mt-0.5 text-[11px] text-content-subtle">
                            {formatRelativeTime(e.createdAt, now, { addSuffix: true })}
                        </p>
                    </li>
                );
            })}
        </ol>
    );
}
