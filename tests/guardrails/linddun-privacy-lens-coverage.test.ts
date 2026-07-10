/**
 * LINDDUN privacy-threat lens coverage ratchet (P2).
 *
 * LINDDUN (© DistriNet, KU Leuven) is encoded NATIVELY as a privacy LENS over
 * IC's existing risk machinery — a privacy-threat classification + advisory PET
 * treatment hints, NOT a parallel threat-modeling engine. This guard locks:
 *   - the 7 LINDDUN categories exist as reference data, attributed to KU Leuven;
 *   - PET treatment hints are ADVISORY (a pure helper; never auto-applied);
 *   - a Risk / RiskTemplate can carry a LINDDUN classification (schema field +
 *     createRiskFromTemplate copies it);
 *   - the privacy risk templates seed;
 *   - the lens REUSES the existing risk machinery — no new threat-modeling
 *     engine / model (a guard against scope creep into a parallel engine).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    LINDDUN_CATEGORIES,
    LINDDUN_ATTRIBUTION,
    LINDDUN_CODES,
    petHintsForCodes,
    normalizeLinddunCodes,
} from '@/lib/privacy/linddun';
import { readPrismaSchema } from '../helpers/prisma-schema';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('LINDDUN taxonomy — reference data', () => {
    it('defines exactly the 7 LINDDUN categories', () => {
        expect(LINDDUN_CATEGORIES.length).toBe(7);
        expect([...LINDDUN_CODES].sort()).toEqual(['D', 'DD', 'I', 'L', 'N', 'NC', 'U']);
        for (const c of LINDDUN_CATEGORIES) {
            expect(c.name).toBeTruthy();
            expect(c.definition.length).toBeGreaterThan(20);
            expect(c.petHints.length).toBeGreaterThan(0);
        }
    });

    it('attributes LINDDUN to KU Leuven (freely usable with attribution)', () => {
        expect(LINDDUN_ATTRIBUTION).toMatch(/KU Leuven/i);
        expect(LINDDUN_ATTRIBUTION).toMatch(/LINDDUN/);
        // The source module carries the attribution + a paraphrase note.
        const src = read('src/lib/privacy/linddun.ts');
        expect(src).toMatch(/KU Leuven/i);
        expect(src).toMatch(/paraphrased/i);
    });
});

describe('PET treatment hints — advisory, not auto-applied', () => {
    it('returns canonical PET hints for a set of categories (union, de-duped)', () => {
        const hints = petHintsForCodes(['DD', 'I']);
        expect(hints).toContain('Data minimization');
        expect(hints).toContain('Anonymization');
        // De-duplicated.
        expect(new Set(hints).size).toBe(hints.length);
    });

    it('the PET hints are NEVER auto-applied as treatments (advisory only)', () => {
        // The lens surfaces hints read-only via getRiskPrivacyLens; no write
        // path may turn a PET hint into a created treatment/plan automatically.
        const uc = read('src/app-layer/usecases/risk.ts');
        // getRiskPrivacyLens returns them under an explicitly-advisory key.
        expect(uc).toMatch(/petTreatmentHints/);
        // The PET helper must not feed a treatment-creation call.
        expect(uc).not.toMatch(/createTreatment[\s\S]{0,80}petHints/i);
        expect(uc).not.toMatch(/petHints[\s\S]{0,80}create(Treatment|Plan)/i);
    });
});

describe('risks carry a LINDDUN classification (lens over existing machinery)', () => {
    const schema = readPrismaSchema();

    it('Risk + RiskTemplate have a linddunCategories field (not a new model)', () => {
        const modelBlock = (name: string): string => {
            const start = schema.indexOf(`model ${name} {`);
            const end = schema.indexOf('\n}', start);
            return schema.slice(start, end);
        };
        expect(modelBlock('Risk')).toMatch(/linddunCategories\s+Json\?/);
        expect(modelBlock('RiskTemplate')).toMatch(/linddunCategories\s+Json\?/);
    });

    it('createRiskFromTemplate copies the LINDDUN classification onto the risk', () => {
        const uc = read('src/app-layer/usecases/risk.ts');
        expect(uc).toMatch(/linddunCategories:/);
        expect(uc).toMatch(/normalizeLinddunCodes\(/);
    });

    it('does NOT introduce a parallel threat-modeling engine / model', () => {
        // No new LINDDUN/threat-modeling Prisma model — it is a tag on Risk.
        expect(schema).not.toMatch(/model\s+Linddun\w*/i);
        expect(schema).not.toMatch(/model\s+\w*ThreatModel\w*/i);
        // No bespoke engine usecase file.
        for (const f of ['linddun-engine.ts', 'privacy-threat-engine.ts', 'linddun.ts']) {
            expect(fs.existsSync(path.join(ROOT, 'src/app-layer/usecases', f))).toBe(false);
        }
    });

    it('normalizeLinddunCodes is tolerant (drops unknown codes, keeps order)', () => {
        expect(normalizeLinddunCodes(['DD', 'bogus', 'L', 'L'])).toEqual(['L', 'DD']);
        expect(normalizeLinddunCodes(null)).toEqual([]);
        expect(normalizeLinddunCodes('DD')).toEqual([]);
    });
});

describe('LINDDUN-categorized privacy risk templates seed', () => {
    const seed = read('prisma/seed.ts');

    it('seeds a privacy risk-template set (more than the lone GDPR template)', () => {
        expect(seed).toContain('privacyRiskTemplates');
        expect(seed).toMatch(/linddunCategories:\s*\[/);
        // Anchor a few LINDDUN privacy risks.
        expect(seed).toMatch(/Re-identification of De-identified Data/);
        expect(seed).toMatch(/Excessive Data Linking/);
        expect(seed).toMatch(/Unlawful or Non-compliant Processing/);
    });

    it('rides the existing RiskTemplate upsert path (no new machinery)', () => {
        expect(seed).toMatch(/privacyRiskTemplates[\s\S]{0,2400}prisma\.riskTemplate\.upsert/);
    });
});
