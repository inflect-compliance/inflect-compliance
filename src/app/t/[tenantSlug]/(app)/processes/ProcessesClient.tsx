"use client";

/**
 * Processes page client shell.
 *
 * R25 mounted the canvas with zero persistence. R26-PR-A adds:
 *   - the existing process list, selectable from a slim header
 *     control
 *   - a "New process" affordance that POSTs to the create endpoint
 *   - a "Save" button that PUTs the canvas state back to the
 *     selected map's endpoint
 *   - rehydration: selecting a map loads its graph from the server
 *     and seeds the canvas as `initialNodes` + `initialEdges`
 *
 * The richer editor UX (visible name, save-as, inspector, alignment
 * helpers, undo-redo) lands in R26-PR-E; PR-A is the minimum
 * needed to prove the persistence loop end-to-end.
 *
 * Component split:
 *   - `<ProcessesClient>` (this file) owns the page chrome +
 *     selection state. It does NOT own canvas state; the canvas
 *     does (xyflow's internal nodes/edges, plus a wrapper that
 *     exposes a save callback).
 *   - `<PersistedProcessCanvas>` (sibling component) wraps the
 *     R25 `<ProcessCanvas>` and adds the save/rehydrate plumbing.
 *     Splitting keeps the page chrome simple and lets the canvas
 *     own its xyflow state without prop-drilling.
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { Heading } from "@/components/ui/typography";
import { PageBreadcrumbs } from "@/components/layout/PageBreadcrumbs";

// xyflow uses browser-only APIs on mount (ResizeObserver,
// getBoundingClientRect). The `ssr:false` boundary lives at this
// import — the wrapper itself is a "use client" component, but
// "use client" still runs through SSR for the initial paint.
// Dynamic-import with ssr:false keeps the canvas off the server
// pipeline entirely. Same pattern R25 established via the
// `<ProcessCanvas>` import that this replaces.
const PersistedProcessCanvas = dynamic(
    () =>
        import("@/components/processes/PersistedProcessCanvas").then(
            (m) => m.PersistedProcessCanvas,
        ),
    { ssr: false },
);

export interface ProcessMapSummary {
    id: string;
    name: string;
    description: string | null;
    status: "DRAFT" | "ACTIVE" | "ARCHIVED";
    version: number;
    createdAt: string | Date;
    updatedAt: string | Date;
    nodeCount: number;
    edgeCount: number;
}

interface ProcessesClientProps {
    tenantSlug: string;
    initialProcesses: ProcessMapSummary[];
}

export function ProcessesClient({
    tenantSlug,
    initialProcesses,
}: ProcessesClientProps) {
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;

    // The full list is owned here so a save can refresh the
    // selected map's metadata (version, updatedAt) without a full
    // page reload. Selection itself drives the canvas's load
    // sequence via its `processMapId` prop.
    const [processes, setProcesses] = useState<ProcessMapSummary[]>(
        initialProcesses,
    );
    const [activeId, setActiveId] = useState<string | null>(
        initialProcesses[0]?.id ?? null,
    );

    return (
        <WorkspaceShell className="animate-fadeIn">
            <WorkspaceShell.Header>
                <PageBreadcrumbs
                    items={[
                        { label: "Dashboard", href: tenantHref("/dashboard") },
                        { label: "Processes" },
                    ]}
                    className="mb-1"
                />
                <Heading level={1}>Processes</Heading>
                <p className="text-sm text-content-muted mt-1">
                    Map business and IT processes. Place controls on the
                    connections between steps.
                </p>
            </WorkspaceShell.Header>

            {/* The workspace frame — an elevated panel that contains
                the chrome (toolbar + palette) and the recessed canvas
                plane. `overflow-hidden` clips every inner strip to the
                frame's rounded corners so the composition reads as one
                deliberate container, not a stack of loose bands. */}
            <WorkspaceShell.Body className="overflow-hidden rounded-lg border border-canvas-border bg-canvas-frame shadow-lg">
                <PersistedProcessCanvas
                    tenantSlug={tenantSlug}
                    processes={processes}
                    activeId={activeId}
                    onActiveIdChange={setActiveId}
                    onProcessesChange={setProcesses}
                />
            </WorkspaceShell.Body>
        </WorkspaceShell>
    );
}
