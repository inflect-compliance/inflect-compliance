# Third-party attributions

This file records third-party sources whose licensed content is reused in the
Inflect Compliance framework libraries and cross-framework mappings. Framework
requirement descriptions in `src/data/libraries/*.yaml` are our own paraphrases
unless noted; only clause/article IDENTIFIERS and mapping RELATIONSHIPS are
ported from the sources below.

## Microsoft Data Protection Mapping Project (MIT)

- **Source:** https://github.com/microsoft/data-protection-mapping-project
- **License:** MIT, © Microsoft (project archived 2024-06).
- **What is reused:** the mapping RELATIONSHIPS and clause/article IDENTIFIERS
  between ISO/IEC 27701 and privacy regulations. No ISO 27701 control text is
  reproduced (ISO copyright is respected — our own short paraphrases live in the
  framework library); GDPR/CCPA/LGPD article references are public law.
- **Used in:**
  - `src/data/libraries/mappings/iso27701-to-gdpr.yaml`
- **Follow-on (wave 2):** the same project maps ISO 27701 to CCPA, LGPD (Brazil),
  and Canada/Australia/Hong Kong/Singapore/South Korea/Turkey regimes; each will
  land as an additional `mappings/iso27701-to-<regime>.yaml` under the same
  attribution.

## ISO/IEC standards (clause-reference only)

- **ISO/IEC 27001:2022**, **ISO/IEC 27002:2022**, **ISO/IEC 27701:2019**,
  **ISO/IEC 42001:2023** — ISO-copyrighted. The libraries carry only clause
  IDENTIFIERS and structure with original paraphrased descriptions; the
  normative text must be purchased from https://www.iso.org.

## Public-law and public-domain sources

- **GDPR — Regulation (EU) 2016/679** — EU public law; article numbers and
  titles cited verbatim. Official text: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- **NIST** publications (CSF 2.0, Privacy Framework 1.0, SSDF SP 800-218) —
  U.S. Government public information.
- **OWASP** (AISVS, Top 10 Privacy Risks) — CC-BY-SA; paraphrased + attributed
  inline via the `[OWASP …]` marker.
