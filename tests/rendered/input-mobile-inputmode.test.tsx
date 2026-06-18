/**
 * Mobile PR-1 — <Input> derives `inputMode` from `type` so a correctly-typed
 * field brings up the right mobile keyboard, without every call site spelling
 * out `inputMode`. An explicit `inputMode` always wins.
 */
import { render } from "@testing-library/react";
import * as React from "react";

import { Input } from "@/components/ui/input";

function inputEl(container: HTMLElement): HTMLInputElement {
    const el = container.querySelector("input");
    if (!el) throw new Error("no input rendered");
    return el as HTMLInputElement;
}

describe("Input inputMode derivation (mobile keyboards)", () => {
    it.each([
        ["email", "email"],
        ["tel", "tel"],
        ["number", "numeric"],
        ["search", "search"],
        ["url", "url"],
    ])("type=%s → inputMode=%s", (type, expected) => {
        const { container } = render(<Input type={type} />);
        expect(inputEl(container).inputMode).toBe(expected);
    });

    it("plain text type has no derived inputMode", () => {
        const { container } = render(<Input type="text" />);
        // jsdom reflects an unset inputMode as "" (default).
        expect(inputEl(container).inputMode).toBe("");
    });

    it("an explicit inputMode overrides the derived one", () => {
        const { container } = render(
            <Input type="number" inputMode="decimal" />,
        );
        expect(inputEl(container).inputMode).toBe("decimal");
    });
});
