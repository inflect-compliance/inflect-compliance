/**
 * Unit tests for the ControlException Zod schemas (Epic G-5).
 */
import {
    RequestExceptionSchema,
    ApproveExceptionSchema,
    RejectExceptionSchema,
    RenewExceptionSchema,
} from '@/app-layer/schemas/control-exception.schemas';

describe('control-exception.schemas', () => {
    describe('RequestExceptionSchema', () => {
        it('accepts a minimal valid input and trims justification', () => {
            const r = RequestExceptionSchema.parse({
                controlId: 'c1',
                justification: '  legacy system  ',
                riskAcceptedByUserId: 'u1',
            });
            expect(r.justification).toBe('legacy system');
        });

        it('accepts a fully populated input with date coercion', () => {
            const r = RequestExceptionSchema.parse({
                controlId: 'c1',
                justification: 'j',
                compensatingControlId: 'c2',
                riskAcceptedByUserId: 'u1',
                expiresAt: '2026-01-01T00:00:00.000Z',
            });
            expect(r.expiresAt).toBeInstanceOf(Date);
        });

        it('accepts null compensatingControlId', () => {
            expect(
                RequestExceptionSchema.safeParse({
                    controlId: 'c1',
                    justification: 'j',
                    compensatingControlId: null,
                    riskAcceptedByUserId: 'u1',
                }).success,
            ).toBe(true);
        });

        it('rejects an empty controlId', () => {
            expect(
                RequestExceptionSchema.safeParse({
                    controlId: '',
                    justification: 'j',
                    riskAcceptedByUserId: 'u1',
                }).success,
            ).toBe(false);
        });

        it('rejects an empty justification', () => {
            expect(
                RequestExceptionSchema.safeParse({
                    controlId: 'c1',
                    justification: '',
                    riskAcceptedByUserId: 'u1',
                }).success,
            ).toBe(false);
        });

        it('rejects a justification over 8000 chars', () => {
            expect(
                RequestExceptionSchema.safeParse({
                    controlId: 'c1',
                    justification: 'a'.repeat(8001),
                    riskAcceptedByUserId: 'u1',
                }).success,
            ).toBe(false);
        });

        it('rejects an empty riskAcceptedByUserId', () => {
            expect(
                RequestExceptionSchema.safeParse({
                    controlId: 'c1',
                    justification: 'j',
                    riskAcceptedByUserId: '',
                }).success,
            ).toBe(false);
        });

        it('rejects compensatingControlId equal to controlId (superRefine)', () => {
            expect(
                RequestExceptionSchema.safeParse({
                    controlId: 'c1',
                    justification: 'j',
                    compensatingControlId: 'c1',
                    riskAcceptedByUserId: 'u1',
                }).success,
            ).toBe(false);
        });

        it('accepts compensatingControlId differing from controlId', () => {
            expect(
                RequestExceptionSchema.safeParse({
                    controlId: 'c1',
                    justification: 'j',
                    compensatingControlId: 'c2',
                    riskAcceptedByUserId: 'u1',
                }).success,
            ).toBe(true);
        });

        it('rejects a non-ISO expiresAt', () => {
            expect(
                RequestExceptionSchema.safeParse({
                    controlId: 'c1',
                    justification: 'j',
                    riskAcceptedByUserId: 'u1',
                    expiresAt: 'nope',
                }).success,
            ).toBe(false);
        });
    });

    describe('ApproveExceptionSchema', () => {
        it('accepts a valid input and coerces expiresAt', () => {
            const r = ApproveExceptionSchema.parse({
                expiresAt: '2026-01-01T00:00:00.000Z',
                note: 'approved',
            });
            expect(r.expiresAt).toBeInstanceOf(Date);
        });

        it('accepts a Date expiresAt with no note', () => {
            expect(ApproveExceptionSchema.safeParse({ expiresAt: new Date() }).success).toBe(true);
        });

        it('accepts null note', () => {
            expect(
                ApproveExceptionSchema.safeParse({ expiresAt: new Date(), note: null }).success,
            ).toBe(true);
        });

        it('rejects a missing expiresAt', () => {
            expect(ApproveExceptionSchema.safeParse({ note: 'x' }).success).toBe(false);
        });

        it('rejects a non-ISO expiresAt', () => {
            expect(ApproveExceptionSchema.safeParse({ expiresAt: 'nope' }).success).toBe(false);
        });

        it('rejects a note over 8000 chars', () => {
            expect(
                ApproveExceptionSchema.safeParse({
                    expiresAt: new Date(),
                    note: 'a'.repeat(8001),
                }).success,
            ).toBe(false);
        });
    });

    describe('RejectExceptionSchema', () => {
        it('accepts a valid reason and trims it', () => {
            const r = RejectExceptionSchema.parse({ reason: '  not justified  ' });
            expect(r.reason).toBe('not justified');
        });

        it('rejects an empty reason', () => {
            expect(RejectExceptionSchema.safeParse({ reason: '' }).success).toBe(false);
        });

        it('rejects a reason over 8000 chars', () => {
            expect(
                RejectExceptionSchema.safeParse({ reason: 'a'.repeat(8001) }).success,
            ).toBe(false);
        });

        it('rejects a missing reason', () => {
            expect(RejectExceptionSchema.safeParse({}).success).toBe(false);
        });
    });

    describe('RenewExceptionSchema', () => {
        it('accepts an empty object (all optional)', () => {
            expect(RenewExceptionSchema.safeParse({}).success).toBe(true);
        });

        it('accepts a fully populated input', () => {
            const r = RenewExceptionSchema.parse({
                justification: 'still needed',
                compensatingControlId: 'c2',
                riskAcceptedByUserId: 'u1',
                expiresAt: '2026-01-01T00:00:00.000Z',
            });
            expect(r.expiresAt).toBeInstanceOf(Date);
        });

        it('accepts null justification and null compensatingControlId', () => {
            expect(
                RenewExceptionSchema.safeParse({
                    justification: null,
                    compensatingControlId: null,
                }).success,
            ).toBe(true);
        });

        it('rejects an empty compensatingControlId', () => {
            expect(
                RenewExceptionSchema.safeParse({ compensatingControlId: '' }).success,
            ).toBe(false);
        });

        it('rejects an empty riskAcceptedByUserId', () => {
            expect(
                RenewExceptionSchema.safeParse({ riskAcceptedByUserId: '' }).success,
            ).toBe(false);
        });

        it('rejects a justification over 8000 chars', () => {
            expect(
                RenewExceptionSchema.safeParse({ justification: 'a'.repeat(8001) }).success,
            ).toBe(false);
        });

        it('rejects a non-ISO expiresAt', () => {
            expect(RenewExceptionSchema.safeParse({ expiresAt: 'nope' }).success).toBe(false);
        });
    });
});
