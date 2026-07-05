"use client";

/**
 * Minimal in-panel tab bar for the control / task side panels.
 *
 * Deliberately NOT the TabSelect primitive (which the single-tab-pattern guard
 * bans in app pages) and NOT a detail-page EntityDetailLayout — this is a
 * lightweight 2-tab switch scoped to the side panel, using the canonical
 * `border-b` brand-underline active style so it reads consistently with the
 * detail-page tab bar.
 */
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export function PanelTabs<T extends string>({
    tabs,
    active,
    onSelect,
}: {
    tabs: { id: T; label: string }[];
    active: T;
    onSelect: (id: T) => void;
}) {
    const t = useTranslations("controls");
    return (
        <div role="tablist" aria-label={t("detail.tabs.ariaLabel")} className="flex gap-tight border-b border-border-subtle">
            {tabs.map((t) => (
                <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active === t.id}
                    onClick={() => onSelect(t.id)}
                    className={cn(
                        "-mb-px cursor-pointer border-b-2 px-3 py-1.5 text-sm transition-colors",
                        active === t.id
                            ? "border-[var(--brand-default)] text-content-emphasis"
                            : "border-transparent text-content-muted hover:text-content-emphasis",
                    )}
                >
                    {t.label}
                </button>
            ))}
        </div>
    );
}
