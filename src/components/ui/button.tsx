"use client";

import { cn } from "@dub/utils";
import { VariantProps } from "class-variance-authority";
import { ReactNode, forwardRef } from "react";
import { LoadingSpinner } from "./icons";
import { Tooltip } from "./tooltip";
import { buttonVariants } from "./button-variants";

export { buttonVariants };

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  text?: ReactNode | string;
  textWrapperClassName?: string;
  shortcutClassName?: string;
  loading?: boolean;
  icon?: ReactNode;
  shortcut?: string;
  right?: ReactNode;
  disabledTooltip?: string | ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      text,
      variant = "primary",
      size,
      className,
      textWrapperClassName,
      shortcutClassName,
      loading,
      icon,
      shortcut,
      disabledTooltip,
      right,
      children,
      ...props
    }: ButtonProps,
    forwardedRef,
  ) => {
    const content = text ?? children;

    if (disabledTooltip) {
      return (
        <Tooltip content={disabledTooltip}>
          <div
            className={cn(
              "flex items-center justify-center gap-x-2 cursor-not-allowed",
              // R22-PR-A — radius mirror (12→10px).
              "rounded-full border border-border-subtle bg-bg-subtle text-sm text-content-subtle",
              // R20-PR-C — horizontal padding mirrors the airy
              // density scale (xs/sm don't size up; md/lg do).
              // R20-PR-E — graded font-weight ladder also mirrors
              // the cva size scale.
              // R20-PR-F density correction: md px-4→px-3, lg px-6→px-4.
              // button-density-tighter (2026-05-15) second pass:
              // xs → px-2, sm/md → px-2.5, lg → px-3.
              size === "xs" && "h-7 px-2 text-[11px] font-medium",
              size === "sm" && "h-8 px-2.5 text-xs font-medium",
              size === "lg" && "h-10 px-3 font-bold",
              !size && "h-9 px-2.5 font-semibold",
              className,
            )}
          >
            {icon}
            {content && (
              <div
                className={cn(
                  "min-w-0 truncate",
                  shortcut && "flex-1 text-left",
                  textWrapperClassName,
                )}
              >
                {content}
              </div>
            )}
            {shortcut && (
              <kbd
                className={cn(
                  "hidden rounded border border-border-subtle bg-bg-subtle px-2 py-0.5 text-xs font-light text-content-subtle md:inline-block",
                  shortcutClassName,
                )}
              >
                {shortcut}
              </kbd>
            )}
          </div>
        </Tooltip>
      );
    }

    return (
      <button
        ref={forwardedRef}
        type={props.onClick ? "button" : "submit"}
        className={cn(
          props.disabled || loading
            ? cn(
                "flex items-center justify-center gap-tight whitespace-nowrap",
                // R22-PR-A — radius mirror (12→10px).
                "rounded-full border border-border-subtle bg-bg-subtle text-content-subtle",
                "cursor-not-allowed outline-none text-sm",
                // R20-PR-C — mirror the airy density scale from
                // button-variants.ts. These classes drive the disabled
                // branch which does NOT route through the cva variant
                // (cn-only fallback for a non-interactive shape), so
                // they must move in lockstep. The R20-PR-C ratchet
                // asserts the two scales agree.
                //
                // R20-PR-E — graded font-weight ladder also mirrored
                // here (medium for xs/sm, semibold for md, bold for
                // lg). Locked by the R20-PR-E ratchet.
                //
                // R20-PR-F — density correction. md/lg tightened
                // (px-4→px-3 and px-6→px-4; lg gap-2.5→gap-tight)
                // because the PR-C airy padding read as "idle space"
                // on dense toolbars. Locked by R20-PR-F ratchet.
                //
                // button-density-tighter (2026-05-15) — second
                // tightening pass; mirrors the cva size scale.
                size === "xs" && "h-7 px-2 text-[11px] gap-1 rounded-md font-medium",
                size === "sm" && "h-8 px-2.5 text-xs gap-1.5 font-medium",
                size === "lg" && "h-10 px-3 gap-tight font-bold",
                !size && "h-9 px-2.5 gap-tight font-semibold",
              )
            : buttonVariants({ variant, size }),
          className,
        )}
        disabled={props.disabled || loading}
        {...props}
      >
        {loading ? <LoadingSpinner className="h-4 w-4" /> : icon ? icon : null}
        {content && (
          <div
            className={cn(
              "min-w-0 truncate",
              shortcut && "flex-1 text-left",
              textWrapperClassName,
            )}
          >
            {content}
          </div>
        )}
        {/**
         * PR-B — icon-balance ghost.
         *
         * When a button carries BOTH an icon AND a text label (the
         * canonical Plus-icon Create pattern), the prior
         * `justify-center` flex layout centred [icon][gap][text]
         * as one unit, which placed the TEXT right of the button's
         * geometric centre by half the icon+gap width. Visible
         * symptom: a Plus-Create button read off-centre.
         *
         * A `visibility: hidden` ghost mirroring the icon sits at
         * the trailing edge so the flex group becomes
         * [icon][gap][text][gap][ghost] — symmetric around the
         * text. The icon stays visible at the leading edge; the
         * text now sits at the button's geometric centre. Ghost is
         * `aria-hidden` and `pointer-events-none` so it never
         * participates in the accessibility tree or hit-testing.
         *
         * Suppressed when a `shortcut` is present (the shortcut
         * kbd carries its own trailing weight) or no `content`
         * (icon-only buttons don't need balancing).
         */}
        {icon && !loading && content && !shortcut && !right && (
          <span
            aria-hidden="true"
            className="invisible pointer-events-none"
            data-icon-balance-ghost
          >
            {icon}
          </span>
        )}
        {shortcut && (
          <kbd
            className={cn(
              "hidden rounded px-2 py-0.5 text-xs font-light transition-all duration-75 md:inline-block",
              {
                "bg-[var(--brand-default)] text-white/70 group-hover:bg-[var(--brand-muted)]":
                  variant === "primary",
                "bg-bg-elevated text-content-muted":
                  variant === "secondary",
                "bg-bg-muted text-content-muted": variant === "ghost",
                "bg-black/25 text-white/80": variant === "destructive",
                "bg-bg-error text-content-error":
                  variant === "destructive-outline",
              },
              shortcutClassName,
            )}
          >
            {shortcut}
          </kbd>
        )}
        {right}
      </button>
    );
  },
);

Button.displayName = "Button";

export { Button };
