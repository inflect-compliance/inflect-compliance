/**
 * Framework usecase barrel export.
 *
 * All public functions are re-exported here so existing imports
 * from '@/app-layer/usecases/framework' resolve to this index.
 */

// Catalog (read-only framework queries)
export {
    listFrameworks,
    listInstallableFrameworks,
    getFramework,
    getFrameworkRequirements,
    listFrameworkPacks,
} from './catalog';

// Hierarchical tree view (Epic 46)
export { getFrameworkTree, reorderFrameworkRequirements } from './tree';

// Install operations (pack, template, bulk)
export {
    previewPackInstall,
    installPack,
    installSingleTemplate,
    bulkInstallTemplates,
    bulkMapControls,
} from './install';

// Coverage, templates, & readiness
export {
    computeCoverage,
    listTemplates,
    exportCoverageData,
    generateReadinessReport,
    exportReadinessReport,
} from './coverage';

// Fixture upsert & diff
export {
    upsertRequirements,
    computeRequirementsDiff,
} from './fixtures';

export type { RequirementFixture } from './fixtures';
