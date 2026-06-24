/**
 * Path operations for the auth boundary (consumed by every client).
 * Registered at import time on the shared registry.
 */
import { z } from '@/lib/openapi/zod';
import { registry } from '@/lib/openapi/registry';
import { AuthRegisterSchema } from '@/lib/schemas';
import {
    AuthChangePasswordRequestSchema,
    AuthForgotPasswordRequestSchema,
    AuthResetPasswordRequestSchema,
    AuthOkResponseSchema,
    AuthMeResponseSchema,
} from '@/lib/dto/api-extra.dto';
import { responses, jsonBody } from './_shared';

registry.registerPath({
    method: 'post',
    path: '/api/auth/register',
    summary: 'Self-service signup',
    tags: ['auth'],
    'x-auth': 'public',
    'x-rate-limit': 'API_MUTATION_LIMIT',
    request: { body: jsonBody(AuthRegisterSchema, 'Signup payload (gated by AUTH_TEST_MODE in non-prod). Password is HIBP-screened before persistence.') },
    responses: responses(
        { status: 200, schema: AuthOkResponseSchema, description: 'Account created; email verification initiated server-side.' },
        ['400', '409', '429'],
    ),
});

registry.registerPath({
    method: 'post',
    path: '/api/auth/change-password',
    summary: 'Change password (authenticated)',
    tags: ['auth'],
    'x-auth': 'session',
    'x-rate-limit': 'API_MUTATION_LIMIT',
    request: { body: jsonBody(AuthChangePasswordRequestSchema, 'Current + new password. New password is HIBP-screened and must differ from current.') },
    responses: responses(
        { status: 200, schema: AuthOkResponseSchema, description: 'Password changed; all sessions revoked. reauthRequired=true.' },
        ['400', '401', '429'],
    ),
});

registry.registerPath({
    method: 'post',
    path: '/api/auth/forgot-password',
    summary: 'Request a password-reset link',
    tags: ['auth'],
    'x-auth': 'public',
    'x-rate-limit': 'EMAIL_DISPATCH_LIMIT',
    request: { body: jsonBody(AuthForgotPasswordRequestSchema, 'The email to send a reset link to. Enumeration-safe.') },
    responses: responses(
        { status: 200, schema: AuthOkResponseSchema, description: 'Always {ok:true} — never reveals whether the email is registered.' },
        ['400', '429'],
    ),
});

registry.registerPath({
    method: 'post',
    path: '/api/auth/reset-password',
    summary: 'Consume a reset token',
    tags: ['auth'],
    'x-auth': 'public',
    'x-rate-limit': 'LOGIN_LIMIT',
    request: { body: jsonBody(AuthResetPasswordRequestSchema, 'Single-use token + new password (HIBP-screened).') },
    responses: responses(
        { status: 200, schema: AuthOkResponseSchema, description: 'Password reset; all sessions revoked.' },
        ['400', '429'],
    ),
});

registry.registerPath({
    method: 'get',
    path: '/api/auth/me',
    summary: 'Current principal + primary tenant',
    tags: ['auth'],
    'x-auth': 'session',
    request: { query: z.object({}) },
    responses: responses(
        { status: 200, schema: AuthMeResponseSchema, description: 'The authenticated user and their primary tenant membership.' },
        ['401'],
    ),
});
