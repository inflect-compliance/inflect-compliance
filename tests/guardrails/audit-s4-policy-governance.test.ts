/**
 * Audit Coherence S4 (2026-05-22) — structural ratchet locking the
 * two Policy Governance gap closures.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readPrismaSchema } from '../helpers/prisma-schema';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Audit S4 — Policy Governance & Versioning', () => {
    describe('policy attestation usecase', () => {
        const src = read('src/app-layer/usecases/policy-attestation.ts');

        it('exports attestPolicy / getPolicyAttestation / getPolicyAcknowledgementRoster', () => {
            expect(src).toMatch(/export async function attestPolicy/);
            expect(src).toMatch(/export async function getPolicyAttestation/);
            // The former standalone listPolicyAttestations is subsumed by the
            // roster's `attestations` log (the reachable auditor who-attested view).
            expect(src).toMatch(/export async function getPolicyAcknowledgementRoster/);
        });

        it('attestPolicy gates on the PUBLISHED status', () => {
            // Attesting a DRAFT / ARCHIVED policy doesn't satisfy ISO
            // §7.3 — only PUBLISHED is meaningful.
            expect(src).toMatch(/policy\.status\s*!==\s*['"]PUBLISHED['"]/);
        });

        it('attestPolicy is idempotent via the (policyVersionId, userId) unique', () => {
            expect(src).toMatch(/policyVersionId_userId/);
            expect(src).toMatch(/created:\s*false/);
        });

        it('attestPolicy emits POLICY_ATTESTED audit row with category: access', () => {
            expect(src).toMatch(/['"]POLICY_ATTESTED['"]/);
            expect(src).toMatch(/category:\s*['"]access['"]/);
        });

        it('getPolicyAcknowledgementRoster (auditor who-attested view) is admin-gated', () => {
            expect(src).toMatch(
                /export async function getPolicyAcknowledgementRoster[\s\S]{0,400}assertCanAdmin/,
            );
        });
    });

    describe('publishPolicy approval gate', () => {
        const src = read('src/app-layer/usecases/policy.ts');

        it('publishPolicy accepts an optional `bypassApprovalReason`', () => {
            expect(src).toMatch(/bypassApprovalReason\?:\s*string/);
            expect(src).toMatch(/PublishPolicyOptions/);
        });

        it('refuses non-APPROVED publish without bypass reason', () => {
            // The gate compares status to APPROVED and the bypass to
            // empty string; both false → throw.
            expect(src).toMatch(/policy\.status\s*===\s*['"]APPROVED['"]/);
            expect(src).toMatch(/bypassReason\.length\s*===\s*0/);
            expect(src).toMatch(/cannot publish without going through APPROVED/);
        });

        it('trims the bypass reason (whitespace-only is invalid)', () => {
            expect(src).toMatch(/bypassApprovalReason\?\.trim\(\)/);
        });

        it('emits POLICY_PUBLISH_BYPASS audit row before POLICY_PUBLISHED when bypassing', () => {
            expect(src).toMatch(/['"]POLICY_PUBLISH_BYPASS['"]/);
            // The bypass row carries the reason in detailsJson.after.
            expect(src).toMatch(/bypassReason[\s\S]{0,80}versionId/);
        });
    });

    describe('PolicyAcknowledgement schema (load-bearing for attestation)', () => {
        const src = readPrismaSchema();

        it('model exists with the (policyVersionId, userId) unique', () => {
            expect(src).toMatch(/model PolicyAcknowledgement/);
            expect(src).toMatch(/@@unique\(\[policyVersionId,\s*userId\]\)/);
        });
    });
});
