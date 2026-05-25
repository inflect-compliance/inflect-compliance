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
import {
    ProcessTypedNode,
    PROCESS_STEP_NODE_TYPE,
    isProcessNodeSize,
    type ProcessNodeSize,
} from "./ProcessTypedNode";
import {
    NODE_TAXONOMY,
    NODE_TAXONOMY_ORDER,
    isProcessNodeKind,
    type ProcessNodeKind,
} from "./node-taxonomy";
import {
    ProcessEdge,
    PROCESS_EDGE_TYPE,
    isProcessEdgeVariant,
} from "./ProcessEdge";
import { useProximityAutoBind } from "@/lib/processes/use-proximity-auto-bind";
import {
    useCanvasHistory,
    type CanvasSnapshot,
} from "@/lib/processes/use-canvas-history";
import { useCanvasAutosave } from "@/lib/processes/use-canvas-autosave";
import { useCanvasChangeEmitter } from "@/lib/processes/canvas-change-events";
import {
    alignNodes,
    distributeNodes,
    type AlignmentAxis,
    type DistributeAxis,
} from "@/lib/processes/canvas-alignment";
import { useKeyboardShortcut } from "@/lib/hooks/use-keyboard-shortcut";
import { ProcessInspector } from "./ProcessInspector";
import { CanvasHelpStrip } from "./CanvasHelpStrip";
import type { ProcessEdgeVariant } from "./ProcessEdge";
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

// ─── Graph-row serialisers (R27-PR-B) ────────────────────────────────
// Node size persists in the forward-compatible `ProcessNode.dataJson`
// slot; edge variant persists in the `ProcessEdge.edgeKind` column.
// Both already round-trip end to end — no schema migration needed.

function nodeDataJson(n: Node): { size: string } | null {
    const size = (n.data as { size?: unknown } | undefined)?.size;
    return isProcessNodeSize(size) ? { size } : null;
}

function edgeKindOf(e: Edge): string {
    const v = (e.data as { variant?: unknown } | undefined)?.variant;
    return isProcessEdgeVariant(v) ? v : "flow";
}

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
    // R28 — snap-to-grid toggle. xyflow's native snapToGrid +
    // snapGrid props are wired below; the toggle persists per
    // tenant in localStorage so authors keep their preference.
    const [snapEnabled, setSnapEnabled] = useState<boolean>(() => {
        if (typeof window === "undefined") return true;
        const v = window.localStorage.getItem("inflect:processes:snap");
        return v === null ? true : v === "1";
    });
    useEffect(() => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(
            "inflect:processes:snap",
            snapEnabled ? "1" : "0",
        );
    }, [snapEnabled]);
    const { screenToFlowPosition } = useReactFlow();
    // R28 — undo/redo history. Snapshots are pushed AFTER each
    // substantive edit (create/delete/move-stop/inspector-commit/
    // variant-cycle); keyboard binds Cmd+Z / Cmd+Shift+Z.
    const history = useCanvasHistory();
    // R29 — typed change-event emitter. Today only the autosave
    // path "subscribes" (indirectly, via markDirty); the hook is
    // the seam future collab / awareness layers plug into. See
    // canvas-change-events.ts for the wire-contract rationale.
    const changeEmitter = useCanvasChangeEmitter();

    // R26-PR-E — selected-node tracking for the inspector. xyflow
    // owns selection state internally; we mirror it via the change
    // handler so the inspector can read the selected node's data
    // synchronously.
    const selectedNode = nodes.find((n) => n.selected) ?? null;
    // R28 — same idea for the edge inspector. The inspector
    // gives precedence to node over edge if both are mounted; we
    // only mirror the edge slot here so the consumer can decide.
    const selectedEdge = edges.find((e) => e.selected) ?? null;
    // R29 — multi-select bookkeeping. The alignment + distribute
    // toolbar surfaces only when ≥2 nodes are selected (≥3 for
    // distribute). Memoising the id set keeps the toolbar's
    // disabled-state checks O(1).
    const selectedNodeIds = nodes
        .filter((n) => n.selected)
        .map((n) => n.id);
    const selectionCount = selectedNodeIds.length;

    // R28 — history snapshot helper. Captures the live graph
    // shape as a CanvasSnapshot. Called from places that mutate
    // the graph: drop, delete, inspector commit, variant cycle.
    const snapshotNow = useCallback(
        (): CanvasSnapshot => ({ nodes, edges }),
        [nodes, edges],
    );

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
                        dataJson: unknown;
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
                    // R27-PR-B — node size rides in `dataJson`.
                    const size = (
                        n.dataJson as { size?: unknown } | null | undefined
                    )?.size;
                    return {
                        id: n.nodeKey,
                        type: kind,
                        position: { x: n.posX, y: n.posY },
                        data: {
                            label: n.label,
                            kind,
                            ...(n.subtitle ? { subtitle: n.subtitle } : {}),
                            ...(isProcessNodeSize(size) ? { size } : {}),
                        },
                    };
                });
                const rehydratedEdges: Edge[] = data.edges.map((e) => ({
                    id: e.edgeKey,
                    source: e.sourceKey,
                    target: e.targetKey,
                    type: PROCESS_EDGE_TYPE,
                    // R27-PR-B — edge variant rides in `edgeKind`.
                    data: {
                        variant: isProcessEdgeVariant(e.edgeKind)
                            ? e.edgeKind
                            : "flow",
                    },
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
                        dataJson: nodeDataJson(n),
                    };
                }),
                edges: edges.map((e, idx) => ({
                    edgeKey: e.id || `edge-${idx + 1}`,
                    sourceKey: e.source,
                    targetKey: e.target,
                    edgeKind: edgeKindOf(e),
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

    // ─── R28 — Autosave. Debounced 3s after the last edit. ────────
    // `markDirty()` fires from the change handlers below; the save
    // callback delegates to `handleSave` so the existing PUT path
    // is reused (no second serialisation surface to drift).
    const autosave = useCanvasAutosave({
        enabled: Boolean(activeId) && !loading,
        save: handleSave,
    });
    // Clear autosave dirty whenever rehydration completes — the
    // load sequence calls setNodes/setEdges which would normally
    // mark dirty; markClean keeps the post-load state idle.
    useEffect(() => {
        if (!loading) autosave.markClean();
        // markClean is stable enough (memoised in the hook); we
        // depend on `loading` only so the cleanup fires once per
        // load cycle.
    }, [loading, activeId, autosave]);

    // ─── Inspector: patch selected node ───────────────────────────

    const handleInspectorUpdate = useCallback(
        (
            nodeId: string,
            patch: {
                label?: string;
                subtitle?: string | null;
                size?: ProcessNodeSize;
            },
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
                            ...(patch.size !== undefined
                                ? { size: patch.size }
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
                    dataJson: nodeDataJson(n),
                })),
                edges: edges.map((e, idx) => ({
                    edgeKey: e.id || `edge-${idx + 1}`,
                    sourceKey: e.source,
                    targetKey: e.target,
                    edgeKind: edgeKindOf(e),
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
                            dataJson: nodeDataJson(n),
                        })),
                        edges: edges.map((e, idx) => ({
                            edgeKey: e.id || `edge-${idx + 1}`,
                            sourceKey: e.source,
                            targetKey: e.target,
                            edgeKind: edgeKindOf(e),
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
    //
    // R28 — change classification. xyflow's NodeChange / EdgeChange
    // unions carry both substantive edits (add, remove, position-
    // commit) AND transient flicker (selection, dimensions,
    // position-during-drag). We mark dirty + push history only on
    // the substantive subset so autosave doesn't fire on every
    // selection click and undo doesn't bury a real undo point
    // under twenty drag-tick entries.
    const isSubstantiveNodeChange = (c: NodeChange): boolean => {
        switch (c.type) {
            case "add":
            case "remove":
                return true;
            case "position":
                // `dragging: false` marks the commit (mouse-up).
                // Intermediate drag ticks have `dragging: true`
                // and shouldn't push history.
                return c.dragging === false;
            default:
                return false;
        }
    };
    const isSubstantiveEdgeChange = (c: EdgeChange): boolean => {
        return c.type === "add" || c.type === "remove";
    };

    const onNodesChange = useCallback<OnNodesChange>(
        (changes: NodeChange[]) => {
            const substantive = changes.some(isSubstantiveNodeChange);
            if (substantive) {
                // Snapshot the PRE-change state so undo restores
                // exactly what was there before this edit.
                history.push({ nodes, edges });
                autosave.markDirty();
            }
            setNodes((nds) => applyNodeChanges(changes, nds));
        },
        [nodes, edges, history, autosave],
    );
    const onEdgesChange = useCallback<OnEdgesChange>(
        (changes: EdgeChange[]) => {
            const substantive = changes.some(isSubstantiveEdgeChange);
            if (substantive) {
                history.push({ nodes, edges });
                autosave.markDirty();
            }
            setEdges((eds) => applyEdgeChanges(changes, eds));
        },
        [nodes, edges, history, autosave],
    );
    const onConnect = useCallback<OnConnect>(
        (c: Connection) => {
            history.push({ nodes, edges });
            autosave.markDirty();
            setEdges((eds) =>
                addEdge({ ...c, type: PROCESS_EDGE_TYPE, id: `edge-${Date.now()}` }, eds),
            );
        },
        [nodes, edges, history, autosave],
    );

    // R28 — connection validity predicate. Three reject conditions:
    //   1. Self-loop (source === target) — never meaningful in a
    //      process map; the user has misclicked.
    //   2. Duplicate (an edge already exists for this directed
    //      pair) — auto-bind has the same guard; the manual
    //      connect path needs it for parity.
    //   3. Annotation participation — annotations are documentary,
    //      not part of the flow (their kind already declares
    //      `hasHandles: false`, but if a future variant ever
    //      slipped through, the explicit reject keeps the graph
    //      semantics intact).
    const isValidConnection = useCallback(
        (c: Connection | Edge) => {
            const src = "source" in c ? c.source : null;
            const tgt = "target" in c ? c.target : null;
            if (!src || !tgt) return false;
            if (src === tgt) return false;
            if (
                edges.some(
                    (e) => e.source === src && e.target === tgt,
                )
            ) {
                return false;
            }
            const srcNode = nodes.find((n) => n.id === src);
            const tgtNode = nodes.find((n) => n.id === tgt);
            const srcKind = (srcNode?.data as { kind?: unknown })?.kind;
            const tgtKind = (tgtNode?.data as { kind?: unknown })?.kind;
            if (srcKind === "annotation" || tgtKind === "annotation") {
                return false;
            }
            return true;
        },
        [nodes, edges],
    );

    // R28 — edge inspector commit. Patches the edge's label (top-
    // level on xyflow) + `data.variant`. Pushes history + marks
    // dirty so the change survives undo and triggers autosave.
    const handleEdgeUpdate = useCallback(
        (
            edgeId: string,
            patch: { label?: string | null; variant?: ProcessEdgeVariant },
        ) => {
            history.push({ nodes, edges });
            autosave.markDirty();
            setEdges((eds) =>
                eds.map((e) => {
                    if (e.id !== edgeId) return e;
                    const next: Edge = { ...e };
                    if (patch.label !== undefined) {
                        // null = "clear the label"; xyflow accepts
                        // undefined or the absence of the field
                        // for an unlabelled edge.
                        if (patch.label === null) {
                            delete (next as { label?: unknown }).label;
                        } else {
                            next.label = patch.label;
                        }
                    }
                    if (patch.variant !== undefined) {
                        const prevData = (e.data ?? {}) as Record<
                            string,
                            unknown
                        >;
                        next.data = { ...prevData, variant: patch.variant };
                    }
                    return next;
                }),
            );
        },
        [nodes, edges, history, autosave],
    );

    // R28 — undo / redo. The hook stack stores PRE-change
    // snapshots; on undo we stash the LIVE state into the redo
    // stack so redo can restore it. Cmd+Z = undo, Cmd+Shift+Z =
    // redo (the editor-standard).
    const handleUndo = useCallback(() => {
        const prev = history.undo();
        if (!prev) return;
        history.pushRedo({ nodes, edges });
        setNodes(prev.nodes);
        setEdges(prev.edges);
        autosave.markDirty();
    }, [history, nodes, edges, autosave]);
    const handleRedo = useCallback(() => {
        const next = history.redo();
        if (!next) return;
        history.push({ nodes, edges });
        setNodes(next.nodes);
        setEdges(next.edges);
        autosave.markDirty();
    }, [history, nodes, edges, autosave]);

    // R29 — multi-select alignment + distribute. Pure functions
    // in canvas-alignment.ts compute the new positions; here we
    // push history + mark dirty + emit a typed move event.
    const handleAlign = useCallback(
        (axis: AlignmentAxis) => {
            if (selectionCount < 2) return;
            const ids = new Set(selectedNodeIds);
            history.push({ nodes, edges });
            setNodes((nds) => alignNodes(nds, ids, axis));
            autosave.markDirty();
            changeEmitter.emit("node.move", {
                nodeIds: Array.from(ids),
            });
        },
        [
            selectionCount,
            selectedNodeIds,
            nodes,
            edges,
            history,
            autosave,
            changeEmitter,
        ],
    );
    const handleDistribute = useCallback(
        (axis: DistributeAxis) => {
            if (selectionCount < 3) return;
            const ids = new Set(selectedNodeIds);
            history.push({ nodes, edges });
            setNodes((nds) => distributeNodes(nds, ids, axis));
            autosave.markDirty();
            changeEmitter.emit("node.move", {
                nodeIds: Array.from(ids),
            });
        },
        [
            selectionCount,
            selectedNodeIds,
            nodes,
            edges,
            history,
            autosave,
            changeEmitter,
        ],
    );

    // R29 — bulk delete. Delete key already works via xyflow's
    // selection-aware change pipeline; this is the explicit
    // toolbar affordance so the action is discoverable when ≥2
    // are selected.
    const handleBulkDelete = useCallback(() => {
        if (selectionCount === 0) return;
        const ids = new Set(selectedNodeIds);
        history.push({ nodes, edges });
        setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
        // Also strip edges that reference any of the removed
        // nodes — xyflow does this on Delete key but the manual
        // path needs the same cleanup.
        setEdges((eds) =>
            eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
        );
        autosave.markDirty();
        changeEmitter.emit("node.remove", {
            nodeIds: Array.from(ids),
        });
    }, [
        selectionCount,
        selectedNodeIds,
        nodes,
        edges,
        history,
        autosave,
        changeEmitter,
    ]);

    useKeyboardShortcut("mod+z", handleUndo, {
        description: "Undo last canvas edit",
        enabled: Boolean(activeId),
    });
    useKeyboardShortcut("mod+shift+z", handleRedo, {
        description: "Redo last undone edit",
        enabled: Boolean(activeId),
    });
    useKeyboardShortcut("mod+s", () => void handleSave(), {
        description: "Save the current process map",
        enabled: Boolean(activeId),
    });

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
            {/* Chrome zone — row 1 of 2: process metadata + document
                actions. Transparent so it inherits the frame surface;
                a hairline divides it from the palette row below. */}
            <div
                className="flex items-center gap-default border-b border-canvas-border px-default py-2.5"
                data-persisted-canvas-toolbar="true"
            >
                <select
                    value={activeId ?? ""}
                    onChange={(e) =>
                        onActiveIdChange(e.target.value || null)
                    }
                    disabled={processes.length === 0 || loading || saving}
                    className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-1 text-xs text-content-emphasis focus:border-border-emphasis focus:outline-none"
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
                        className="min-w-[140px] rounded-[6px] border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-content-emphasis hover:border-canvas-border focus:border-border-emphasis focus:bg-canvas-surface focus:outline-none"
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
                    {/* R28 — undo / redo. Pure icon buttons live
                        in the toolbar's right-side cluster so the
                        keyboard-bind discovery (`Cmd+Z` / `Cmd+Shift+Z`)
                        is mirrored visually. Disabled states drop
                        out via the history hook's flags. */}
                    {activeId && (
                        <>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={handleUndo}
                                disabled={!history.canUndo || saving || loading}
                                aria-label="Undo"
                                title="Undo (Cmd/Ctrl+Z)"
                                data-testid="canvas-undo-btn"
                            >
                                Undo
                            </Button>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={handleRedo}
                                disabled={!history.canRedo || saving || loading}
                                aria-label="Redo"
                                title="Redo (Cmd/Ctrl+Shift+Z)"
                                data-testid="canvas-redo-btn"
                            >
                                Redo
                            </Button>
                            {/* Snap-to-grid toggle. Persists per
                                tenant in localStorage; reads as a
                                soft pill so it stays calm next to
                                the action buttons. */}
                            <button
                                type="button"
                                onClick={() => setSnapEnabled((v) => !v)}
                                className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-1 text-[11px] font-medium text-content-muted hover:border-border-emphasis hover:text-content-emphasis aria-pressed:border-border-emphasis aria-pressed:bg-canvas-node aria-pressed:text-content-emphasis"
                                aria-pressed={snapEnabled}
                                aria-label="Snap to grid"
                                title="Snap to grid"
                                data-testid="canvas-snap-toggle"
                            >
                                Snap
                            </button>
                        </>
                    )}
                    {error && (
                        <span
                            className="text-xs text-content-error"
                            role="alert"
                        >
                            {error}
                        </span>
                    )}
                    {/* R28 — autosave status. Quietly reports the
                        debounce state; vanishes when idle so the
                        toolbar isn't carrying constant chrome. */}
                    {autosave.status === "pending" && (
                        <span
                            className="text-[11px] text-content-subtle"
                            data-testid="autosave-status"
                            data-autosave-status="pending"
                        >
                            Unsaved
                        </span>
                    )}
                    {autosave.status === "saving" && (
                        <span
                            className="text-[11px] text-content-subtle"
                            data-testid="autosave-status"
                            data-autosave-status="saving"
                        >
                            Saving…
                        </span>
                    )}
                    {autosave.status === "saved" && (
                        <span
                            className="text-[11px] text-content-success"
                            data-testid="autosave-status"
                            data-autosave-status="saved"
                        >
                            Saved
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
            {/* R29 — multi-select toolbar. Renders only when ≥2
                nodes are selected; vanishes back to the natural
                palette + help-strip layout when the selection
                drops. The alignment + distribute buttons stay
                inside one slim strip rather than spawning a
                second permanent row of chrome. */}
            {selectionCount >= 2 && (
                <div
                    className="flex flex-wrap items-center gap-tight border-b border-canvas-border bg-canvas-frame px-default py-2 text-[11px]"
                    data-multi-select-toolbar="true"
                    data-selection-count={selectionCount}
                >
                    <span
                        className="mr-1 font-semibold uppercase tracking-wider text-content-subtle"
                        aria-label={`${selectionCount} nodes selected`}
                    >
                        {selectionCount} selected
                    </span>
                    <span className="mr-1 text-content-subtle">·</span>
                    <span className="text-content-muted">Align</span>
                    <button
                        type="button"
                        className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-0.5 text-content-muted hover:border-border-emphasis hover:text-content-emphasis"
                        onClick={() => handleAlign("left")}
                        data-testid="align-left-btn"
                        aria-label="Align left"
                        title="Align left"
                    >
                        L
                    </button>
                    <button
                        type="button"
                        className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-0.5 text-content-muted hover:border-border-emphasis hover:text-content-emphasis"
                        onClick={() => handleAlign("center-x")}
                        data-testid="align-center-x-btn"
                        aria-label="Align centre horizontally"
                        title="Align centre horizontally"
                    >
                        C
                    </button>
                    <button
                        type="button"
                        className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-0.5 text-content-muted hover:border-border-emphasis hover:text-content-emphasis"
                        onClick={() => handleAlign("right")}
                        data-testid="align-right-btn"
                        aria-label="Align right"
                        title="Align right"
                    >
                        R
                    </button>
                    <span className="mx-1 text-content-subtle">·</span>
                    <button
                        type="button"
                        className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-0.5 text-content-muted hover:border-border-emphasis hover:text-content-emphasis"
                        onClick={() => handleAlign("top")}
                        data-testid="align-top-btn"
                        aria-label="Align top"
                        title="Align top"
                    >
                        T
                    </button>
                    <button
                        type="button"
                        className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-0.5 text-content-muted hover:border-border-emphasis hover:text-content-emphasis"
                        onClick={() => handleAlign("center-y")}
                        data-testid="align-center-y-btn"
                        aria-label="Align centre vertically"
                        title="Align centre vertically"
                    >
                        M
                    </button>
                    <button
                        type="button"
                        className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-0.5 text-content-muted hover:border-border-emphasis hover:text-content-emphasis"
                        onClick={() => handleAlign("bottom")}
                        data-testid="align-bottom-btn"
                        aria-label="Align bottom"
                        title="Align bottom"
                    >
                        B
                    </button>
                    {selectionCount >= 3 && (
                        <>
                            <span className="mx-1 text-content-subtle">·</span>
                            <span className="text-content-muted">
                                Distribute
                            </span>
                            <button
                                type="button"
                                className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-0.5 text-content-muted hover:border-border-emphasis hover:text-content-emphasis"
                                onClick={() => handleDistribute("horizontal")}
                                data-testid="distribute-h-btn"
                                aria-label="Distribute horizontally"
                                title="Distribute horizontally"
                            >
                                H
                            </button>
                            <button
                                type="button"
                                className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-0.5 text-content-muted hover:border-border-emphasis hover:text-content-emphasis"
                                onClick={() => handleDistribute("vertical")}
                                data-testid="distribute-v-btn"
                                aria-label="Distribute vertically"
                                title="Distribute vertically"
                            >
                                V
                            </button>
                        </>
                    )}
                    <span className="mx-1 text-content-subtle">·</span>
                    <button
                        type="button"
                        className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-0.5 text-content-error hover:border-border-error hover:bg-bg-error"
                        onClick={handleBulkDelete}
                        data-testid="bulk-delete-btn"
                        aria-label={`Delete ${selectionCount} selected nodes`}
                        title="Delete selected (Del)"
                    >
                        Delete
                    </button>
                </div>
            )}
            <CanvasHelpStrip
                nodeCount={nodes.length}
                edgeCount={edges.length}
            />
            <div className="flex flex-1 min-h-0">
                {/* The canvas plane — the recessed working surface.
                    A distinct deep token + a top inner shadow make it
                    read as sunk below the chrome: the dominant region,
                    visually separated from the frame around it. */}
                <div
                    className="relative flex-1 min-h-0 bg-canvas-surface shadow-canvas-recess"
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
                        // R28 — connection validity. Rejects self-
                        // loops, duplicate directed pairs, and any
                        // edge touching an annotation node.
                        isValidConnection={isValidConnection}
                        // R28 — snap to grid. Toggled by the
                        // toolbar control; persisted per tenant in
                        // localStorage. 16px grid is one Background
                        // dot step ÷ 1.5 — fine enough to feel
                        // precise, loose enough that snapping is
                        // visible.
                        snapToGrid={snapEnabled}
                        snapGrid={[16, 16]}
                        // R29 — only paint nodes within the
                        // viewport. xyflow's culling pass; pairs
                        // with the existing `memo()` on the
                        // ProcessTypedNode renderer so off-screen
                        // nodes neither mount nor re-render on
                        // every viewport tick. Keeps medium-large
                        // graphs (200+ nodes) interactive on the
                        // canvas.
                        onlyRenderVisibleElements
                        fitView
                        proOptions={{ hideAttribution: true }}
                        aria-label="Process canvas"
                    >
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={24}
                            size={1.3}
                            color="var(--canvas-grid)"
                        />
                    </ReactFlow>
                </div>
                {/* R26-PR-E inspector — mounts when a node is
                    selected; hides cleanly otherwise. R28 extends
                    it to edges: an edge selection mounts the same
                    panel with label + variant fields. */}
                <ProcessInspector
                    node={selectedNode}
                    edge={selectedEdge}
                    onUpdate={handleInspectorUpdate}
                    onEdgeUpdate={handleEdgeUpdate}
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
