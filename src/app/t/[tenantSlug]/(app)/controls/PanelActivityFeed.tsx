"use client";

/**
 * Read-only activity feed for the control / task side panel "Activity" tab.
 * Fetches the entity's hash-chained audit entries (newest first) from the
 * given endpoint and renders them. Shared by the control + task edit panels.
 */
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format-date";

interface ActivityEntry {
    id: string;
    action: string;
    details?: string | null;
    createdAt: string | Date;
    user?: { name?: string | null; email?: string | null } | null;
}

const humanizeAction = (action: string) =>
    action.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

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

    return (
        <ol className="space-y-default" data-testid="panel-activity-feed">
            {entries.map((e) => (
                <li key={e.id} className="border-l-2 border-border-subtle pl-3">
                    <div className="flex items-baseline justify-between gap-tight">
                        <span className="text-sm font-medium text-content-emphasis break-words">
                            {humanizeAction(e.action)}
                        </span>
                        <span className="shrink-0 text-[10px] text-content-subtle tabular-nums">
                            {formatDateTime(e.createdAt)}
                        </span>
                    </div>
                    {e.details && (
                        <p className="mt-0.5 break-words text-xs text-content-muted">{e.details}</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-content-subtle">
                        {e.user?.name || e.user?.email || "System"}
                    </p>
                </li>
            ))}
        </ol>
    );
}
