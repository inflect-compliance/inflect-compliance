/**
 * Minimal shim of `@dub/utils` for the jsdom test project.
 *
 * The real `@dub/utils` barrel pulls in a large tree of Dub marketing/
 * pricing constants plus ESM-only deps (`@sindresorhus/slugify`) that
 * Jest can't transform. The primitives we're testing only use `cn()`,
 * `resizeImage()`, and a couple of string helpers from that barrel, so
 * we stub them explicitly.
 */

export { default as cn } from 'clsx';
// clsx returns a string; cn in @dub/utils runs through twMerge, but
// for assertion purposes (className includes a token substring)
// clsx's behaviour is equivalent.

// String helpers used by the filter primitives (Filter.Select /
// Filter.List) when their dropdowns + active pills render. Faithful-
// enough stubs for assertion purposes.
export function truncate(
    str: string | null | undefined,
    length: number,
): string {
    if (!str || str.length <= length) return str ?? '';
    return `${str.slice(0, length)}…`;
}

export function pluralize(word: string, count: number): string {
    return count === 1 ? word : `${word}s`;
}

// Primitives that import `resizeImage` (FileUpload) don't exercise the
// resize path in render tests; a no-op stub keeps the import resolved.
export function resizeImage(): Promise<string> {
    return Promise.resolve('');
}
