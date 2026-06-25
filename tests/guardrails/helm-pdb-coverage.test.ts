/**
 * Structural ratchet — the Helm chart ships a PodDisruptionBudget for
 * both the app and the worker Deployment, and production enables them.
 *
 * Without a PDB, a single voluntary disruption (node drain on a k8s
 * upgrade, cluster-autoscaler scale-in, kube-system node compaction)
 * can evict every pod at once — a hard outage the HPA can't catch (it
 * reacts to load, not to disruption velocity). This guard fails CI if
 * the PDB template is removed, stops gating on its enable flags, switches
 * to the scale-down-unsafe `minAvailable`, prod stops enabling it, or
 * prod's HPA floor drops below 2 (which would make a maxUnavailable: 1
 * PDB block every drain).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const CHART = path.resolve(__dirname, '../../infra/helm/inflect');
const PDB_TPL = path.join(CHART, 'templates/pdb.yaml');
const VALUES_PROD = path.join(CHART, 'values-production.yaml');

describe('Helm PodDisruptionBudget coverage', () => {
    it('templates/pdb.yaml exists', () => {
        expect(fs.existsSync(PDB_TPL)).toBe(true);
    });

    const tpl = fs.existsSync(PDB_TPL) ? fs.readFileSync(PDB_TPL, 'utf-8') : '';

    it('emits two PodDisruptionBudgets gated by pdb.app.enabled / pdb.worker.enabled', () => {
        const pdbCount = (tpl.match(/kind:\s*PodDisruptionBudget/g) ?? []).length;
        expect(pdbCount).toBe(2);
        expect(tpl).toMatch(/if\s+\.Values\.pdb\.app\.enabled/);
        expect(tpl).toMatch(/if\s+\.Values\.pdb\.worker\.enabled/);
        // policy/v1 (stable since k8s 1.21; chart floor is >= 1.28).
        expect(tpl).toMatch(/apiVersion:\s*policy\/v1/);
    });

    it('uses maxUnavailable (scale-down safe), never minAvailable', () => {
        expect(tpl).toMatch(/maxUnavailable:/);
        expect(tpl).not.toMatch(/minAvailable:/);
    });

    it('values-production.yaml enables both PDBs', () => {
        const prod = yaml.load(fs.readFileSync(VALUES_PROD, 'utf-8')) as {
            pdb?: { app?: { enabled?: boolean }; worker?: { enabled?: boolean } };
        };
        expect(prod.pdb?.app?.enabled).toBe(true);
        expect(prod.pdb?.worker?.enabled).toBe(true);
    });

    it('production HPA minReplicas >= 2 (else a maxUnavailable:1 PDB blocks every drain)', () => {
        const prod = yaml.load(fs.readFileSync(VALUES_PROD, 'utf-8')) as {
            autoscaling?: { minReplicas?: number };
        };
        expect(prod.autoscaling?.minReplicas ?? 0).toBeGreaterThanOrEqual(2);
    });
});

/**
 * The chart is actually RENDERED in CI (helm lint + helm template), not
 * just text-scanned — so a templating error surfaces on a chart PR
 * rather than at `helm install`. This locks that gate + the env-specific
 * PDB-render contract (prod 2, staging 0).
 */
describe('Helm chart is helm-rendered in CI', () => {
    const WF = path.resolve(__dirname, '../../.github/workflows/helm-validate.yml');
    it('helm-validate workflow exists', () => {
        expect(fs.existsSync(WF)).toBe(true);
    });
    const wf = fs.existsSync(WF) ? fs.readFileSync(WF, 'utf-8') : '';
    it('runs helm lint AND helm template (real render, not just text scan)', () => {
        expect(wf).toMatch(/helm lint/);
        expect(wf).toMatch(/helm template/);
    });
    it('asserts the env-specific PDB render contract (prod 2, staging 0)', () => {
        expect(wf).toMatch(/values-production\.yaml/);
        expect(wf).toMatch(/values-staging\.yaml/);
        expect(wf).toMatch(/PodDisruptionBudget/);
    });
});
