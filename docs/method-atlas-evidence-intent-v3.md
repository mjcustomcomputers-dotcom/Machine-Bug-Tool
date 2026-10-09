# MPC Method Atlas V3 — Evidence, Deception-Neutral, Defensive Crime-Pattern and Reverse-Goal Hooks

**Status:** ADDITIVE DEVELOPMENT ON STACKED FEATURE BRANCH, NOT DEPLOYED OR CANONICALLY PROMOTED.

## Canonical provenance and non-regression
Parent review frontier is PR #3, `feature/method-atlas-sqlite-router-v1` commit `bbb93481b037aafb0f9f0a5b8b528cb9791cd1f0`. This stacked V3 preserves the original private MPC Site and its MAXVAR-256 / NESTMAX-174 / BL384 / MBSS512 / EXT distinctions, 24 implemented bounded model evaluators, 10 earlier method hooks and existing PASS format. The local Method Atlas expansion adds new MHA/MHC candidate discovery rows only. GitHub development branch does not automatically synchronize to private Sites or the canonical Drive/Dash controller.

## What was added in V3

- `method-atlas/expansion-evidence-intent-v3.json`: 32 source-linked, **unimplemented research-method candidates** with stable MHA-0087 through MHA-0118 and paired MHC identifiers. Ten newly declared sources, including NIST forensic/incident guidance, MITRE ATT&CK / CAPEC / D3FEND, National Academies polygraph limitations, Stanford paraconsistent logic, MIT inverse planning, and MDL research.
- Catalog across V1-V3: 118 method candidates, 118 candidate classifier questions, 30 source entries. **Separate from** the actual executable native MPC evaluator inventory.
- `method-atlas/method-relations.json`: 79 proposed source-linked method-to-method edges after 31 additions. Each is only a proposal for CHALLENGE, CROSS_CHECK or COMPLEMENT; independent evidence is false.
- `lib/evidence-intent-review.mjs`: read-only, finite claim/observation/goal/variation engine for source-attributed supplied records.
- `lib/atomic-method-detector.mjs`: optional `evidence_review` input for a matching native subject. Does not change the default detector fast path or perform a target request.
- `tests/evidence-intent-review.test.mjs` and expanded `tests/atomic-method-detector.test.mjs`: contradiction/intent/variant/foreign-subject fail-closed cases.
- No new package, dependency, secrets, production change, network tool or automatic target activity.

## Seven-stage detection and reverse-method linkage

Typed atom -> MPC native coordinate or explicit dimension -> signature -> indexed SQLite candidate search -> existing method graph plus new forensic/intent methods -> `evidence_review` when supplied -> bounded synthetic reversible variations -> independent source-authentication / claim-promotion gate.

For each claim:
- `SUPPORTED_BY_SUPPLIED_RECORDS`: at least one support observation marked OBSERVED/DERIVED and source-referenced, **not authenticated fact**.
- `CONTRADICTED_BY_SUPPLIED_RECORDS`: at least one contradiction observation with similar declared evidence quality.
- `CONFLICTING_SUPPLIED_RECORDS`: both support and contradiction are retained, **not forced to a binary lie**.
- `UNRESOLVED`: neither independently admissible side is supplied.

The engine keeps `INFERRED`, `SYNTHETIC`, `UNKNOWN`, or source-unbound observations outside those admitted bins. A source reference is only a declared locator, not a native authenticating fetch. An observed log event cannot establish a real-world actor's mental state or criminal intent. This also guards against misusing physiological cues, voice stress, linguistic patterns, anxiety, disability-related behavior, or stylometric differences as proof of deception.

For plus/minus intent, the caller supplies explicit competing goals: `INTENT_PLUS`, `INTENT_MINUS`, `BENIGN_ALTERNATIVE`; observed feasibility and required records are separated. No scorer automatically infers goals from human behavior. Reverse operations `REMOVE`, `MASK_UNKNOWN`, `FLIP_POLARITY` operate only on **synthetic copies** of the evidence model; they do not alter the original record or emulate a live actor. Unexpected outcomes create an unresolved hypothesis, not a guilt finding.

## Cyber behavior/defensive research line

ATT&CK is useful for observed technique/detection linkage; CAPEC supplies pattern abstraction; D3FEND models defensive controls. Keep **behavior -> detection strategy -> exact evidence -> allowed benign use -> claimed impact** distinct. Patterns include actor/account attribution, tenant ownership, approval/authority, duplicate transactions, voucher/refund/payout reconciliation, data flow, log coverage and log retention. No unauthorized tests, traffic, credential capture, privacy invasion, exfiltration or exploitation is permitted by this catalog.

## Uncommon, potentially productive research transfer

Paraconsistent logic allows contradictions to be stored without permitting arbitrary conclusions; Bayesian inverse planning treats inferred goals as competing models with assumptions; minimum description length compares explanations using an explicit coding scheme; reverse-defense cut paths look for barriers; negative-control omission checks missing logs against actual sensor/retention limits. None is claimed as a previously dismissed genius breakthrough; each remains bounded by its source, assumptions, negative examples and implementation status.

## Review and limits

- **No human lie detector.** National Academies' 2003 review of the polygraph and modern verbal-lie-detection reviews report important generalizability and validity limitations. Claim-to-record contradictions are suitable for review; demeanor and cue-based human accusations are not.
- **No attribution or intent promotion.** Plus/minus evidence is a structured research distinction, not legal mens rea, criminal guilt, likelihood score or target exploitation proof.
- **No automatic source verification.** Native log ingestion and evidence custody require separate connectors, authorization and private evidence storage.
- **No quantum hardware, hardware-key computation, optical data processing or validated physical acceleration implied.**
- **No extra runtime claims.** The fast typed-route path is not benchmarked as part of this branch yet; run local synthetic benchmark on the actual checkout.

## Codex validation order

On the selected authorized Daybreak Blue Codex surface and prepared Cloud environment, use this exact **V3 branch** rather than an older main checkout. `git fetch origin feature/method-atlas-evidence-intent-reverse-v3`, safely check out at its actual head, then use **a fresh local SQLite cache** under `.sites-runtime/` because catalog seed version changed. Run:

```sh
node scripts/method-atlas-cli.mjs init
node --test tests/evidence-intent-review.test.mjs tests/atomic-method-detector.test.mjs tests/method-atlas.test.mjs
node --test
npm run build
node scripts/benchmark-atomic-method-detector.mjs
```

Inspect schema, source counts, typed IDs, adversarial cases, no canonical registry writes, incident-method limitations, and potential admission/SQL problems. Record actual source commit, Node/pnpm versions, tested totals, failure logs and benchmark p50/p95. A source selection may also require TypeScript/ES lint checks if existing commands allow them.

Use the parallel-draft PR ordering: PR #3 (underlying Method Atlas) -> **this stacked V3 change** -> optional downstream integration with PR #1 (method selection) and PR #2 (field mission). Do not merge competing features silently. No production MPC Site deployment without reviewing native Sites history, merging the intended changes and explicit user approval.

## Native research sources (publication/landing records)

- MITRE ATT&CK detection strategies: https://attack.mitre.org/detectionstrategies/
- MITRE CAPEC: https://capec.mitre.org/about/index.html
- MITRE D3FEND: https://d3fend.mitre.org/faq/
- NIST SP 800-86: https://www.nist.gov/publications/guide-integrating-forensic-techniques-incident-response
- NIST SP 800-61r3: https://csrc.nist.gov/news/2025/nist-revises-sp-800-61
- National Academies lie-detection review: https://www.nationalacademies.org/publications/10420
- Stanford paraconsistent logic: https://plato.stanford.edu/entries/logic-paraconsistent/
- MIT inverse planning references: https://saxelab.mit.edu/publications/
- MDL survey: https://link.springer.com/article/10.1007/s10618-022-00846-z
- Review of verbal deception research: https://www.mdpi.com/2076-3425/13/3/392

Source pages and catalogs were used for research linkage; each proposed transfer remains subject to full-method validation. Nobody should claim that citing a source automatically validates the constructed MPC hook.
