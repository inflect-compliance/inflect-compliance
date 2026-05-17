"use client";

/**
 * R25-PR-A + PR-B — Processes page client shell.
 *
 * PR-A wired the `<WorkspaceShell>` layout. PR-B replaces the
 * placeholder body with `<ProcessCanvas>` (xyflow ReactFlow with
 * IC token theming) + the toolbar placeholder with
 * `<ProcessPalette>`. PR-C custom node arrives next.
 */
import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { Heading } from "@/components/ui/typography";
import { PageBreadcrumbs } from "@/components/layout/PageBreadcrumbs";
import dynamic from "next/dynamic";

// xyflow uses browser-only APIs (ResizeObserver, getBoundingClientRect
// on mount) — dynamic-imported with ssr:false so the canvas never
// SSRs. Same boundary the GraphExplorer (traceability page) uses.
const ProcessCanvas = dynamic(
    () => import("@/components/processes/ProcessCanvas").then((m) => m.ProcessCanvas),
    { ssr: false },
);
const ProcessPalette = dynamic(
    () =>
        import("@/components/processes/ProcessPalette").then(
            (m) => m.ProcessPalette,
        ),
    { ssr: false },
);

interface ProcessesClientProps {
    tenantSlug: string;
}

export function ProcessesClient({ tenantSlug }: ProcessesClientProps) {
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;

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

            <WorkspaceShell.Body className="border border-border-subtle rounded-[8px] bg-bg-default/30">
                {/* The palette is mounted INSIDE the canvas wrapper so
                    the canvas owns the full body height (the palette
                    stamps a slim top strip, the canvas fills the rest).
                    Keeping them in one block avoids the page rendering
                    a separate toolbar above the canvas which would
                    fragment the workspace into two surfaces. */}
                <ProcessCanvas paletteSlot={<ProcessPalette />} />
            </WorkspaceShell.Body>
        </WorkspaceShell>
    );
}
