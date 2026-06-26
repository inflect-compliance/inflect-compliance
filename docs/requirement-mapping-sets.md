# Requirement Mapping Sets

> Cross-framework traceability architecture for mapping requirements across compliance frameworks.

## Overview

The Requirement Mapping Set system provides data-driven cross-framework traceability.
It enables questions like:

- "If I'm compliant with ISO 27001 A.5.1, what does that imply for NIST CSF 2.0?"
- "Which SOC 2 requirements still need attention given my ISO 27001 posture?"

Mappings are **structural guidance**, not guarantees of compliance.

### Architecture

```
YAML Mapping Files (src/data/libraries/mappings/)
    │
    ▼
┌── Mapping Set Importer ───────────────────────┐
│ Parse → Validate (Zod) → Resolve refs → Upsert│
│ Output: RequirementMappingSet + RequirementMapping rows│
└────────────────────┬───────────────────────────┘
                     │
        ┌────────────┼───────────────────────┐
        ▼            ▼                       ▼
  Mapping        Resolution Engine   Traceability/Gap Analysis
  Repository     (BFS traversal)     (Business semantics)
  ┌──────────┐   ┌──────────────┐   ┌──────────────────────┐
  │ upsert   │   │ direct       │   │ Coverage confidence  │
  │ query    │   │ transitive   │   │ Gap status           │
  │ resolve  │   │ depth-limit  │   │ Explanations         │
  │ bulk ops │   │ cycle detect │   │ Conservative claims  │
  └──────────┘   └──────────────┘   └──────────────────────┘
```

## Domain Model

### Prisma Schema

```prisma
model RequirementMappingSet {
  id                String              @id @default(cuid())
  sourceFrameworkId String
  targetFrameworkId String
  name              String
  description       String?
  version           Int                 @default(1)
  sourceUrn         String?
  contentHash       String?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  sourceFramework   Framework           @relation("MappingSetSource")
  targetFramework   Framework           @relation("MappingSetTarget")
  mappings          RequirementMapping[]

  @@unique([sourceFrameworkId, targetFrameworkId])
}

model RequirementMapping {
  id                    String              @id @default(cuid())
  mappingSetId          String
  sourceRequirementId   String
  targetRequirementId   String
  strength              MappingStrength     @default(RELATED)
  rationale             String?
  metadataJson          String?
  createdAt             DateTime            @default(now())

  mappingSet            RequirementMappingSet
  sourceRequirement     FrameworkRequirement @relation("MappingSource")
  targetRequirement     FrameworkRequirement @relation("MappingTarget")

  @@unique([mappingSetId, sourceRequirementId, targetRequirementId])
}
```

### Mapping Strength Semantics

| Strength | Rank | Meaning |
|----------|------|---------|
| `EQUAL` | 5 | Semantically equivalent. Implementing source fully satisfies target and vice versa. |
| `SUPERSET` | 4 | Source fully covers target. Implementing source satisfies target, but target may not fully satisfy source. |
| `SUBSET` | 3 | Source partially covers target. Implementing source only partially satisfies target. |
| `INTERSECT` | 2 | Partial overlap. Shared ground but neither fully covers the other. |
| `RELATED` | 1 | Conceptually related. Useful for awareness, not for coverage claims. |

## YAML Mapping File Format

Mapping-set files live in `src/data/libraries/mappings/` and use a standalone schema
(separate from framework library files):

```yaml
urn: urn:inflect:mappingset:<source>-to-<target>
name: "Source → Target"
description: >
  Cross-framework traceability mapping description.
  Mappings are structural guidance — not guarantees of compliance.
version: 1
source_framework_ref: ISO27001-2022       # Must match Framework.key in DB
target_framework_ref: NIST-CSF-2.0        # Must match Framework.key in DB

mapping_entries:
  - source_ref: A.5.1                     # FrameworkRequirement.code
    target_ref: GV.OC-01                  # FrameworkRequirement.code
    strength: RELATED                      # EQUAL|SUPERSET|SUBSET|INTERSECT|RELATED
    rationale: Free-text explanation
```

### Validation Rules

| Condition | Behavior |
|-----------|----------|
| Invalid YAML syntax | `MappingSetParseError` (fast fail) |
| Schema violation (bad version, empty entries) | `MappingSetValidationError` (fast fail) |
| Invalid strength value | `MappingSetValidationError` (fast fail) |
| Source framework not in DB | `MappingSetReferenceError` (fast fail) |
| Target framework not in DB | `MappingSetReferenceError` (fast fail) |
| Source requirement code not found | Error recorded, entry skipped, import continues |
| Target requirement code not found | Error recorded, entry skipped, import continues |
| Content hash matches existing set | Import skipped (unless `force: true`) |

### Adding a New Mapping File

1. Create `src/data/libraries/mappings/<source>-to-<target>.yaml`
2. Follow the YAML schema above
3. Ensure both frameworks are already imported into the database
4. Use conservative strength values — avoid `EQUAL` unless semantically justified
5. Call `importAllMappingSets(db)` or import individually

## Ingestion Pipeline

```
YAML File → Zod Parse → SHA-256 Hash → Dedup Check
                                          │
                                   ┌──────┴──────┐
                                   │ Hash Match   │ Hash Changed
                                   │ → Skip       │ → Continue
                                   └──────────────┘
                                          │
                              Resolve Framework Keys
                                          │
                              Resolve Requirement Codes
                                          │
                              Upsert MappingSet
                                          │
                              Upsert Mappings (bulk)
                                          │
                              Report {created, updated, errors}
```

### Entrypoints

| Function | Module | Purpose |
|----------|--------|---------|
| `importMappingSet(db, stored, hash)` | `mapping-set-importer.ts` | Import one mapping set |
| `importAllMappingSets(db, dir?)` | `mapping-set-importer.ts` | Scan + import all mapping YAMLs |
| `parseMappingSetFile(path)` | `mapping-set-importer.ts` | Parse + validate from disk |
| `parseMappingSetString(yaml)` | `mapping-set-importer.ts` | Parse from string (testing) |
| `scanMappingSetDirectory(dir?)` | `mapping-set-importer.ts` | Find all mapping YAML files |

## Resolution Engine

### Traversal Strategy

**BFS (Breadth-First Search)** with:

- **Cycle detection**: Visited set prevents any requirement from being re-expanded
- **Depth limiting**: Configurable `maxDepth` (default 3, clamped to [1, 10])
- **Deterministic ordering**: Paths sorted by depth ↑, strength rank ↓, code alphabetically
- **Weakest-link strength**: Effective strength = min(all edges in path)

### Example

```
ISO A.5.1  ──EQUAL──▶  NIST GV.OC-01
                              │
                         ──SUBSET──▶  SOC2 CC1

A.5.1 → GV.OC-01:  depth=1, effectiveStrength=EQUAL
A.5.1 → CC1:       depth=2, effectiveStrength=SUBSET  (min(EQUAL, SUBSET))
```

### Entrypoints

| Function | Module | Purpose |
|----------|--------|---------|
| `resolveMapping(query, loadEdges)` | `mapping-resolution.ts` | BFS resolve all paths from a source requirement |
| `resolveMappingBatch(queries, loadEdges)` | `mapping-resolution.ts` | Resolve multiple sources in batch |
| `computeEffectiveStrength(edges)` | `mapping-resolution.ts` | Weakest-link strength for an edge chain |

## Traceability & Gap Analysis

### Coverage Confidence Model

Raw mapping strengths are interpreted through a conservative business lens:

| Mapping Strength | Confidence Level | Product Meaning | Gap Status |
|-----------------|-----------------|-----------------|------------|
| `EQUAL` | `FULL` | Requirement fully satisfied | `COVERED` |
| `SUPERSET` | `HIGH` | Likely satisfied — verify scope | `COVERED` |
| `SUBSET` | `PARTIAL` | Gap remains — source too narrow | `PARTIALLY_COVERED` |
| `INTERSECT` | `OVERLAP` | Shared ground — review needed | `PARTIALLY_COVERED` |
| `RELATED` | `INFORMATIONAL` | Awareness only — **no coverage claim** | `REVIEW_NEEDED` |
| (none) | `NONE` | No mapping exists | `NOT_COVERED` |

> **Conservative principle**: Only `EQUAL` and `SUPERSET` produce actionable coverage.
> `SUBSET`, `INTERSECT`, and `RELATED` **never** count as "covered" in gap analysis.
> This prevents overclaiming compliance.

### Entrypoints

| Function | Module | Purpose |
|----------|--------|---------|
| `resolveTraceability(sourceReqId, targetFw, loader)` | `cross-framework-traceability.ts` | Traceability report for one requirement |
| `analyzeGaps(sourceReqs, targetReqs, ...)` | `cross-framework-traceability.ts` | Full cross-framework gap analysis |
| `strengthToConfidence(strength)` | `cross-framework-traceability.ts` | Map strength to coverage confidence |
| `determineGapStatus(confidence)` | `cross-framework-traceability.ts` | Map confidence to gap status |
| `generateExplanation(path)` | `cross-framework-traceability.ts` | Human-readable explanation |

## Rollout Status

### Supported Mapping Sets

| Source Framework | Target Framework | File | Entries | Status |
|-----------------|-----------------|------|---------|--------|
| ISO 27001:2022 | NIST CSF 2.0 | `iso27001-to-nist-csf.yaml` | 14 | ✅ Shipped |
| ISO 27001:2022 | SOC 2 (2017) | `iso27001-to-soc2.yaml` | 26 | ✅ Shipped |
| NIST CSF 2.0 | SOC 2 (2017) | `nist-csf-to-soc2.yaml` | 16 | ✅ Shipped |
| NIS2 (2022) | ISO 27001:2022 | `nis2-to-iso27001.yaml` | 22 | ✅ Shipped |

**Total: 78 mapping entries across 4 framework pairs.**

### Transitive Traceability Chains

With all 4 mapping sets loaded, the resolution engine supports transitive paths:

```
NIS2 ──→ ISO 27001 ──→ NIST CSF ──→ SOC 2      (3-hop)
NIS2 ──→ ISO 27001 ──→ SOC 2                    (2-hop)
ISO 27001 ──→ NIST CSF ──→ SOC 2                (2-hop)
```

### Planned Mapping Sets

| Source Framework | Target Framework | Priority |
|-----------------|-----------------|----------|
| SOC 2 | ISO 27001:2022 | Low — reverse direction of primary mapping |
| NIST CSF 2.0 | ISO 27001:2022 | Low — reverse direction |

### Support Boundaries

- ✅ Domain model and repository (fully operational)
- ✅ YAML ingestion pipeline (fully operational)
- ✅ Resolution engine with BFS, cycles, depth limiting (fully operational)
- ✅ Traceability and gap analysis with conservative semantics (fully operational)
- ✅ Mapping data population (4 of 4 high-priority pairs shipped)
- ✅ Product-facing gap-analysis usecase layer (fully operational)
- ✅ Lifecycle wiring into library-sync (fully operational)

The three remaining surfaces (admin browsing UI, readiness-PDF
wiring, HTTP gap-analysis routes) are not built — see **Future
work** at the bottom of this document.

## Product-Facing Gap Analysis Usecase

The `gap-analysis.ts` usecase bridges persisted mappings to the resolution engine
and traceability business logic. It provides 4 consumer-facing entrypoints:

| Function | Module | Purpose |
|----------|--------|---------|
| `listAvailableMappingSets(db?)` | `gap-analysis.ts` | List all imported mapping sets with framework info and counts |
| `getRequirementTraceability(input, db?)` | `gap-analysis.ts` | "What does requirement X imply for framework B?" |
| `getFrameworkPairMappings(src, tgt, db?)` | `gap-analysis.ts` | List all mappings between two frameworks with semantic annotations |
| `performGapAnalysis(input, db?)` | `gap-analysis.ts` | Full cross-framework coverage analysis with per-requirement status |
| `createDbEdgeLoader(db)` | `gap-analysis.ts` | Factory: create a `MappingEdgeLoader` backed by persisted data |

### Output Structure

Gap analysis output is structured for direct UI/report consumption:
- **Sorted gaps-first**: `NOT_COVERED` entries appear at the top
- **Conservative semantics**: Only `EQUAL`/`SUPERSET` produce `COVERED` status
- **Explainable**: Every entry includes human-readable explanations
- **Auditable**: Traceability findings include full edge chains with rationale
- **Summarized**: Coverage percentages, strength distributions, actionable counts

## File Map

```
src/app-layer/domain/
└── requirement-mapping.types.ts         # DTOs, strength enum, query inputs

src/app-layer/repositories/
└── RequirementMappingRepository.ts      # Prisma CRUD (global, no tenant scope)

src/app-layer/services/
├── mapping-set-importer.ts              # YAML parse → ref resolution → upsert
├── mapping-resolution.ts               # BFS traversal engine
└── cross-framework-traceability.ts      # Business semantics layer

src/app-layer/usecases/
├── gap-analysis.ts                     # Product-facing gap analysis entrypoints
└── library-sync.ts                     # Lifecycle orchestration (fw + mappings)

src/data/libraries/mappings/
├── iso27001-to-nist-csf.yaml           # ISO 27001 → NIST CSF (14 entries)
├── iso27001-to-soc2.yaml               # ISO 27001 → SOC 2 (26 entries)
├── nist-csf-to-soc2.yaml               # NIST CSF → SOC 2 (16 entries)
└── nis2-to-iso27001.yaml               # NIS2 → ISO 27001 (22 entries)

tests/unit/
├── requirement-mapping-repository.test.ts   # 27 tests
├── mapping-set-importer.test.ts             # 24 tests
├── mapping-resolution.test.ts               # 34 tests
├── cross-framework-traceability.test.ts     # 47 tests
├── mapping-architecture-integration.test.ts # 52 tests
├── library-sync-lifecycle.test.ts           # 18 tests
└── gap-analysis-usecase.test.ts             # 32 tests
```

## Testing

### Unit Test Summary

| Suite | Tests | Coverage |
|-------|-------|----------|
| RequirementMappingRepository | 27 | CRUD, upsert, bulk, queries |
| Mapping Set Importer | 24 | YAML parsing, hash dedup, ref resolution |
| Mapping Resolution Engine | 34 | BFS, cycles, depth, strength propagation |
| Cross-Framework Traceability | 47 | Business semantics, gap analysis, no-overclaim |
| Architecture Integration | 52 | YAML validation, cross-file consistency, end-to-end pipeline |
| Library Sync Lifecycle | 18 | Phase ordering, idempotency, failure isolation |
| Gap Analysis Usecase | 32 | Persisted→resolution pipeline, conservative semantics, framework filtering |
| **Total** | **234** | |

### Running Tests

```bash
# All mapping-related tests
npx jest tests/unit/requirement-mapping tests/unit/mapping tests/unit/cross-framework

# Full regression (all tests)
npx jest --no-coverage
```

## Mapping Data Contribution Guide

### Strength Selection Guidelines

When creating mapping YAML files, use these guidelines for strength values:

| Use `EQUAL` when... | Both requirements express **exactly the same** obligation |
|---------------------|----------------------------------------------------------|
| Use `SUPERSET` when... | Source requirement is **broader** and fully covers target |
| Use `SUBSET` when... | Source requirement is **narrower** and only partially covers target |
| Use `INTERSECT` when... | Requirements **share common ground** but have distinct scopes |
| Use `RELATED` when... | Requirements are **conceptually related** but addressing different concerns |

**Default to `RELATED` when uncertain.** Overclaiming strength is worse than underclaiming — the gap analysis layer uses conservative interpretation, so `RELATED` mappings surface as "review needed" rather than "covered."

### Rationale Best Practices

- Be specific about *why* the mapping exists
- Reference the semantic overlap, not just shared keywords
- Keep rationale under 200 characters for UI display

## Future work

The domain model, ingestion pipeline, resolution engine, and the
product-facing `gap-analysis.ts` usecase are all operational, but
the gap-analysis usecase is not yet consumed outside the app layer.
Three surfaces remain unbuilt:

- Admin UI for mapping browsing (not yet implemented).
- Wiring into the readiness report PDF generator (not yet implemented).
- HTTP API routes for the gap-analysis endpoints (not yet exposed).

Two further mapping sets remain planned (low priority — reverse
directions of the shipped primary mappings): SOC 2 → ISO 27001:2022
and NIST CSF 2.0 → ISO 27001:2022.
- Example: "Both address information classification and asset labeling requirements"
