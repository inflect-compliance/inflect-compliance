"use client";

/**
 * Read-only activity feed for the control / task side-panel "Activity" tab.
 * Fetches the entity's hash-chained audit entries (newest first) and renders
 * each as a plain-language sentence — "Dana Lee changed the status · 2 hours
 * ago" — rather than a raw action-code log. Shared by both edit panels.
 */
import { useEffect, useState } from "react";
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
};

const phraseFor = (action: string): string =>
    ACTION_PHRASE[action?.toUpperCase?.() ?? ""] ??
    (action ?? "").replace(/_/g, " ").toLowerCase();

export function PanelActivityFeed({
    tenantSlug,
    endpoint,
}: {
    tenantSlug: string;
    /** Tenant-scoped path, e.g. `/controls/{id}/activity` or `/tasks/{id}/activity`. */
    endpoint: string;
}) {
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
        return <p className="py-3 text-xs text-content-error">Couldn&apos;t load activity.</p>;
    }
    if (entries === null) {
        return <p className="py-3 text-xs text-content-subtle">Loading activity…</p>;
    }
    if (entries.length === 0) {
        return <p className="py-3 text-xs text-content-subtle">No activity yet.</p>;
    }

    // Entries only render after the client fetch, so a render-time `now` is
    // safe (no SSR hydration mismatch).
    const now = new Date();

    return (
        <ol className="space-y-default" data-testid="panel-activity-feed">
            {entries.map((e) => {
                const actor = e.user?.name || e.user?.email || "The system";
                return (
                    <li key={e.id} className="border-l-2 border-border-subtle pl-3">
                        <p className="break-words text-sm text-content-default">
                            <span className="font-medium text-content-emphasis">
                                {actor}
                            </span>{" "}
                            {phraseFor(e.action)}
                            {e.details ? (
                                <span className="text-content-muted"> — {e.details}</span>
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
