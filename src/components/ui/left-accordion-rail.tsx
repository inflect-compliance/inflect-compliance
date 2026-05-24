'use client';

/**
 * B7 — Left accordion rail.
 *
 * A docked left-side orientation pane that organises the
 * adjacent table into sections. Per-table the rail surfaces a
 * curated set of section groupings (e.g. "Status", "Framework",
 * "Owner") — each section is collapsed by default and expands on
 * an explicit user click. Inside an expanded section, the values
 * act as filter chips that route through the standard
 * `useFilterContext` state.
 *
 * Design constraints (per the user's brief):
 *
 *   • Quiet by default. No coloured banding, no hover-trigger
 *     expansion, no "this is the loudest thing on the page"
 *     attention pulls. The rail is a navigation companion, not a
 *     hero element.
 *
 *   • Click-only expand. No hover / focus auto-open semantics —
 *     opening a section is a deliberate gesture. Keyboard:
 *     ArrowUp / ArrowDown move between section triggers; Enter /
 *     Space toggles the focused one.
 *
 *   • External to the table's natural border. The rail sits in
 *     its own column with a `gap-section` separation from the
 *     table card — it never reads as embedded chrome.
 *
 *   • Orientation, not decoration. Each section organises the
 *     table's rows by a meaningful axis; clicking a value filters
 *     the table to that subset. Pure visual sections without a
 *     filter action would defeat the orientation purpose.
 *
 * The primitive owns the shell + the open/closed state machine.
 * Consumers describe their sections declaratively via
 * `<LeftAccordionRail sections={...} />`; per-section content
 * (the value list, the click handlers) is the caller's domain
 * knowledge.
 */
import {
    useId,
    useState,
    useCallback,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import { ChevronRight } from '@/components/ui/icons/nucleo/chevron-right';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@dub/utils';

// ─── Public types ──────────────────────────────────────────────────

export interface LeftAccordionRailSection {
    /** Stable identifier — drives expand/collapse + the `data-section` attribute. */
    id: string;
    /** Visible header copy. Kept compact (one or two words). */
    label: string;
    /**
     * Optional count badge. Shown in the header right-aligned —
     * the orientation cue that says "this section has 3 values
     * to choose from".
     */
    count?: number;
    /**
     * The expanded content. The primitive doesn't constrain the
     * shape — consumers typically render a list of clickable
     * filter chips or links, but free-form JSX is allowed.
     */
    content: ReactNode;
}

export interface LeftAccordionRailProps {
    /** Optional rail-level title. When omitted no title row renders. */
    title?: string;
    sections: ReadonlyArray<LeftAccordionRailSection>;
    /** Default-open section ids. Empty by default (quiet state). */
    defaultOpenIds?: ReadonlyArray<string>;
    /** Outer-container class override. */
    className?: string;
    /** Aria-label for the rail nav landmark. */
    ariaLabel?: string;
    /** Stable id forwarded to the outer container (E2E selector). */
    id?: string;
}

// ─── Component ─────────────────────────────────────────────────────

export function LeftAccordionRail({
    title,
    sections,
    defaultOpenIds,
    className,
    ariaLabel = 'Table orientation',
    id,
}: LeftAccordionRailProps) {
    // Quiet-by-default — no sections open unless the consumer
    // explicitly seeds `defaultOpenIds`.
    const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
        () => new Set(defaultOpenIds ?? []),
    );
    const reactId = useId();

    const toggle = useCallback((sectionId: string) => {
        setOpenIds((prev) => {
            const next = new Set(prev);
            if (next.has(sectionId)) next.delete(sectionId);
            else next.add(sectionId);
            return next;
        });
    }, []);

    const handleKeyDown = (
        e: KeyboardEvent<HTMLButtonElement>,
        idx: number,
    ) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const nextIdx =
                e.key === 'ArrowDown'
                    ? (idx + 1) % sections.length
                    : (idx - 1 + sections.length) % sections.length;
            const nextBtn = document.querySelector<HTMLButtonElement>(
                `[data-rail-section-trigger="${sections[nextIdx].id}"]`,
            );
            nextBtn?.focus();
        }
    };

    return (
        <nav
            id={id}
            data-testid={id ?? 'left-accordion-rail'}
            aria-label={ariaLabel}
            className={cn(
                // Sized for the docked column; the parent shell
                // owns column-width allocation. `w-60` (240px) at
                // xl+ is the canonical orientation-pane width;
                // mobile collapses to natural width because the
                // shell stacks the rail below the main column.
                cardVariants({ density: 'none' }),
                'xl:w-60 flex flex-col self-start',
                className,
            )}
        >
            {title && (
                <div className="border-b border-border-subtle px-3 py-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-content-subtle">
                        {title}
                    </span>
                </div>
            )}
            <ul className="flex flex-col" role="list">
                {sections.map((section, idx) => {
                    const isOpen = openIds.has(section.id);
                    const triggerId = `${reactId}-trigger-${section.id}`;
                    const contentId = `${reactId}-content-${section.id}`;
                    return (
                        <li key={section.id} className="border-b border-border-subtle last:border-b-0">
                            <button
                                type="button"
                                id={triggerId}
                                data-rail-section-trigger={section.id}
                                aria-controls={contentId}
                                aria-expanded={isOpen}
                                onClick={() => toggle(section.id)}
                                onKeyDown={(e) => handleKeyDown(e, idx)}
                                className={cn(
                                    // Quiet, not loud. Subtle hover
                                    // muting + the chevron rotation
                                    // are the only motion the rail
                                    // commits to.
                                    'flex w-full items-center justify-between gap-tight px-3 py-2 text-left text-sm text-content-default',
                                    'transition-colors duration-100 ease-out',
                                    'hover:bg-bg-muted/50 focus-visible:outline-none focus-visible:bg-bg-muted',
                                )}
                            >
                                <span className="flex items-center gap-tight min-w-0">
                                    <ChevronRight
                                        className={cn(
                                            'h-3.5 w-3.5 flex-shrink-0 text-content-subtle transition-transform duration-150 ease-out',
                                            isOpen && 'rotate-90',
                                        )}
                                        aria-hidden="true"
                                    />
                                    <span className="truncate font-medium">{section.label}</span>
                                </span>
                                {typeof section.count === 'number' && (
                                    <span
                                        className="rounded-full bg-bg-subtle px-1.5 py-0.5 text-[10px] tabular-nums text-content-subtle"
                                        aria-hidden="true"
                                    >
                                        {section.count}
                                    </span>
                                )}
                            </button>
                            {isOpen && (
                                <div
                                    id={contentId}
                                    role="region"
                                    aria-labelledby={triggerId}
                                    data-rail-section-content={section.id}
                                    className="px-3 pb-3 pt-1"
                                >
                                    {section.content}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
