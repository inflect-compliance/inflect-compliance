/**
 * R27-PR-B — ProcessEdge rendered tests.
 *
 * One render per connection variant — asserts the line signature
 * (solid / dashed / dotted) the structural ratchet can't see in the
 * computed SVG path style.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { ProcessEdge } from '@/components/processes/ProcessEdge';
import { TenantProvider } from '@/lib/tenant-context-provider';

// EdgeLabelRenderer portals into a target only the full <ReactFlow> mount
// creates. Render its children inline so edge-mounted overlays (control
// pills, label chips) land in the container under this lightweight harness.
// BaseEdge / getBezierPath / ReactFlowProvider stay real.
jest.mock('@xyflow/react', () => {
    const actual = jest.requireActual('@xyflow/react');
    return {
        ...actual,
        EdgeLabelRenderer: ({ children }: any) => <>{children}</>,
    };
});

// Stub the tenant-controls fetch: no live control list in the test env, so
// pills deterministically fall back to their persisted label (and no async
// setState → no act() warning).
jest.mock('@/lib/processes/use-tenant-controls', () => {
    const actual = jest.requireActual('@/lib/processes/use-tenant-controls');
    return {
        ...actual,
        useTenantControls: () => ({ options: [], loading: false, error: null }),
    };
});

const TENANT_CTX = {
    userId: 'u1',
    tenantId: 't1',
    tenantSlug: 'acme',
    tenantName: 'Acme',
    role: 'OWNER',
    permissions: {
        canRead: true,
        canWrite: true,
        canAdmin: true,
        canAudit: true,
        canExport: true,
    },
    appPermissions: {} as any,
} as any;

function renderEdge(variant: string, selected = false, data: any = {}) {
    return render(
        <TenantProvider value={TENANT_CTX}>
            <ReactFlowProvider>
                <svg>
                    <ProcessEdge
                        {...({
                            id: 'e1',
                            source: 'a',
                            target: 'b',
                            sourceX: 0,
                            sourceY: 0,
                            targetX: 120,
                            targetY: 80,
                            sourcePosition: 'right',
                            targetPosition: 'left',
                            selected,
                            data: { variant, ...data },
                        } as any)}
                    />
                </svg>
            </ReactFlowProvider>
        </TenantProvider>,
    );
}

function edgePathStyle(container: HTMLElement): string {
    const path = container.querySelector('.react-flow__edge-path');
    expect(path).not.toBeNull();
    return path!.getAttribute('style') ?? '';
}

describe('ProcessEdge — connection variants', () => {
    it('flow renders a SOLID stroke (no dash) on the canvas-edge token', () => {
        const { container } = renderEdge('flow');
        const style = edgePathStyle(container);
        expect(style).not.toMatch(/dasharray/);
        expect(style).toMatch(/var\(--canvas-edge\)/);
    });

    it('conditional renders a DASHED stroke', () => {
        const { container } = renderEdge('conditional');
        expect(edgePathStyle(container)).toMatch(/stroke-dasharray:\s*7 5/);
    });

    it('reference renders a DOTTED, round-capped stroke', () => {
        const { container } = renderEdge('reference');
        const style = edgePathStyle(container);
        expect(style).toMatch(/stroke-dasharray:\s*1 6/);
        expect(style).toMatch(/stroke-linecap:\s*round/);
    });

    it('an unknown / missing variant falls back to flow (solid)', () => {
        const { container } = renderEdge('not-a-variant');
        expect(edgePathStyle(container)).not.toMatch(/dasharray/);
    });

    it('a selected edge lifts to the brand stroke but keeps its dash', () => {
        const { container } = renderEdge('conditional', true);
        const style = edgePathStyle(container);
        expect(style).toMatch(/var\(--brand-default\)/);
        expect(style).toMatch(/stroke-dasharray:\s*7 5/);
    });
});

describe('ProcessEdge — persisted controls (PR-D)', () => {
    it('renders one badge per persisted control, falling back to saved label', () => {
        const { container } = renderEdge('flow', false, {
            controls: [
                { controlKey: 'k1', label: 'AC-2 · Account Mgmt', controlId: 'c1' },
                { controlKey: 'k2', label: 'AC-3 · Access', controlId: 'c2' },
            ],
        });
        const badges = container.querySelectorAll(
            '[data-control-on-edge-badge="true"]',
        );
        expect(badges.length).toBe(2);
        // Control list has not loaded in the test env, so the pill falls
        // back to the persisted label — proving a saved pill re-renders
        // without any live fetch.
        expect(container.textContent).toContain('AC-2 · Account Mgmt');
        expect(container.textContent).toContain('AC-3 · Access');
    });

    it('renders no control badge when there are no persisted controls', () => {
        const { container } = renderEdge('flow');
        expect(
            container.querySelectorAll('[data-control-on-edge-badge="true"]')
                .length,
        ).toBe(0);
    });
});
