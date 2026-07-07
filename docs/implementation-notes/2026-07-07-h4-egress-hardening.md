# 2026-07-07 — H4: egress hardening (Trust Center + AI provider)

**Commit:** `<pending>` fix(h4): gated-doc access, connected-review gate, AI cost/PII bounds

## Design

The two surfaces where tenant data leaves the boundary to an outside party — a
public visitor (gated documents) and a third-party LLM (questionnaire). The
transport was well-built; the authorization + minimization around it were not.

### Trust Center + access-review
1. **Gated-doc auto-approve removed.** `gated.ts` auto-approved when a
   visitor-SUPPLIED email domain matched the allowlist and returned the
   plaintext download token **inline** — anyone who knew an allowlisted customer
   domain (`x@allowlisted.com`) got a token to the gated SOC 2 / pentest with no
   proof of mailbox control and no audit. Now every request is recorded
   `REQUESTED` with a UNIFORM "request received" response (no APPROVED/token
   signal → no allowlist-probing oracle); a token is issued ONLY by the existing
   authenticated, audited admin-approval flow (`approveTrustCenterAccessRequest`).
2. **CONNECTED_APP decision reviewer gate.** `submitConnectedDecision` was
   `assertCanRead` only — any read-only member could record CONFIRM/REVOKE/MODIFY
   verdicts (SOC 2 evidence + deprovision tasks). Now mirrors the member flow:
   loads the campaign, requires `reviewerUserId === ctx.userId || canAdmin`,
   rejects on a CLOSED campaign.
3. **Close TOCTOU.** `closeCampaign` now transitions only a not-CLOSED campaign
   (conditional `updateMany`), and `closeConnectedAccessReview` wins that close
   BEFORE creating side effects (`count === 0` ⇒ bail, no duplicate tasks); task
   execution is gated on `executedAt: null`.
4. **Public-API import-isolation ratchet.** Extended
   `trust-center-coverage.test.ts` to lock the transitive import graph of the
   real anonymous entry points (`/api/trust/[slug]/access-request`,
   `/api/trust/download/[token]`) — no repository / non-trust-center usecase
   reachable.

### AI cost + privacy
5. **Per-question rate-limit + `max_tokens`.** `autofillQuestionnaire` charged
   the limiter once per RUN but looped up to `MAX_QUESTIONS=500` provider calls —
   one upload could drive ~500× the daily quota. Now `checkRateLimit` +
   `recordGeneration` fire PER provider call. The OpenRouter request sets
   `max_tokens: 800`.
6. **PII minimization before egress.** `gatherGrounding` shipped Evidence
   `content` verbatim to OpenRouter (`guardEgress` scans for secrets, not PII).
   Now Evidence sends the TITLE only (never the body), and all control/policy
   snippet text is run through `minimizePii` (redacts emails + long digit runs).
7. **Stub no longer over-affirms.** Confidence `0.35 + score*0.6` cleared the
   0.4 auto-DRAFT floor on a single keyword; now `0.15 + score*0.7` (needs real
   overlap). The hardcoded "Yes." affirmative lead-in is dropped for neutral
   phrasing + "Please verify before submitting."

## Follow-up (documented, not in this PR)

- **Redis-backed AI limiter.** The limiter is still in-memory, so N replicas ⇒
  N× the ceiling. Per-question accounting bounds the single-instance blast
  radius; a Redis limiter (or gating multi-instance deploy on it) is the
  remaining hardening — same class as the audit-stream limiter follow-up.

## Decisions

- **Dropped auto-approve rather than emailing the token.** Emailing from the
  import-isolated `gated.ts` risks pulling the mailer/audit graph into the
  public-route isolation lock. The existing admin-approval flow already issues +
  audits + can deliver the token to the verified requester, so requiring it is
  both simpler and strictly safer.
- **Evidence title-only, not a summary field.** Evidence has no dedicated
  summary column and `content` is the PII-heavy artefact dump; the title carries
  enough grounding signal without shipping the body.
