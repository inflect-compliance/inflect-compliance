/**
 * EP-2 — shared Evidence enum → localized-label helpers.
 *
 * `EvidenceType` (FILE | LINK | TEXT | SCREENSHOT) and `EvidenceStatus`
 * (DRAFT | SUBMITTED | APPROVED | REJECTED | NEEDS_REVIEW +
 * PENDING_UPLOAD optimistic sentinel) were previously rendered raw in
 * several surfaces (the detail sheet printed `evidence.type` /
 * `evidence.status` verbatim, the gallery printed `row.status`). These
 * two resolvers centralise the enum → i18n mapping so table + sheet +
 * gallery all read the SAME localized label and no raw enum text ever
 * reaches the DOM.
 *
 * Both take a `useTranslations('evidence')` resolver. Values come from
 * the `typeLabels.*` / `statusLabels.*` message groups (en + bg 1:1).
 * A missing key falls back to the raw enum so an un-mapped future enum
 * member degrades to its identifier rather than a dotted key path.
 */

type T = (key: string, values?: Record<string, string | number>) => string;

/** Localized `EvidenceType` label (`t` = `useTranslations('evidence')`). */
export function evidenceTypeLabel(type: string | null | undefined, t: T): string {
    if (!type) return '';
    const key = `typeLabels.${type}`;
    const label = t(key);
    // next-intl returns the dotted key path for an unmapped key — fall
    // back to the raw enum member so the DOM never shows `typeLabels.X`.
    return label === key || label.endsWith(`.${type}`) ? type : label;
}

/** Localized `EvidenceStatus` label (`t` = `useTranslations('evidence')`). */
export function evidenceStatusLabel(status: string | null | undefined, t: T): string {
    if (!status) return '';
    const key = `statusLabels.${status}`;
    const label = t(key);
    return label === key || label.endsWith(`.${status}`) ? status : label;
}

/**
 * Localized `ReviewAction` label for the review-history timeline.
 * `ReviewAction` (SUBMITTED | APPROVED | REJECTED) shares its members
 * with `EvidenceStatus`, so the status-label group is the source of
 * truth — one translation, two consumers.
 */
export function evidenceReviewActionLabel(action: string | null | undefined, t: T): string {
    return evidenceStatusLabel(action, t);
}
