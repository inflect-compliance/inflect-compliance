/**
 * PR-10 — conversational assistant: structural ratchet.
 *
 * The load-bearing safety property is propose-not-commit: the assistant answers
 * read questions from live data, but an ACTION request is routed to the EXISTING
 * agent-proposal queue (a human approves before anything is created) — the
 * assistant NEVER imports or calls a create-usecase directly.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('assistant AI — governance + propose-not-commit', () => {
    const usecase = read('src/app-layer/usecases/assistant.ts');

    it('follows the governed-AI ordering (gate → rate-limit → record)', () => {
        expect(usecase).toMatch(/enforceFeatureGate\(ctx\)/);
        expect(usecase).toMatch(/checkRateLimit\(ctx\.tenantId, ctx\.userId\)/);
        expect(usecase).toMatch(/recordGeneration\(ctx\.tenantId, ctx\.userId\)/);
        expect(usecase.indexOf('enforceFeatureGate')).toBeLessThan(usecase.indexOf('checkRateLimit'));
        expect(usecase.indexOf('checkRateLimit')).toBeLessThan(usecase.indexOf('recordGeneration'));
    });

    it('guards untrusted input AND egress', () => {
        expect(usecase).toMatch(/guardUntrustedInput\(ctx, question/);
        expect(usecase).toMatch(/guardEgress\(ctx, \{ message/);
        expect(usecase).toMatch(/assertGuardAllowed/);
    });

    it('actions are PROPOSED via the existing agent-proposal queue, never executed directly', () => {
        expect(usecase).toMatch(/createAgentProposal\(ctx, \{/);
        expect(usecase).toMatch(/kind: 'FINDING'/);
        expect(usecase).toMatch(/kind: 'RISK'/);
        // Propose-not-commit: the assistant must NOT import a create-usecase.
        expect(usecase).not.toMatch(/import\s+\{[^}]*\bcreateTask\b/);
        expect(usecase).not.toMatch(/import\s+\{[^}]*\bcreateFinding\b/);
        expect(usecase).not.toMatch(/import\s+\{[^}]*\bcreateRisk\b/);
    });

    it('read answers come from live tenant posture data', () => {
        expect(usecase).toMatch(/getDashboardData\(ctx\)/);
    });

    it('the ask route is permission-gated and validates input', () => {
        const route = read('src/app/api/t/[tenantSlug]/assistant/ask/route.ts');
        expect(route).toMatch(/requirePermission<\{ tenantSlug: string \}>\('controls\.view'/);
        expect(route).toMatch(/AskAssistantSchema/);
        expect(route).toMatch(/askAssistant\(ctx, body\)/);
    });
});
