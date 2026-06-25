/**
 * DR snapshot-copy coverage ratchet.
 *
 * Cross-region RDS snapshot copy is the minimum-viable DR posture
 * (RPO 24h / RTO 4h — docs/disaster-recovery.md). This guard fails CI
 * if the wiring is deleted or the copies become theatre (no restore
 * test): a snapshot copied to a second region but never restored is not
 * a verified backup.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

const DB_MAIN = 'infra/terraform/modules/database/main.tf';
const RESTORE_YML = '.github/workflows/restore-test.yml';
const RESTORE_SH = 'infra/scripts/restore-test.sh';
const DR_DOC = 'docs/disaster-recovery.md';

describe('DR snapshot-copy coverage', () => {
  describe('terraform — database module DR wiring', () => {
    const main = read(DB_MAIN);

    it('references var.dr_region', () => {
      expect(main).toMatch(/var\.dr_region/);
    });

    it('gates DR resources on dr_region (count, not unconditional)', () => {
      // local.dr_enabled = var.dr_region != "" ? 1 : 0
      expect(main).toMatch(/dr_enabled\s*=\s*var\.dr_region\s*!=\s*""\s*\?\s*1\s*:\s*0/);
    });

    it('creates the cross-region copy Lambda, count-gated', () => {
      expect(main).toMatch(/resource\s+"aws_lambda_function"\s+"dr_snapshot_copy"/);
      // the copy lambda block must carry a count tied to dr_enabled
      const block = main.slice(main.indexOf('"aws_lambda_function" "dr_snapshot_copy"'));
      expect(block.slice(0, 400)).toMatch(/count\s*=\s*local\.dr_enabled/);
    });

    it('creates an EventBridge rule on automated-snapshot creation + a retention Lambda', () => {
      expect(main).toMatch(/resource\s+"aws_cloudwatch_event_rule"\s+"rds_snapshot_completed"/);
      expect(main).toMatch(/Automated snapshot created/);
      expect(main).toMatch(/resource\s+"aws_lambda_function"\s+"dr_snapshot_retention"/);
    });

    it('declares the aws.dr provider alias', () => {
      expect(main).toMatch(/configuration_aliases\s*=\s*\[aws\.dr\]/);
    });
  });

  describe('docs/disaster-recovery.md', () => {
    const doc = (() => (exists(DR_DOC) ? read(DR_DOC) : ''))();

    it('exists', () => {
      expect(exists(DR_DOC)).toBe(true);
    });

    it('has the RPO/RTO tier table', () => {
      expect(doc).toMatch(/RPO/);
      expect(doc).toMatch(/RTO/);
      expect(doc).toMatch(/24h/);
    });

    it('has the runbook section', () => {
      expect(doc).toMatch(/##\s*Runbook/i);
      expect(doc).toMatch(/restore-db-instance-from-db-snapshot/);
    });
  });

  describe('restore test supports cross-region', () => {
    it('workflow references a region flag / DR region', () => {
      const yml = read(RESTORE_YML);
      expect(yml).toMatch(/--region/);
      expect(yml).toMatch(/--snapshot-type\s+manual/);
    });

    it('restore-test.sh accepts --region', () => {
      const sh = read(RESTORE_SH);
      expect(sh).toMatch(/--region\)/);
      expect(sh).toMatch(/--snapshot-type/);
    });
  });
});
