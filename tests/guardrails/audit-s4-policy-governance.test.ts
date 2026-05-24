/**
 * Audit Coherence S4 (2026-05-22) — structural ratchet locking the
 * two Policy Governance gap closures.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Audit S4 — Policy Governance & Versioning', () => {
    describe('policy attestation usecase', () => {
        const src = read('src/app-layer/usecases/policy-attestation.ts');

        it('exports attestPolicy / getPolicyAttestation / listPolicyAttestations', () => {
            expect(src).toMatch(/export async function attestPolicy/);
            expect(src).toMatch(/export async function getPolicyAttestation/);
            expect(src).toMatch(/export async function listPolicyAttestations/);
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

        it('listPolicyAttestations is admin-gated', () => {
            expect(src).toMatch(
                /export async function listPolicyAttestations[\s\S]{0,400}assertCanAdmin/,
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
        const src = read('prisma/schema/compliance.prisma');

        it('model exists with the (policyVersionId, userId) unique', () => {
            expect(src).toMatch(/model PolicyAcknowledgement/);
            expect(src).toMatch(/@@unique\(\[policyVersionId,\s*userId\]\)/);
        });
    });
});
