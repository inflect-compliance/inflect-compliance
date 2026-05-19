"use client";

/**
 * R26-PR-A — PersistedProcessCanvas.
 *
 * Bridges the page's process-selection chrome to the underlying
 * xyflow canvas, adding:
 *
 *   • Server load of the selected map's graph (fetch on
 *     `activeId` change → `initialNodes` / `initialEdges` rehydrate)
 *   • Save button that PUTs the current canvas state back
 *   • New-process button that POSTs a fresh map
 *   • A minimal process selector at the top of the body
 *
 * The richer editor UX (visible name editing, save-as, inspector,
 * alignment, undo-redo) is intentionally NOT here — that lands in
 * R26-PR-E. PR-A's only ambition is: prove the persistence loop.
 *
 * State ownership:
 *   • The PersistedProcessCanvas owns the xyflow `nodes` + `edges`
 *     state. R25's `ProcessCanvas` always owned its own state and
 *     accepted `initialNodes` / `initialEdges` for rehydration; for
 *     PR-A we hoist that state up one level so the Save callback
 *     can read the current graph synchronously.
 *   • The canvas inner component is re-keyed on `activeId` so that
 *     opening a different map fully unmounts the existing xyflow
 *     instance (cheaper than trying to diff-update; xyflow handles
 *     mount in <100ms even for several-hundred-node graphs).
 */
import {
    useCallback,
    useEffect,
    useState,
    type DragEvent,
    type ReactNode,
} from "react";
import {
    Background,
    BackgroundVariant,
    ReactFlow,
    ReactFlowProvider,
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    useReactFlow,
    type Connection,
    type Edge,
    type EdgeChange,
    type EdgeTypes,
    type Node,
    type NodeChange,
    type NodeTypes,
    type OnConnect,
    type OnEdgesChange,
    type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import {
    ProcessPalette,
    PALETTE_DRAG_MIME,
    type PaletteDropPayload,
} from "./ProcessPalette";
import { ProcessTypedNode, PROCESS_STEP_NODE_TYPE } from "./ProcessTypedNode";
import {
    NODE_TAXONOMY,
    NODE_TAXONOMY_ORDER,
    isProcessNodeKind,
    type ProcessNodeKind,
} from "./node-taxonomy";
import { ProcessEdge, PROCESS_EDGE_TYPE } from "./ProcessEdge";
import { useProximityAutoBind } from "@/lib/processes/use-proximity-auto-bind";
import { ProcessInspector } from "./ProcessInspector";
import { CanvasHelpStrip } from "./CanvasHelpStrip";
import type { ProcessMapSummary } from "@/app/t/[tenantSlug]/(app)/processes/ProcessesClient";

/**
 * Reserved edge id for the in-flight proximity preview. The
 * canvas synthesises an edge with this id while the user is
 * dragging near a candidate node, then strips it before commit.
 * Kept module-level so tests + the commit handler can refer to
 * the same constant.
 */
const PROXIMITY_PREVIEW_ID = "__proximity_preview__";

// Every taxonomy kind registers the SAME renderer. The renderer
// branches internally on `data.kind` so the chassis stays shared.
// Module-level so the reference is stable across re-renders
// (xyflow warns + remounts every node when `nodeTypes` changes).
const NODE_TYPES: NodeTypes = Object.fromEntries(
    NODE_TAXONOMY_ORDER.map((kind) => [kind, ProcessTypedNode]),
);
const EDGE_TYPES: EdgeTypes = {
    [PROCESS_EDGE_TYPE]: ProcessEdge,
};

interface PersistedProcessCanvasProps {
    tenantSlug: string;
    processes: ProcessMapSummary[];
    activeId: string | null;
    onActiveIdChange: (id: string | null) => void;
    onProcessesChange: (next: ProcessMapSummary[]) => void;
}

export function PersistedProcessCanvas(props: PersistedProcessCanvasProps) {
    return (
        <ReactFlowProvider>
            <Inner {...props} />
        </ReactFlowProvider>
    );
}

interface LoadedGraph {
    mapId: string;
    nodes: Node[];
    edges: Edge[];
    version: number;
}

function Inner({
    tenantSlug,
    processes,
    activeId,
    onActiveIdChange,
    onProcessesChange,
}: PersistedProcessCanvasProps) {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [loadedMap, setLoadedMap] = useState<LoadedGraph | null>(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [duplicating, setDuplicating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // R26-PR-E — inline name editing. Mirrors the active process's
    // name so the user can edit it in place without every keystroke
    // bouncing through the parent state.
    const [editedName, setEditedName] = useState<string>("");
    const { screenToFlowPosition } = useReactFlow();

    // R26-PR-E — selected-node tracking for the inspector. xyflow
    // owns selection state internally; we mirror it via the change
    // handler so the inspector can read the selected node's data
    // synchronously.
    const selectedNode = nodes.find((n) => n.selected) ?? null;

    // Sync the editedName mirror to the active process name when
    // selection or rename-from-elsewhere changes.
    const activeProcess = activeId
        ? processes.find((p) => p.id === activeId) ?? null
        : null;
    useEffect(() => {
        setEditedName(activeProcess?.name ?? "");
    }, [activeProcess?.name, activeProcess?.id]);

    // ─── Server load on activeId change ────────────────────────────

    useEffect(() => {
        if (!activeId) {
            setNodes([]);
            setEdges([]);
            setLoadedMap(null);
            return;
        }
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(
                    `/api/t/${tenantSlug}/processes/${activeId}`,
                );
                if (!res.ok) throw new Error(`Load failed (${res.status})`);
                const data = (await res.json()) as {
                    id: string;
                    version: number;
                    nodes: Array<{
                        nodeKey: string;
                        nodeType: string;
                        label: string;
                        subtitle: string | null;
                        posX: number;
                        posY: number;
                    }>;
                    edges: Array<{
                        edgeKey: string;
                        sourceKey: string;
                        targetKey: string;
                        edgeKind: string;
                        labelOverride: string | null;
                    }>;
                };
                if (cancelled) return;
                const rehydratedNodes: Node[] = data.nodes.map((n) => {
                    // The `nodeType` column is forward-compatible
                    // (typed `String`, not enum) so unknown kinds
                    // never crash rehydration. Fall back to the
                    // default kind; the renderer does the same.
                    const kind: ProcessNodeKind = isProcessNodeKind(n.nodeType)
                        ? n.nodeType
                        : PROCESS_STEP_NODE_TYPE;
                    return {
                        id: n.nodeKey,
                        type: kind,
                        position: { x: n.posX, y: n.posY },
                        data: {
                            label: n.label,
                            kind,
                            ...(n.subtitle ? { subtitle: n.subtitle } : {}),
                        },
                    };
                });
                const rehydratedEdges: Edge[] = data.edges.map((e) => ({
                    id: e.edgeKey,
                    source: e.sourceKey,
                    target: e.targetKey,
                    type: PROCESS_EDGE_TYPE,
                    ...(e.labelOverride ? { label: e.labelOverride } : {}),
                }));
                setNodes(rehydratedNodes);
                setEdges(rehydratedEdges);
                setLoadedMap({
                    mapId: data.id,
                    nodes: rehydratedNodes,
                    edges: rehydratedEdges,
                    version: data.version,
                });
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Load failed");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [activeId, tenantSlug]);

    // ─── Save current canvas state ─────────────────────────────────

    const handleSave = useCallback(async () => {
        if (!activeId) return;
        setSaving(true);
        setError(null);
        try {
            const payload = {
                nodes: nodes.map((n, idx) => {
                    // The xyflow node carries its kind on `type`
                    // (registered in NODE_TYPES) AND on `data.kind`
                    // (consumed by the renderer). Both come back
                    // from the rehydration step. On save we trust
                    // `n.type` — it is the canonical xyflow
                    // identifier and the field the registry keys
                    // off — and fall back to the default kind if
                    // it ever drifts.
                    const kind: ProcessNodeKind = isProcessNodeKind(n.type)
                        ? n.type
                        : PROCESS_STEP_NODE_TYPE;
                    const meta = NODE_TAXONOMY[kind];
                    const dataLabel =
                        n.data &&
                        typeof (n.data as { label?: unknown }).label ===
                            "string"
                            ? (n.data as { label: string }).label
                            : meta.defaultLabel;
                    const dataSubtitle =
                        n.data &&
                        typeof (n.data as { subtitle?: unknown }).subtitle ===
                            "string"
                            ? (n.data as { subtitle: string }).subtitle
                            : null;
                    return {
                        nodeKey: n.id || `node-${idx + 1}`,
                        nodeType: kind,
                        label: dataLabel,
                        subtitle: dataSubtitle,
                        posX: n.position.x,
                        posY: n.position.y,
                    };
                }),
                edges: edges.map((e, idx) => ({
                    edgeKey: e.id || `edge-${idx + 1}`,
                    sourceKey: e.source,
                    targetKey: e.target,
                    edgeKind: "flow",
                    labelOverride:
                        typeof e.label === "string" ? e.label : null,
                    controls: [],
                })),
            };
            const res = await fetch(
                `/api/t/${tenantSlug}/processes/${activeId}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                },
            );
            if (!res.ok) throw new Error(`Save failed (${res.status})`);
            const data = await res.json();
            // Update the summary list with the fresh version + updatedAt
            onProcessesChange(
                processes.map((p) =>
                    p.id === activeId
                        ? {
                              ...p,
                              version: data.version,
                              updatedAt: data.updatedAt,
                              nodeCount: data.nodes.length,
                              edgeCount: data.edges.length,
                          }
                        : p,
                ),
            );
            setLoadedMap({
                mapId: data.id,
                nodes,
                edges,
                version: data.version,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Save failed");
        } finally {
            setSaving(false);
        }
    }, [activeId, nodes, edges, tenantSlug, processes, onProcessesChange]);

    // ─── Inspector: patch selected node ───────────────────────────

    const handleInspectorUpdate = useCallback(
        (
            nodeId: string,
            patch: { label?: string; subtitle?: string | null },
        ) => {
            setNodes((nds) =>
                nds.map((n) => {
                    if (n.id !== nodeId) return n;
                    const prevData = (n.data ?? {}) as Record<string, unknown>;
                    return {
                        ...n,
                        data: {
                            ...prevData,
                            ...(patch.label !== undefined
                                ? { label: patch.label }
                                : {}),
                            ...(patch.subtitle !== undefined
                                ? patch.subtitle === null
                                    ? { subtitle: undefined }
                                    : { subtitle: patch.subtitle }
                                : {}),
                        },
                    };
                }),
            );
        },
        [],
    );

    // ─── Rename: commit the inline name edit ──────────────────────

    const handleRenameCommit = useCallback(async () => {
        if (!activeId || !activeProcess) return;
        const trimmed = editedName.trim();
        if (trimmed === "" || trimmed === activeProcess.name) {
            setEditedName(activeProcess.name);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            // Reuses the existing PUT endpoint — the SaveProcessMap
            // schema accepts a metadata-only payload with the
            // current graph alongside. Sending the live graph keeps
            // the rename action atomic with whatever in-flight
            // node/edge edits the user has open.
            const payload = {
                name: trimmed,
                nodes: nodes.map((n, idx) => ({
                    nodeKey: n.id || `node-${idx + 1}`,
                    nodeType: isProcessNodeKind(n.type)
                        ? n.type
                        : PROCESS_STEP_NODE_TYPE,
                    label:
                        n.data &&
                        typeof (n.data as { label?: unknown }).label === "string"
                            ? (n.data as { label: string }).label
                            : "Untitled step",
                    subtitle:
                        n.data &&
                        typeof (n.data as { subtitle?: unknown }).subtitle ===
                            "string"
                            ? (n.data as { subtitle: string }).subtitle
                            : null,
                    posX: n.position.x,
                    posY: n.position.y,
                })),
                edges: edges.map((e, idx) => ({
                    edgeKey: e.id || `edge-${idx + 1}`,
                    sourceKey: e.source,
                    targetKey: e.target,
                    edgeKind: "flow",
                    labelOverride:
                        typeof e.label === "string" ? e.label : null,
                    controls: [],
                })),
            };
            const res = await fetch(
                `/api/t/${tenantSlug}/processes/${activeId}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                },
            );
            if (!res.ok) throw new Error(`Rename failed (${res.status})`);
            const data = await res.json();
            onProcessesChange(
                processes.map((p) =>
                    p.id === activeId
                        ? {
                              ...p,
                              name: data.name,
                              version: data.version,
                              updatedAt: data.updatedAt,
                          }
                        : p,
                ),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Rename failed");
        } finally {
            setSaving(false);
        }
    }, [
        activeId,
        activeProcess,
        editedName,
        nodes,
        edges,
        tenantSlug,
        processes,
        onProcessesChange,
    ]);

    // ─── Duplicate: clone the current graph into a new map ────────

    const handleDuplicate = useCallback(async () => {
        if (!activeId || !activeProcess) return;
        setDuplicating(true);
        setError(null);
        try {
            const createRes = await fetch(`/api/t/${tenantSlug}/processes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: `${activeProcess.name} (copy)`,
                }),
            });
            if (!createRes.ok)
                throw new Error(`Duplicate create failed (${createRes.status})`);
            const newMap = await createRes.json();

            // Send the current canvas graph to the freshly created
            // map. Two round trips, no transactional guarantee — if
            // the second fails we leave an empty map behind, which
            // is recoverable + signposted by the toolbar selector
            // showing the new map.
            const saveRes = await fetch(
                `/api/t/${tenantSlug}/processes/${newMap.id}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        nodes: nodes.map((n, idx) => ({
                            nodeKey: n.id || `node-${idx + 1}`,
                            nodeType: isProcessNodeKind(n.type)
                                ? n.type
                                : PROCESS_STEP_NODE_TYPE,
                            label:
                                n.data &&
                                typeof (n.data as { label?: unknown }).label ===
                                    "string"
                                    ? (n.data as { label: string }).label
                                    : "Untitled step",
                            subtitle:
                                n.data &&
                                typeof (n.data as { subtitle?: unknown })
                                    .subtitle === "string"
                                    ? (n.data as { subtitle: string }).subtitle
                                    : null,
                            posX: n.position.x,
                            posY: n.position.y,
                        })),
                        edges: edges.map((e, idx) => ({
                            edgeKey: e.id || `edge-${idx + 1}`,
                            sourceKey: e.source,
                            targetKey: e.target,
                            edgeKind: "flow",
                            labelOverride:
                                typeof e.label === "string" ? e.label : null,
                            controls: [],
                        })),
                    }),
                },
            );
            if (!saveRes.ok)
                throw new Error(`Duplicate save failed (${saveRes.status})`);
            const filled = await saveRes.json();

            const summary: ProcessMapSummary = {
                id: filled.id,
                name: filled.name,
                description: filled.description,
                status: filled.status,
                version: filled.version,
                createdAt: filled.createdAt,
                updatedAt: filled.updatedAt,
                nodeCount: filled.nodes.length,
                edgeCount: filled.edges.length,
            };
            onProcessesChange([summary, ...processes]);
            onActiveIdChange(filled.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Duplicate failed");
        } finally {
            setDuplicating(false);
        }
    }, [
        activeId,
        activeProcess,
        tenantSlug,
        nodes,
        edges,
        processes,
        onProcessesChange,
        onActiveIdChange,
    ]);

    // ─── Create new process ────────────────────────────────────────

    const handleNew = useCallback(async () => {
        setCreating(true);
        setError(null);
        try {
            const name = `Untitled process ${processes.length + 1}`;
            const res = await fetch(`/api/t/${tenantSlug}/processes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            });
            if (!res.ok) throw new Error(`Create failed (${res.status})`);
            const data = await res.json();
            const summary: ProcessMapSummary = {
                id: data.id,
                name: data.name,
                description: data.description,
                status: data.status,
                version: data.version,
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                nodeCount: 0,
                edgeCount: 0,
            };
            onProcessesChange([summary, ...processes]);
            onActiveIdChange(data.id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Create failed");
        } finally {
            setCreating(false);
        }
    }, [tenantSlug, processes, onProcessesChange, onActiveIdChange]);

    // ─── Canvas plumbing (xyflow change handlers + drop) ───────────

    const onNodesChange = useCallback<OnNodesChange>(
        (changes: NodeChange[]) =>
            setNodes((nds) => applyNodeChanges(changes, nds)),
        [],
    );
    const onEdgesChange = useCallback<OnEdgesChange>(
        (changes: EdgeChange[]) =>
            setEdges((eds) => applyEdgeChanges(changes, eds)),
        [],
    );
    const onConnect = useCallback<OnConnect>(
        (c: Connection) =>
            setEdges((eds) =>
                addEdge({ ...c, type: PROCESS_EDGE_TYPE, id: `edge-${Date.now()}` }, eds),
            ),
        [],
    );

    // R26-PR-C — proximity auto-bind. When the user drags a node
    // close enough to another, surface a candidate edge; on
    // mouse-up still in range, commit it.
    const handleProximityCommit = useCallback(
        (cand: { source: string; target: string }) => {
            setEdges((eds) => {
                // Guard against the (rare) race where the candidate
                // edge already landed via the in-flight onConnect
                // path. addEdge would dedupe by id but not by
                // (source, target).
                if (
                    eds.some(
                        (e) =>
                            e.source === cand.source &&
                            e.target === cand.target,
                    )
                ) {
                    return eds;
                }
                return [
                    ...eds,
                    {
                        id: `edge-${Date.now()}`,
                        source: cand.source,
                        target: cand.target,
                        type: PROCESS_EDGE_TYPE,
                    },
                ];
            });
        },
        [],
    );
    const proximity = useProximityAutoBind(nodes, edges, {
        onCommit: handleProximityCommit,
    });
    const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
    }, []);
    const onDrop = useCallback(
        (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const raw = event.dataTransfer.getData(PALETTE_DRAG_MIME);
            if (!raw) return;
            // R26-PR-B widened the palette payload from a raw label
            // (`"Process step"`) to a JSON object `{ kind, label }`.
            // Parse the structured form first; if that fails we
            // gracefully fall back to treating `raw` as a label and
            // minting a default-kind step node. The fallback keeps
            // backwards compat with any stale drag source still
            // sending the R25 payload shape.
            let kind: ProcessNodeKind = PROCESS_STEP_NODE_TYPE;
            let label = raw;
            try {
                const parsed = JSON.parse(raw) as PaletteDropPayload;
                if (
                    parsed &&
                    typeof parsed === "object" &&
                    isProcessNodeKind(parsed.kind) &&
                    typeof parsed.label === "string"
                ) {
                    kind = parsed.kind;
                    label = parsed.label;
                }
            } catch {
                // Non-JSON payload — keep the raw-label fallback.
            }
            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });
            const meta = NODE_TAXONOMY[kind];
            setNodes((nds) => [
                ...nds,
                {
                    id: `node-${Date.now()}`,
                    type: kind,
                    position,
                    data: { label: label || meta.defaultLabel, kind },
                },
            ]);
        },
        [screenToFlowPosition],
    );

    const showEmpty = !activeId;

    return (
        <div className="flex h-full w-full flex-col" data-process-canvas="true">
            {/* Slim header strip: selector + actions. R26-PR-E will
                refine this into a proper editor toolbar. */}
            <div
                className="flex items-center gap-default border-b border-border-subtle bg-bg-default/60 px-3 py-2"
                data-persisted-canvas-toolbar="true"
            >
                <select
                    value={activeId ?? ""}
                    onChange={(e) =>
                        onActiveIdChange(e.target.value || null)
                    }
                    disabled={processes.length === 0 || loading || saving}
                    className="rounded-[6px] border border-border-subtle bg-bg-default px-2 py-1 text-xs text-content-emphasis"
                    aria-label="Select process map"
                    data-testid="process-selector"
                >
                    {processes.length === 0 && (
                        <option value="">(no processes yet)</option>
                    )}
                    {processes.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name}
                        </option>
                    ))}
                </select>
                {activeId && (
                    // R26-PR-E — inline rename. Commits on blur or
                    // Enter; pressing Escape reverts to the active
                    // process's stored name.
                    <input
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onBlur={handleRenameCommit}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.currentTarget.blur();
                            } else if (e.key === "Escape") {
                                setEditedName(activeProcess?.name ?? "");
                                e.currentTarget.blur();
                            }
                        }}
                        disabled={saving || loading}
                        aria-label="Process name"
                        placeholder="Untitled"
                        data-testid="process-name-input"
                        className="min-w-[120px] rounded-[6px] border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-content-emphasis focus:border-border-emphasis focus:outline-none hover:border-border-subtle"
                    />
                )}
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleNew}
                    disabled={creating}
                    data-testid="new-process-btn"
                >
                    {creating ? "Creating…" : "New process"}
                </Button>
                {activeId && (
                    <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleDuplicate}
                        disabled={duplicating || saving || loading}
                        data-testid="duplicate-process-btn"
                    >
                        {duplicating ? "Duplicating…" : "Duplicate"}
                    </Button>
                )}
                <div className="ml-auto flex items-center gap-default">
                    {error && (
                        <span
                            className="text-xs text-content-error"
                            role="alert"
                        >
                            {error}
                        </span>
                    )}
                    {loadedMap && (
                        <span className="text-xs text-content-subtle tabular-nums">
                            v{loadedMap.version}
                        </span>
                    )}
                    <Button
                        size="sm"
                        variant="primary"
                        onClick={handleSave}
                        disabled={!activeId || saving || loading}
                        data-testid="save-process-btn"
                    >
                        {saving ? "Saving…" : "Save"}
                    </Button>
                </div>
            </div>

            <ProcessPalette />
            <CanvasHelpStrip
                nodeCount={nodes.length}
                edgeCount={edges.length}
            />
            <div className="flex flex-1 min-h-0">
                <div
                    className="relative flex-1 min-h-0"
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                >
                    {showEmpty && (
                        <CanvasEmpty onNew={handleNew} creating={creating} />
                    )}
                    {!showEmpty && nodes.length === 0 && !loading && (
                        <div
                            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
                            data-canvas-empty-state="true"
                        >
                            <p className="text-sm text-content-muted">
                                Drag a process step from the palette to begin.
                            </p>
                        </div>
                    )}
                    <ReactFlow
                        key={activeId ?? "no-map"}
                        nodes={nodes}
                        // Synthesise a transient preview edge when
                        // the proximity hook has a live candidate.
                        // ProcessEdge reads `data.isPreview` and
                        // swaps to dashed brand stroke; the commit
                        // path strips the reserved id before
                        // persisting.
                        edges={
                            proximity.candidate
                                ? [
                                      ...edges,
                                      {
                                          id: PROXIMITY_PREVIEW_ID,
                                          source: proximity.candidate.source,
                                          target: proximity.candidate.target,
                                          type: PROCESS_EDGE_TYPE,
                                          data: { isPreview: true },
                                          animated: true,
                                      },
                                  ]
                                : edges
                        }
                        nodeTypes={NODE_TYPES}
                        edgeTypes={EDGE_TYPES}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeDrag={proximity.onNodeDrag}
                        onNodeDragStop={proximity.onNodeDragStop}
                        fitView
                        proOptions={{ hideAttribution: true }}
                        aria-label="Process canvas"
                    >
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={24}
                            size={1.4}
                            color="var(--border-subtle)"
                        />
                    </ReactFlow>
                </div>
                {/* R26-PR-E inspector — mounts when a node is
                    selected; hides cleanly otherwise. */}
                <ProcessInspector
                    node={selectedNode}
                    onUpdate={handleInspectorUpdate}
                />
            </div>
        </div>
    );
}

function CanvasEmpty({
    onNew,
    creating,
}: {
    onNew: () => void;
    creating: boolean;
}): ReactNode {
    return (
        <div
            className="absolute inset-0 z-10 flex items-center justify-center"
            data-canvas-empty="true"
        >
            <div className="flex max-w-[320px] flex-col items-center gap-default text-center">
                <p className="text-sm font-medium text-content-emphasis">
                    Map a business or IT process.
                </p>
                <p className="text-xs text-content-muted">
                    Capture the steps, mark the controls between them, and
                    annotate the risks and assets each step touches.
                </p>
                <Button
                    size="sm"
                    variant="primary"
                    onClick={onNew}
                    disabled={creating}
                    data-testid="empty-state-new-btn"
                >
                    {creating ? "Creating…" : "Create your first process"}
                </Button>
            </div>
        </div>
    );
}
