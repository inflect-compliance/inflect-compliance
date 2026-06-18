/**
 * Canonical dropdown — option names are NEVER truncated.
 *
 * Behavioural proof for the shared `Combobox` (the most-used dropdown), in BOTH
 * its rendering branches:
 *   - cmdk path (≤ 50 options)
 *   - virtualized path (> 50 options) — the branch that used to apply a
 *     fixed-height row + `truncate`.
 *
 * A long option label must render IN FULL (full text present in the DOM) and
 * the label element must not carry a truncating utility class
 * (`truncate` / `text-ellipsis` / `line-clamp-*`). The structural ratchet
 * `tests/guards/dropdowns-no-option-truncation.test.ts` locks the same
 * invariant across every other dropdown surface (filters, gear, switcher).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

const LONG_LABEL =
    "Information Security Policy Review and Approval Workflow — Quarterly Attestation and Continuous Monitoring Control";

const TRUNCATING_CLASS = /\b(truncate|text-ellipsis|line-clamp-\d+)\b/;

function Harness({ count }: { count: number }) {
    const [selected, setSelected] = React.useState<ComboboxOption | null>(null);
    const options = React.useMemo<ComboboxOption[]>(
        () => [
            { value: "long", label: LONG_LABEL },
            ...Array.from({ length: count - 1 }, (_, i) => ({
                value: `opt-${i}`,
                label: `Option ${i.toString().padStart(3, "0")}`,
            })),
        ],
        [count],
    );
    return (
        <Combobox
            options={options}
            selected={selected}
            setSelected={(opt) => setSelected(opt)}
            placeholder="Pick an option"
            searchPlaceholder="Search…"
            forceDropdown
        />
    );
}

describe("Combobox options never truncate the option name", () => {
    it("cmdk path (≤50 options): long label renders in full, no truncating class", async () => {
        const user = userEvent.setup();
        render(<Harness count={5} />);
        await user.click(screen.getByRole("combobox"));

        const labelEl = screen.getByText(LONG_LABEL);
        // Full text is present verbatim (not cut / ellipsised).
        expect(labelEl).toBeInTheDocument();
        expect(labelEl.textContent).toBe(LONG_LABEL);
        // The label element wraps, it does not truncate.
        expect(labelEl.className).not.toMatch(TRUNCATING_CLASS);
        expect(labelEl.className).toMatch(/\bbreak-words\b/);
    });

    it("virtualized path (>50 options): long label renders in full, no truncating class", async () => {
        const user = userEvent.setup();
        // Long label is option 0 so it's inside the initial render window.
        render(<Harness count={60} />);
        await user.click(screen.getByRole("combobox"));

        // Confirm we're on the virtualized branch.
        expect(
            document.querySelector("[data-virtualized-combobox]"),
        ).toBeInTheDocument();

        const labelEl = screen.getByText(LONG_LABEL);
        expect(labelEl.textContent).toBe(LONG_LABEL);
        expect(labelEl.className).not.toMatch(TRUNCATING_CLASS);
        expect(labelEl.className).toMatch(/\bbreak-words\b/);
    });
});
