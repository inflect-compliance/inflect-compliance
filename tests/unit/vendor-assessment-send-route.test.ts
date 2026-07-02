/**
 * Epic G-3 — POST /api/t/[tenantSlug]/vendors/[vendorId]/assessments/send.
 *
 * Mocks `getTenantCtx` + the `sendAssessment` usecase and drives the
 * exported route handler with a real NextRequest. Asserts:
 *   - 201 + the SendAssessmentResult payload on the happy path, with
 *     the validated body forwarded to the usecase;
 *   - 400 when the respondent email is missing/invalid (Zod rejects
 *     before the usecase is called);
 *   - the usecase's badRequest (unpublished/unknown template) maps to
 *     400 via withApiErrorHandling.
 *
 * Mirrors the route-test pattern at `tests/unit/framework-tree-route.test.ts`.
 */
import { NextRequest } from 'next/server';

const getTenantCtxMock = jest.fn();
const sendAssessmentMock = jest.fn();

jest.mock('@/app-layer/context', () => ({
    __esModule: true,
    getTenantCtx: (...a: unknown[]) => getTenantCtxMock(...a),
}));

jest.mock('@/app-layer/usecases/vendor-assessment-send', () => ({
    __esModule: true,
    sendAssessment: (...a: unknown[]) => sendAssessmentMock(...a),
}));

import { POST } from '@/app/api/t/[tenantSlug]/vendors/[vendorId]/assessments/send/route';
import { getPermissionsForRole } from '@/lib/permissions';
import { badRequest } from '@/lib/errors/types';
import type { Role } from '@prisma/client';

function ctxFor(role: Role) {
    return {
        tenantId: 'tenant-1',
        userId: 'user-1',
        requestId: 'req-test',
        tenantSlug: 'acme',
        role,
        permissions: {
            canRead: true,
            canWrite: true,
            canAdmin: false,
            canAudit: false,
            canExport: false,
        },
        appPermissions: getPermissionsForRole(role),
    };
}

function makeRequest(body: unknown): NextRequest {
    return new NextRequest(
        'http://localhost/api/t/acme/vendors/vendor-1/assessments/send',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        },
    );
}

const routeParams = () =>
    ({ params: Promise.resolve({ tenantSlug: 'acme', vendorId: 'vendor-1' }) });

beforeEach(() => {
    getTenantCtxMock.mockReset();
    sendAssessmentMock.mockReset();
});

describe('POST /api/t/[tenantSlug]/vendors/[vendorId]/assessments/send', () => {
    it('returns 201 + the send result and forwards the body to the usecase', async () => {
        getTenantCtxMock.mockResolvedValue(ctxFor('EDITOR'));
        const result = {
            assessmentId: 'asmt-1',
            externalAccessToken: 'raw-token',
            expiresAt: new Date('2026-08-01T00:00:00.000Z'),
            notificationQueued: true,
        };
        sendAssessmentMock.mockResolvedValue(result);

        const res = await POST(
            makeRequest({
                templateVersionId: 'tmpl-1',
                respondentEmail: 'vendor@example.com',
                respondentName: 'Vendor Team',
                expiresInDays: 30,
            }),
            routeParams(),
        );

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.assessmentId).toBe('asmt-1');
        expect(body.externalAccessToken).toBe('raw-token');

        expect(sendAssessmentMock).toHaveBeenCalledTimes(1);
        const [, vendorId, templateVersionId, input] = sendAssessmentMock.mock.calls[0];
        expect(vendorId).toBe('vendor-1');
        expect(templateVersionId).toBe('tmpl-1');
        expect(input).toEqual({
            respondentEmail: 'vendor@example.com',
            respondentName: 'Vendor Team',
            expiresInDays: 30,
            force: undefined,
        });
    });

    it('returns 400 when the respondent email is invalid (Zod rejects)', async () => {
        getTenantCtxMock.mockResolvedValue(ctxFor('EDITOR'));

        const res = await POST(
            makeRequest({ templateVersionId: 'tmpl-1', respondentEmail: 'not-an-email' }),
            routeParams(),
        );

        expect(res.status).toBe(400);
        expect(sendAssessmentMock).not.toHaveBeenCalled();
    });

    it('returns 400 when templateVersionId is missing (Zod rejects)', async () => {
        getTenantCtxMock.mockResolvedValue(ctxFor('EDITOR'));

        const res = await POST(
            makeRequest({ respondentEmail: 'vendor@example.com' }),
            routeParams(),
        );

        expect(res.status).toBe(400);
        expect(sendAssessmentMock).not.toHaveBeenCalled();
    });

    it("maps the usecase's unpublished-template badRequest to 400", async () => {
        getTenantCtxMock.mockResolvedValue(ctxFor('EDITOR'));
        sendAssessmentMock.mockRejectedValue(
            badRequest('Template "X" is in draft. Publish it before sending.'),
        );

        const res = await POST(
            makeRequest({
                templateVersionId: 'tmpl-draft',
                respondentEmail: 'vendor@example.com',
            }),
            routeParams(),
        );

        expect(res.status).toBe(400);
    });
});
