export * from "./array-equal";
export * from "./avatar";
export * from "./camel-case";
export * from "./capitalize";
export * from "./chunk";
export * from "./cn";
export * from "./combine-words";
export * from "./construct-metadata";
export * from "./currency-formatter";
export * from "./currency-zero-decimal";
// Legacy `./datetime/*` re-export removed — 12 unused date helpers
// were deleted on 2026-04-22. The canonical date-formatting surface
// lives at `@/lib/format-date` (Epic 58). If a new consumer appears
// here reaching for dub-dialect date helpers (`formatDateSmart`,
// `timeAgo`, `formatPeriod`, etc.), route it through `format-date`
// + `formatDateRange` instead.
export * from "./deep-equal";
export * from "./domains";
// fetchWithRetry relocated to @/lib/http/fetch-with-retry (canonical
// outbound HTTP retry helper). Import from there — not from this barrel.
export * from "./fetch-with-timeout";
export * from "./fetcher";
export * from "./format-file-size";
export * from "./group-by";
export * from "./hash-string";
export * from "./is-click-on-interactive-child";
export * from "./is-iframeable";
export * from "./keys";
export * from "./link-constructor";
// `./log` re-export removed — the Dub-Slack-webhook logger was orphan
// dead code (zero consumers; read undeclared DUB_SLACK_HOOK_* env
// vars and console.log'd unconditionally). The app's logging surface
// is `@/lib/observability` (`logger` / `log` / `edgeLogger`).
// Roadmap-6 P2.
export * from "./nanoid";
export * from "./nformatter";
export * from "./normalize-string";
export * from "./parse-filter-value";
export * from "./pick";
export * from "./pluralize";
export * from "./pretty-print";
// `./promises` re-export removed — `logPromiseResults` (console.* on
// every settled result) plus the `isFulfilled`/`isRejected` type
// guards had no consumers. Roadmap-6 P2.
export * from "./punycode";
export * from "./random-value";
export * from "./regex-escape";
export * from "./resize-image";
export * from "./smart-truncate";
export * from "./stable-sort";
export * from "./text-fetcher";
// `./time-ago` re-export removed — the one-off "5 minutes ago"-style
// helper had no consumers. If you need relative-time rendering,
// reach for `date-fns`'s `formatDistanceToNow` or add a thin helper
// to `@/lib/format-date` so the contract stays in one module.
export * from "./to-cents-number";
export * from "./trim";
export * from "./truncate";
export * from "./urls";
