# DAST findings anchor

This file is the **SARIF location anchor** for OWASP ZAP (DAST) findings in
GitHub code scanning.

DAST findings are scoped to a **request URL**, not a source-code line. GitHub
code scanning maps every SARIF result location to a file in the checked-out
repository and rejects absolute `http(s):` URIs (error: *"SARIF URI scheme
http did not match the checkout URI scheme file"*), which previously dropped
all ZAP results and flagged the tool as "reporting errors".

So `.zap/zap-json-to-sarif.mjs` anchors every ZAP result at this file and puts
the real request URL in:

- the alert **message** (prefixed, so it's visible in the title), and
- the result **`properties.requestUrl`** (+ `method` / `param` when present).

Alerts are de-duplicated/tracked by `partialFingerprints` keyed on
`ruleId:requestUrl`, not by the line in this file.

To triage a ZAP alert, read the URL in the alert title/message and the
per-role HTML report artifact attached to the DAST workflow run. The curated
allowlist is [`.zap/rules.tsv`](./rules.tsv).
