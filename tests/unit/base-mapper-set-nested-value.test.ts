/**
 * `setNestedValue` prototype-pollution guard — CodeQL alert
 * `js/prototype-pollution-utility` (alert #11, 2026-05-12).
 *
 * The function walks a dot-separated `path` and writes `value` into
 * nested objects. Without a guard, a path like `__proto__.polluted`
 * mutates `Object.prototype`, polluting EVERY object in the runtime.
 * Today `path` comes from integration-mapping config (admin-defined),
 * so the risk is theoretical — but the guard is cheap and forecloses
 * the entire bug class.
 *
 * This test asserts each dangerous-key shape is rejected silently
 * (no throw, no mutation), and that the legitimate happy paths still
 * write through unchanged.
 */

import { setNestedValue } from '@/app-layer/integrations/base-mapper';

describe('setNestedValue', () => {
    describe('happy path', () => {
        it('sets a top-level key', () => {
            const obj: Record<string, unknown> = {};
            setNestedValue(obj, 'name', 'inflect');
            expect(obj).toEqual({ name: 'inflect' });
        });

        it('creates intermediate objects for a nested path', () => {
            const obj: Record<string, unknown> = {};
            setNestedValue(obj, 'a.b.c', 42);
            expect(obj).toEqual({ a: { b: { c: 42 } } });
        });

        it('overwrites an existing nested value', () => {
            const obj: Record<string, unknown> = { a: { b: 1 } };
            setNestedValue(obj, 'a.b', 2);
            expect(obj).toEqual({ a: { b: 2 } });
        });
    });

    describe('prototype-pollution guard', () => {
        beforeEach(() => {
            // Defence in depth: the test itself must not leave
            // Object.prototype dirty even if the guard regresses,
            // since other Jest suites would inherit the pollution.
            delete (Object.prototype as Record<string, unknown>).polluted;
        });

        it('rejects a top-level `__proto__` key', () => {
            const obj: Record<string, unknown> = {};
            setNestedValue(obj, '__proto__', { polluted: 'yes' });
            expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
            expect(obj).toEqual({});
        });

        it('rejects `__proto__` mid-path', () => {
            const obj: Record<string, unknown> = {};
            setNestedValue(obj, '__proto__.polluted', 'yes');
            expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
            expect(obj).toEqual({});
        });

        it('rejects `__proto__` deep in a path', () => {
            const obj: Record<string, unknown> = {};
            setNestedValue(obj, 'a.b.__proto__.polluted', 'yes');
            expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
            // The whole write is skipped — neither the `a.b` chain
            // nor the polluted prototype gets mutated.
            expect(obj).toEqual({});
        });

        it('rejects `constructor` as a key', () => {
            const obj: Record<string, unknown> = {};
            setNestedValue(obj, 'constructor.prototype.polluted', 'yes');
            expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
            expect(obj).toEqual({});
        });

        it('rejects `prototype` as a key', () => {
            class Foo {}
            const obj: Record<string, unknown> = { Foo };
            setNestedValue(obj, 'Foo.prototype.polluted', 'yes');
            expect((Foo.prototype as Record<string, unknown>).polluted).toBeUndefined();
        });

        it('rejects silently — no throw', () => {
            const obj: Record<string, unknown> = {};
            // Caller must never see an exception for dangerous keys.
            // Throwing would let a malicious config crash the
            // integration runner; silent rejection just drops the
            // value (and is what the field-mapping behaviour expects
            // for "ignored fields" anyway).
            expect(() =>
                setNestedValue(obj, '__proto__.polluted', 'yes'),
            ).not.toThrow();
        });
    });
});
