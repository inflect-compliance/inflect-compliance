/**
 * Aggregator for route-level path-operation registration.
 *
 * Importing this module triggers every domain module's top-level
 * `registry.registerPath(...)` calls in a FIXED order (the import
 * order below) — determinism matters because the OpenAPI generator
 * emits `paths` in registration order. `serializeDoc` additionally
 * sorts `paths` so the committed `public/openapi.json` is byte-stable
 * across the Jest (CJS) and tsx (ESM) runtimes.
 *
 * The builder imports this single module; add a new domain module's
 * import here when extending the critical set.
 */
import './tenant-entities';
import './auth';
import './admin';
import './audit';
