/**
 * NOTE: src/lib/dto/pagination.ts is a pure type-declaration module — it
 * exports only the `PageInfo` and `PaginatedResponse<T>` interfaces and
 * contains no executable runtime code (no functions or constants). These
 * tests act as compile-time type-conformance contracts: each object must
 * structurally satisfy its interface, and we assert the concrete shapes to
 * document the API pagination contract and exercise the import.
 */
import type { PageInfo, PaginatedResponse } from '@/lib/dto/pagination';

describe('Pagination DTOs (type-conformance contracts)', () => {
    it('PageInfo describes a non-terminal page with a cursor', () => {
        const pageInfo: PageInfo = {
            nextCursor: 'cursor-abc',
            hasNextPage: true,
        };

        expect(pageInfo.nextCursor).toBe('cursor-abc');
        expect(pageInfo.hasNextPage).toBe(true);
    });

    it('PageInfo describes a terminal page (nextCursor optional/omitted)', () => {
        const pageInfo: PageInfo = {
            hasNextPage: false,
        };

        expect(pageInfo.nextCursor).toBeUndefined();
        expect(pageInfo.hasNextPage).toBe(false);
    });

    it('PaginatedResponse wraps a typed items array plus pageInfo', () => {
        const response: PaginatedResponse<{ id: string; name: string }> = {
            items: [
                { id: '1', name: 'Alpha' },
                { id: '2', name: 'Beta' },
            ],
            pageInfo: { nextCursor: 'cursor-2', hasNextPage: true },
        };

        expect(response.items).toHaveLength(2);
        expect(response.items[0].id).toBe('1');
        expect(response.pageInfo.hasNextPage).toBe(true);
    });

    it('PaginatedResponse supports an empty result set', () => {
        const response: PaginatedResponse<number> = {
            items: [],
            pageInfo: { hasNextPage: false },
        };

        expect(response.items).toEqual([]);
        expect(response.pageInfo.hasNextPage).toBe(false);
        expect(response.pageInfo.nextCursor).toBeUndefined();
    });
});
