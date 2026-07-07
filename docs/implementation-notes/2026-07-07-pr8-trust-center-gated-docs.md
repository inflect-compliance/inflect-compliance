# 2026-07-07 — PR-8: Trust Center — gated document access (verify-and-extend)

**Commit:** _(pending)_ `feat(trust-center): gated documents + access requests + expiring download tokens`

## Verify-and-extend finding

The **public posture page** is already shipped on `main`: `TrustCenter` model
(off-by-default, slug, published frameworks/posture, security contact),
`get/upsert/setEnabled`, the import-isolated public read
(`src/lib/trust-center/public.ts`), `/trust/[slug]`, and admin UI.

The **genuine gap** is **gated document access** — the roadmap's
`TrustCenterDocument` + `TrustCenterAccessRequest` + NDA / domain-allowlist
approval + signed expiring single-use download tokens.

## Design

- **Models** (compliance.prisma, RLS): `TrustCenterDocument` (label,
  fileRecordId, `gated`) + `TrustCenterAccessRequest` (requester, status,
  ndaSignedAt, expiresAt, `downloadTokenHash @unique`, downloadedAt). New
  `TrustCenter.accessDomainAllowlist` + `ndaRequired`.
- **Public isolated module** `src/lib/trust-center/gated.ts` (same contract as
  `public.ts` — only `prisma` + `crypto`, only the 3 TrustCenter tables,
  resolves ENABLED slug, null on any failure = no existence disclosure):
  - `listPublicTrustCenterDocuments(slug)` — labels + gating only, **never**
    `fileRecordId`.
  - `requestTrustCenterAccess(slug, docId, {…, ndaAccepted})` — auto-approves
    when the requester email domain is in the allowlist AND (if required) the
    NDA is accepted → issues a **hashed, expiring, single-use** token; else
    stays `REQUESTED`.
  - `consumeDownloadToken(token)` — SHA-256 hash lookup, must be APPROVED / not
    expired / not already downloaded; **atomic single-use claim** on
    `downloadedAt: null`; returns the fileRecordId.
- **Admin** `trust-center-documents.ts`: add document, list documents, list
  requests (token hash omitted from the projection), manually approve → issue token.
- **Routes**: PUBLIC `POST /api/trust/[slug]/access-request` +
  `GET /api/trust/download/[token]` (302 → presigned storage URL); ADMIN
  documents / requests / approve.

## Security

- Download tokens: SHA-256 at rest, single-use (atomic `updateMany` on
  `downloadedAt: null`), expiring (7-day TTL). Plaintext returned once.
- No existence disclosure: disabled/missing slug or unknown/ungated document →
  `null` → 404.
- The public gated module is import-isolated (no tenant-data layer); the
  separate download route resolves the `FileRecord` + storage (not in the
  public page's import graph).
- Admin request-list + public doc-list projections never expose the token hash
  or `fileRecordId`.

## Scope

Public request/download **UI deferred** (API-complete): a gated-docs section +
request form + NDA click-through on `/trust/[slug]`, and an admin
document-management UI, are documented follow-ups. The live-status aggregate
job (pass/fail snapshot onto the trust center) is also deferred.
