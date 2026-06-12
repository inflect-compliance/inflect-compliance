/**
 * RQ3-OB-A — one pluralization voice.
 *
 * "last assessed 1 days ago" is a small lie, and small lies erode
 * trust in the big numbers beside them. One helper instead of three
 * inline ternaries; irregular forms pass the plural explicitly.
 */
export function pluralize(n: number, singular: string, plural?: string): string {
    return n === 1 ? singular : (plural ?? `${singular}s`);
}

/** "1 day ago" / "200 days ago" — the staleness narrative form. */
export function countNoun(n: number, singular: string, plural?: string): string {
    return `${n} ${pluralize(n, singular, plural)}`;
}
