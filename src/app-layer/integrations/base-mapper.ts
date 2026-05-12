/**
 * Base Field Mapper
 *
 * Abstract base class for bidirectional field mapping between local
 * (inflect-compliance) objects and remote system objects.
 *
 * Inspired by CISO-Assistant's BaseFieldMapper pattern:
 *   - Declarative FIELD_MAPPINGS registry
 *   - Bidirectional toRemote / toLocal
 *   - Partial updates (toRemotePartial)
 *   - Transform hooks for value conversion
 *   - Nested field support (dot notation)
 *   - Per-instance custom mapping overrides
 *
 * ═══════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   class JiraMapper extends BaseFieldMapper {
 *       protected readonly fieldMappings = {
 *           title:       'summary',
 *           description: 'description',
 *           status:      'status.name',
 *           assignee:    'assignee.displayName',
 *       };
 *
 *       protected transformToRemote(field, value) {
 *           if (field === 'status') return statusToJira(value);
 *           return value;
 *       }
 *
 *       protected transformToLocal(field, value) {
 *           if (field === 'status') return jiraToStatus(value);
 *           return value;
 *       }
 *   }
 *
 * @module integrations/base-mapper
 */

// ─── Types ───────────────────────────────────────────────────────────

/**
 * A field mapping entry — maps a local field name to a remote field path.
 * Remote paths support dot-notation for nested access (e.g. 'fields.summary').
 */
export type FieldMappings = Record<string, string>;

/**
 * Options for mapper construction.
 */
export interface FieldMapperOptions {
    /**
     * Per-instance custom mappings that override (or extend) the class-level
     * FIELD_MAPPINGS. This allows tenants to customize mappings at runtime.
     */
    customMappings?: FieldMappings;
}

// ─── Base Mapper ─────────────────────────────────────────────────────

/**
 * Abstract base class for bidirectional field mapping.
 *
 * Subclasses MUST define `fieldMappings` and implement the two
 * transform hooks: `transformToRemote` and `transformToLocal`.
 */
export abstract class BaseFieldMapper {
    /**
     * Class-level field mappings.
     * Format: `{ localFieldName: 'remote.field.path' }`
     */
    protected abstract readonly fieldMappings: FieldMappings;

    /** Per-instance overrides from configuration or tenant settings */
    private readonly customMappings: FieldMappings;

    constructor(options?: FieldMapperOptions) {
        this.customMappings = options?.customMappings ?? {};
    }

    // ── Public API ──

    /**
     * Convert a local object to its remote representation.
     * Iterates all mapped fields and applies transforms.
     *
     * @param localObject - Plain object with local field names
     * @returns Object with remote field names and transformed values
     */
    toRemote(localObject: Record<string, unknown>): Record<string, unknown> {
        const remote: Record<string, unknown> = {};
        const mappings = this.getMergedMappings();

        for (const [localField, remoteField] of Object.entries(mappings)) {
            const value = getNestedValue(localObject, localField);
            if (value === undefined) continue;

            const transformed = this.transformToRemote(localField, value);
            if (transformed === undefined) continue;

            setNestedValue(remote, remoteField, transformed);
        }

        return remote;
    }

    /**
     * Convert only specific changed fields to remote format.
     * Used for partial / PATCH updates.
     *
     * @param localObject   - The full local object
     * @param changedFields - List of local field names that changed
     * @returns Object with only the changed remote fields
     */
    toRemotePartial(
        localObject: Record<string, unknown>,
        changedFields: string[],
    ): Record<string, unknown> {
        const remote: Record<string, unknown> = {};
        const mappings = this.getMergedMappings();

        for (const localField of changedFields) {
            const remoteField = mappings[localField];
            if (!remoteField) continue;

            const value = getNestedValue(localObject, localField);
            if (value === undefined) continue;

            const transformed = this.transformToRemote(localField, value);
            if (transformed === undefined) continue;

            setNestedValue(remote, remoteField, transformed);
        }

        return remote;
    }

    /**
     * Convert a remote object to its local representation.
     * Reverses the field mapping direction and applies local transforms.
     *
     * @param remoteObject - Plain object with remote field names
     * @returns Object with local field names and transformed values
     */
    toLocal(remoteObject: Record<string, unknown>): Record<string, unknown> {
        const local: Record<string, unknown> = {};
        const reverseMappings = this.getReverseMappings();

        for (const [remoteField, localField] of Object.entries(reverseMappings)) {
            const value = getNestedValue(remoteObject, remoteField);
            if (value === undefined) continue;

            const transformed = this.transformToLocal(localField, value);
            if (transformed === undefined) continue;

            local[localField] = transformed;
        }

        return local;
    }

    /**
     * Get the list of local field names that have mappings.
     */
    getMappedLocalFields(): string[] {
        return Object.keys(this.getMergedMappings());
    }

    /**
     * Get the list of remote field paths that have mappings.
     */
    getMappedRemoteFields(): string[] {
        return Object.values(this.getMergedMappings());
    }

    // ── Transform Hooks (subclass must implement) ──

    /**
     * Transform a local field value for the remote system.
     * Called per-field during toRemote / toRemotePartial.
     *
     * Return `undefined` to skip this field.
     *
     * @param field - Local field name
     * @param value - Local field value
     * @returns Transformed value for the remote system
     */
    protected abstract transformToRemote(
        field: string,
        value: unknown,
    ): unknown;

    /**
     * Transform a remote field value for the local system.
     * Called per-field during toLocal.
     *
     * Return `undefined` to skip this field.
     *
     * @param field - Local field name (already reverse-mapped)
     * @param value - Remote field value
     * @returns Transformed value for the local system
     */
    protected abstract transformToLocal(
        field: string,
        value: unknown,
    ): unknown;

    // ── Internal Helpers ──

    /**
     * Merge class-level and instance-level mappings.
     * Instance-level (custom) mappings take precedence.
     */
    private getMergedMappings(): FieldMappings {
        return { ...this.fieldMappings, ...this.customMappings };
    }

    /**
     * Build a reverse mapping: remote → local.
     */
    private getReverseMappings(): FieldMappings {
        const merged = this.getMergedMappings();
        const reverse: FieldMappings = {};
        for (const [local, remote] of Object.entries(merged)) {
            reverse[remote] = local;
        }
        return reverse;
    }
}

// ─── Nested Field Utilities ──────────────────────────────────────────

/**
 * Get a value from a nested object using dot-notation path.
 *
 * @example getNestedValue({ a: { b: 1 } }, 'a.b') → 1
 */
export function getNestedValue(
    obj: Record<string, unknown>,
    path: string,
): unknown {
    if (!path.includes('.')) return obj[path];

    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

/**
 * Set a value in a nested object using dot-notation path.
 * Creates intermediate objects as needed.
 *
 * @example setNestedValue({}, 'a.b', 1) → { a: { b: 1 } }
 *
 * Path keys equal to `__proto__`, `constructor`, or `prototype` are
 * REJECTED at any depth — those names would let an attacker mutate
 * `Object.prototype` or a class constructor via crafted mapping
 * data. Today `path` comes from integration-mapping config (admin-
 * defined, source-controlled), so the risk is theoretical — but
 * the guard is cheap and forecloses the bug class.
 */
const PROTOTYPE_POLLUTION_KEYS = new Set([
    '__proto__',
    'constructor',
    'prototype',
]);

export function setNestedValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
): void {
    if (!path.includes('.')) {
        if (PROTOTYPE_POLLUTION_KEYS.has(path)) return;
        obj[path] = value;
        return;
    }

    const parts = path.split('.');
    if (parts.some((p) => PROTOTYPE_POLLUTION_KEYS.has(p))) return;
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!(part in current) || typeof current[part] !== 'object') {
            current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
}
