"use client";

/**
 * Epic 55 — shared <Input> primitive.
 *
 * Token-backed, CVA-sized, accessible text/number/password/etc. input
 * that composes cleanly with <Label> and <FormField>. Keeps the legacy
 * password-toggle + inline-error affordances from the Dub port but
 * pivots every colour to the Epic 51 semantic token palette so the same
 * component works in dark + light themes.
 *
 * API surface (props):
 *   - Standard HTMLInputElement attrs (value, onChange, placeholder, …).
 *   - `size`: "sm" | "md" | "lg" — CVA variant, default "md".
 *   - `invalid`: boolean — toggles error styling and `aria-invalid`.
 *   - `error`: string — renders a role="alert" hint below the input.
 *     Supplying `error` implies `invalid`.
 *   - `description`: string — renders a muted hint below the input.
 *
 * Accessibility:
 *   - `aria-invalid` mirrors `invalid` / presence of `error`.
 *   - `aria-describedby` auto-links to the error + description elements
 *     when an `id` is supplied. Downstream `<FormField>` wraps both in
 *     one id-linked package.
 */

import { cn } from "@dub/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle } from "lucide-react";
import * as React from "react";
import { Eye, EyeSlash } from "./icons";

// ─── CVA ────────────────────────────────────────────────────────────

export const inputVariants = cva(
    [
        "w-full rounded-lg border text-sm transition-colors",
        "bg-bg-default text-content-emphasis placeholder-content-subtle",
        "border-border-subtle",
        "hover:border-border-emphasis",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-border-emphasis",
        "disabled:cursor-not-allowed disabled:bg-bg-muted disabled:text-content-muted disabled:hover:border-border-subtle",
        "read-only:bg-bg-muted read-only:text-content-muted read-only:hover:border-border-subtle",
    ],
    {
        variants: {
            size: {
                sm: "h-8 px-2.5 text-xs",
                md: "h-9 px-3",
                lg: "h-10 px-3.5",
            },
            invalid: {
                true: "border-border-error text-content-error placeholder-content-error/60 focus-visible:border-border-error focus-visible:ring-border-error",
                false: "",
            },
        },
        defaultVariants: { size: "md", invalid: false },
    },
);

// ─── Props ──────────────────────────────────────────────────────────

type CvaInputProps = VariantProps<typeof inputVariants>;

export interface InputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
        Omit<CvaInputProps, "invalid"> {
    /** Show error styling + render an `role="alert"` hint below. */
    error?: string;
    /** Muted helper text rendered below the input. */
    description?: string;
    /** Force invalid styling (used when error is surfaced elsewhere). */
    invalid?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    (
        {
            className,
            type,
            size,
            invalid,
            error,
            description,
            id,
            "aria-describedby": ariaDescribedBy,
            ...props
        },
        ref,
    ) => {
        const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
        const isPassword = type === "password";
        const effectiveType = isPassword && isPasswordVisible ? "text" : type;

        const hasError = Boolean(error);
        const effectiveInvalid = invalid || hasError;

        // Chain aria-describedby so consumers who pass their own ids
        // keep working; we append our own description/error ids when
        // the input has an id of its own.
        const errorId = id && hasError ? `${id}-error` : undefined;
        const descId = id && description ? `${id}-description` : undefined;
        const describedBy =
            [ariaDescribedBy, descId, errorId].filter(Boolean).join(" ") ||
            undefined;

        return (
            <div className="w-full">
                <div className="relative flex">
                    <input
                        type={effectiveType}
                        id={id}
                        ref={ref}
                        aria-invalid={effectiveInvalid || undefined}
                        aria-describedby={describedBy}
                        className={cn(
                            inputVariants({ size, invalid: effectiveInvalid }),
                            // Reserve room on the right for the error icon
                            // and/or password toggle so the text doesn't
                            // slide under them.
                            (hasError || isPassword) && "pr-9",
                            hasError && isPassword && "pr-14",
                            className,
                        )}
                        {...props}
                    />

                    {hasError && (
                        <div
                            className={cn(
                                "pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5",
                                isPassword && "transition-opacity group-hover:opacity-0",
                            )}
                        >
                            <AlertCircle
                                className="size-5 text-content-error"
                                aria-hidden="true"
                            />
                        </div>
                    )}

                    {isPassword && (
                        <button
                            type="button"
                            onClick={() => setIsPasswordVisible((v) => !v)}
                            className={cn(
                                "absolute inset-y-0 right-0 flex items-center px-2.5 text-content-muted transition-colors hover:text-content-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                hasError &&
                                    "opacity-0 transition-opacity group-hover:opacity-100",
                            )}
                            aria-label={
                                isPasswordVisible ? "Hide password" : "Show password"
                            }
                            tabIndex={-1}
                        >
                            {isPasswordVisible ? (
                                <Eye className="size-4" aria-hidden="true" />
                            ) : (
                                <EyeSlash className="size-4" aria-hidden="true" />
                            )}
                        </button>
                    )}
                </div>

                {description && !hasError && (
                    <p
                        id={descId}
                        className="mt-1.5 text-xs text-content-muted"
                    >
                        {description}
                    </p>
                )}

                {hasError && (
                    <p
                        id={errorId}
                        role="alert"
                        aria-live="polite"
                        className="mt-1.5 text-xs text-content-error"
                    >
                        {error}
                    </p>
                )}
            </div>
        );
    },
);

Input.displayName = "Input";

export { Input };
