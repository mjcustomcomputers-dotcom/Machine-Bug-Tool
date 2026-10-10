# MPC V28 — Linguistic Output IS a Method on Methods

**Source identity:** `mjcustomcomputers-dotcom/Machine-Bug-Tool` V27 review branch commit `8cf6888c46f040519b1342cfe21baf02431423ff` (draft PR #27).

**V28 feature branch:** `feature/mpc-linguistic-methods-on-methods-v28`. **Operating premise:** generating a linguistic statement is a transformation over a prior method's analytical result, not merely decoration or a harmless change in tone. Every such transformation can invert a negation, misstate certainty, change quantifiers, erase actors, convert proposals into commands, suppress limitations, or mistake receipt/submission for finality.

The original source already has `lib/audience-output.mjs`, which preserves raw claim text with attribution/finality state while reordering display roles, and `lib/mpc-natural-negation.mjs`, which recognizes bounded grammatical NOT markers but does **not** interpret full semantics. Those are retained unchanged. V28 adds a separately executable controlled clause grammar and a separately written replay auditor. It does **not** claim to parse arbitrary English, understand animal language, translate every language or validate sources by style.

## Noncanonical research Method Atlas

| Field | Contracts | Exact `RH-V28` IDs |
|---|---:|---|
| SEMANTIC | 10 | RH-V28-01, RH-V28-02, RH-V28-03, RH-V28-04, RH-V28-05, RH-V28-06, RH-V28-07, RH-V28-08, RH-V28-09, RH-V28-10 |
| PRAGMATICS | 4 | RH-V28-11, RH-V28-12, RH-V28-13, RH-V28-14 |
| DISCOURSE | 4 | RH-V28-15, RH-V28-16, RH-V28-17, RH-V28-18 |
| PROVENANCE | 4 | RH-V28-19, RH-V28-20, RH-V28-21, RH-V28-22 |
| OUTPUT | 6 | RH-V28-23, RH-V28-24, RH-V28-25, RH-V28-26, RH-V28-27, RH-V28-28 |
| META | 6 | RH-V28-29, RH-V28-30, RH-V28-31, RH-V28-32, RH-V28-33, RH-V28-34 |

The [full 34-hook method-science overlay](../research/linguistic-method-space-v28.json) records domain, required typed semantic objects, proposed outputs, source URLs and independent falsifiers. These are **research contracts**, distinct from both the 24 unchanged native evaluators and 239 unchanged Atlas research candidates. No canonical BL32/384, MAXVAR, MHC, MBSS, EXT, V26 meta-router or V27 method-space router source is modified.

### Primary linguistic sources

- [FrameNet, Berkeley/ICSI](https://icsi.berkeley.edu/projects/framenet-project/): frame elements, events and participant roles. MPC must not swap subject/recipient or delete a legally significant actor.
- [AMR research](https://aclanthology.org/2022.acl-long.415/): event/role graph views of meaning. **V28 does not implement an AMR parser or general graph-equivalence metric**; its own smaller typed frames are original, bounded software contracts.
- [ISO 24617-2:2020](https://www.iso.org/standard/76443.html): dialogue acts and communicative functions. Reports, questions, requests and proposals are different *acts*. The standard is not copied into V28; only a tiny explicit role vocabulary is used.
- [Stanford Encyclopedia of Philosophy on pragmatics/Grice](https://plato.stanford.edu/entries/pragmatics/): what was said differs from context-derived implicature. A causal or morally suggestive implication cannot be promoted to an express source assertion.
- [Penn Discourse Treebank 3](https://catalog.ldc.upenn.edu/LDC2019T05): relations between text spans can change argumentative meaning. `However` and `therefore` are not interchangeable; limitations and contrary observations cannot be dropped to meet an output-length preference.
- [W3C PROV-O](https://www.w3.org/TR/prov-o/): derivation, primary source, quotation, revision and attribution are distinct provenance relationships. A new linguistic rendering is a derived document, not a new independent witness.
- [Systemic Functional Linguistics](https://doi.org/10.1002/9781405198431.wbeal1137.pub2): ideational content, interpersonal purpose and textual organization are distinct. Improving persuasiveness must not alter evidential truth conditions.
- [EARS requirements syntax](https://doi.org/10.1109/RE.2009.9): structured requirements can reduce ambiguity; words such as must/shall need an actual source of obligation, not an autonomous stylistic flourish.

## Executed local finite linguistic methods

**`lib/mpc-linguistic-output-v28.mjs`**

1. `validateLinguisticFramesV28`: finite **≤16** source/owner/version-bound typed frames. Each frame has an explicit actor, restricted action vocabulary, patient, quantifier, polarity, time frame, epistemic state, source reference, optional contrary source and finality owner. No inherited pronoun reference, stealth quantifier or negation term is permitted in actor/patient labels; source ID/version/owner collision fails closed. `UNKNOWN` and `CONTESTED` cannot have a positive/negative polarity silently imposed.
2. `renderControlledLinguisticOutputV28`: one **fixed English template grammar**, with visible source, polarity, quantity, event time, speech-act, epistemic/finality labels. Questions remain review questions; next steps are explicitly `not authorized`. `SYNTHETIC` cannot masquerade as observed records. Different audience formats alter role order, never omit claims, and never grant court/business release.
3. `bindExactQuoteSpanV28`: bind a quoted UTF-16 span against caller-supplied source bytes, native identity and SHA-256 digest. Reports caller-source digest mismatch, actual quote mismatch or exact local span. No quotation is taken from a search snippet and no external authority/author is authenticated; full source text is not emitted in this receipt.

**`lib/mpc-linguistic-audit-v28.mjs`**

4. `auditControlledLinguisticOutputV28`: *independently reconstruct* the restricted grammar without invoking the output renderer, compare every claim ID/role/source, semantic frame hash, exact sentence, polarities, quantifiers, tenses, finality, owner, display order and entire document. Reject fabricated textual improvements or missing opposing clauses. **Passing means consistency with this finite template and supplied typed facts only**; no blanket semantic-equivalence claim for human-written paraphrases, hallucination detection on free text, or source authentication.

**`lib/mpc-linguistic-method-router-v28.mjs`**

5. `runLinguisticMethodsOnMethodsV28`: validates input, computes an exact input digest, short-circuits unchanged material with `STOP_NO_MATERIAL_LINGUISTIC_INFORMATION_GAIN`, then runs the above controlled renderer and independent auditor. Returns typed research-hook applicability, missing primary sources vs unexecuted method outputs, proposed method-to-method typed edges, review action and both verification receipts. It executes **two local software methods**, not 34 scholarly NLP methods or any external action. It does not modify or redirect existing `renderOutput` callers.

## Adversarial classification cases

| Source meaning | Invalid transformed output | V28 gate |
|---|---|---|
| Not observed / unknown | Did not occur | UNKNOWN cannot gain NEGATED polarity; replay rejects forged wording |
| Some transactions | All transactions | Quantifier bound in semantic frame; replay detects change |
| Caller-declared observation | Independently verified | Claim state/authentication flags remain unverified |
| The source alleges an event | The event conclusively happened | Fixed epistemic wording with source citation; unsupported rewrite rejected |
| A request or question | A command or completed action | Communicative-function guard plus `NEXT_ACTION` not authorized |
| Proposed or future action | Finalized settlement | Explicit temporal/finality contradiction guard |
| Support and contrary evidence | Only a favorable headline | One-main/discourse coverage and separate contrary-source retention |
| Source v1, custodian A | Source v2, custodian B | Native ref/version/owner collision fails closed |
| Generated paraphrase | A direct original quotation | Quote span must match exact supplied source bytes |
| Repeated restatement | Additional independent witness | No-GAIN STOP and generated output never authenticates its own source |

**Narrow guarantee:** Only a deliberately restricted, source-typed English *surface family* can be replayed exactly. General plain-English, speech, multilingual, cross-species, lawyer-authored and LLM-authored rewrites need independent NLP/human review and their own calibration controls. Do not market exact template matching as solved semantic equivalence.

## Source-exact acceptance

```sh
git fetch origin feature/mpc-linguistic-methods-on-methods-v28
git switch feature/mpc-linguistic-methods-on-methods-v28
node --test tests/mpc-linguistic-v28.test.mjs tests/mpc-v27-space-methods.test.mjs
node research/run-linguistic-method-pass-v28.mjs
node --test
pnpm run build
```

A separate V28 GitHub Actions workflow runs **these tests and the entire existing MPC test suite and build** at the pushed head. Keep CI/Windows/native-hosted receiving separate; a source commit or successful Linux build does not prove the Windows GUI, hosted Sites MPC, actual legal facts, conversational intention, or real source identity.

**Checkpoint:** `MPC_V28_LINGUISTIC_OUTPUT_IS_METHODS_ON_METHODS`.
**Completed at source level:** research contracts, controlled rendering, quote-span guard, independent semantic replay, source-context meta-router, negative tests, synthetic reproduction, CI wiring.
**Open:** exact head tests/build readback, human-authenticated source integrations, independent calibration for arbitrary paraphrases, multilingual translation, accessible GUI adapter, Windows packaging.
**Next:** validate the exact current V28 branch, repair any observed regression failure, and save the successful GitHub receipt to draft PR without merging/deploying.
