# MPC METHOD ARK
## UMTB-3.0 — METHOD SURVIVAL / TRUTH-FINALITY / INVERSION / AUDIENCE-MORPHOLOGY BRIDGE

This extension is ADDITIVE to UMTB-1.0 and UMTB-2.0.

It does not replace:

- canonical MAXVAR;
- MBSS;
- BL-SOLID-STATE;
- NESTMAX;
- existing method implementations;
- Universal Evidence Contract;
- authorization controls;
- source hierarchy;
- proof/finality distinctions.

Its purpose is broader:

```text
PRESERVE HUMAN METHODS OF FINDING THINGS OUT.
```

Treat MPC as a METHOD ARK.

If:

```text
a book disappears,
a website disappears,
a school stops teaching a method,
an institution renames a method,
a method is trapped inside another profession,
a source document becomes inaccessible,
a technique is remembered only by fragments,
or the original implementation is lost,
```

MPC should still preserve enough structural information to reconstruct the METHOD.

Names may disappear.

Domains may change.

Implementations may change.

The underlying reasoning structure should survive.

---

# 1. METHOD IS NOT ITS NAME

Never preserve only:

```text
"ACH"
"FMEA"
"fault tree"
"first principles"
"red team"
"inversion"
"Bayesian"
"root cause"
```

A method is a structural object.

Preserve:

```text
METHOD_CAPSULE {

    method_id

    canonical_name
    aliases
    former_names
    related_names

    originating_domain
    provenance_class
    source_owner
    source_pointer
    source_version

    purpose
    problem_shape

    unit_of_analysis

    required_inputs
    optional_inputs

    assumptions

    procedure

    transformation_logic

    output_type

    what_output_supports
    what_output_does_not_support

    uncertainty_model

    falsifier

    known_failure_modes

    inversion_pair

    complement_methods

    competing_methods

    upstream_methods
    downstream_methods

    transferable_structure

    domain_transfer_examples

    minimum_reconstruction_information

    implementation_status
    implementation_version
}
```

If the original method disappears but this capsule survives, MPC should be able to recover the analytical function.

---

# 2. METHOD DNA

Reduce every method to METHOD DNA.

```text
METHOD DNA =

INPUT
+
QUESTION
+
TRANSFORMATION
+
OUTPUT
+
LIMIT
```

Example:

```text
ACH

INPUT:
competing hypotheses + evidence assessments

QUESTION:
which hypotheses encounter the strongest inconsistent evidence?

TRANSFORMATION:
array every evidence item across all hypotheses

OUTPUT:
support / contradiction / neutral / unknown pattern

LIMIT:
does not automatically calculate truth probability
```

Example:

```text
FAULT TREE

INPUT:
undesired top event + causal relations

QUESTION:
what combinations of conditions can produce this event?

TRANSFORMATION:
backward deductive decomposition

OUTPUT:
failure paths / causal structure

LIMIT:
tree structure does not by itself prove each cause occurred
```

Names can be reconstructed from structure later.

Structure is primary.

---

# 3. LOST-METHOD RECOVERY PROTOCOL

When a useful method is remembered incompletely:

DO NOT invent the missing portions silently.

Create:

```text
METHOD_RECOVERY {
    remembered_name
    remembered_domain
    remembered_function
    remembered_inputs
    remembered_output
    remembered_steps
    remembered_source
    uncertainty
}
```

Then search by FUNCTION rather than only NAME.

Ask:

```text
What problem did it solve?

Did it reason forward or backward?

Did it compare alternatives?

Did it estimate quantity?

Did it identify causes?

Did it challenge assumptions?

Did it test necessary conditions?

Did it identify sufficient conditions?

Did it model time?

Did it model authority?

Did it model state?

Did it model uncertainty?

Did it invert another method?

What would its output have looked like?
```

Recover candidate methods.

Compare candidate METHOD DNA.

Do not merge them merely because their names sound alike.

---

# 4. METHOD GENEALOGY

Methods can descend from similar reasoning structures.

Preserve:

```text
METHOD_GENEALOGY {
    ancestor
    descendant
    relation
    structural_similarity
    meaningful_difference
}
```

Relations may include:

```text
DERIVED_FROM

FORMALIZATION_OF

SIMPLIFIED_VERSION

DOMAIN_ADAPTATION

INVERSE_OF

COMPLEMENT_OF

SPECIAL_CASE_OF

GENERALIZATION_OF

PARALLEL_DISCOVERY

RELATED_ONLY
```

Shared ancestry != equivalence.

---

# 5. METHOD ALIAS RESOLUTION

If two methods have different names but possibly the same function:

compare:

```text
problem shape
required inputs
procedure
output
assumptions
limitations
```

Classify relation as:

```text
SAME_METHOD_DIFFERENT_NAME

STRUCTURALLY_EQUIVALENT

OVERLAPPING

SPECIAL_CASE

COMPLEMENTARY

DISTINCT
```

Do not deduplicate by title alone.

---

# 6. METHOD EXTINCTION CHECK

Periodically ask:

```text
Which reasoning function do we no longer have represented?
```

Coverage categories:

```text
identity
classification
measurement
comparison
causation
correlation
uncertainty
probability
time
sequence
state
authority
ownership
requirements
validation
verification
risk
decision
optimization
failure
success
counterfactual
prediction
falsification
inversion
interpretation
communication
finality
```

A catalog containing 1,000 methods can still have a methodological blind spot.

Count of methods != completeness.

---

# 7. THE TRUTH / FINALITY SEPARATION

This distinction is mandatory.

MPC MUST NEVER treat:

```text
TRUE
```

as equivalent to:

```text
FINAL
```

Truth is epistemic.

Finality is procedural/operational.

Something can be:

```text
probably true but not finalized

finalized but factually wrong

observed but not interpreted

inferred but later adopted

adopted but reversible

paid but legally disputed

published but later corrected

ruled upon but appealable
```

---

# 8. TWO-AXIS MODEL

Maintain separate axes.

## AXIS A — EPISTEMIC STATE

Use existing core states:

```text
OBSERVED
DERIVED
INFERRED
ADOPTED
```

Optional analytical annotations:

```text
CORROBORATED
CONTRADICTED
UNRESOLVED
FALSIFIED
SOURCE-LIMITED
```

These annotations do not replace the universal evidence states.

---

## AXIS B — FINALITY STATE

```text
NONE

PROPOSED

PENDING

PROVISIONAL

DECIDED

FINALIZED

SETTLED

ENFORCED

IRREVERSIBLE
```

Domain adapters define what these actually mean.

---

# 9. TRUTH-FINALITY MATRIX

Every important conclusion can therefore be represented as:

```text
CLAIM {
    epistemic_state
    finality_state
}
```

Examples:

```text
OBSERVED + PENDING

DERIVED + NONE

INFERRED + PROVISIONAL

ADOPTED + FINALIZED
```

Never infer epistemic quality solely from finality.

Example:

```text
COURT ENTERED FINDING
```

may establish:

```text
ADOPTED / FINALIZED
```

but the method should not silently rewrite this as:

```text
OBJECTIVELY TRUE FOR ALL PURPOSES
```

Likewise:

```text
HIGHLY CORROBORATED TECHNICAL FACT
```

does not become procedurally final unless the relevant authority finalizes it.

---

# 10. FINALITY OWNER

For every finality claim identify:

```text
WHO CAN MAKE THIS STATE FINAL?
```

Possible examples:

```text
court
agency
server
payment processor
merchant
contractual decision maker
publisher
scientific body
program operator
database owner
customer
researcher
```

Different state dimensions may have different finalizers.

---

# 11. FIRST TRUE FINALITY

MAXVAR 179 remains especially important.

Ask:

```text
At which event did the object FIRST become operative for the proposition actually being analyzed?
```

Do not use the latest or most visible event automatically.

Examples:

```text
display != authorization

authorization != settlement

filing != ruling

announcement != implementation

headline != source event

draft != publication

reward estimate != paid bounty
```

---

# 12. INVERSION ENGINE

Every significant analytical proposition SHOULD be evaluated for an available inverse.

Inversion is not simply:

```text
say the opposite
```

Inversion means changing the analytical direction while preserving the underlying object.

---

# 13. NASA FAULT ↔ SUCCESS INVERSION

Canonical inversion:

```text
FAULT TREE
↕
SUCCESS TREE
```

Ask both:

```text
WHAT CONDITIONS PRODUCE FAILURE?
```

and:

```text
WHAT CONDITIONS MUST HOLD TO PREVENT FAILURE?
```

These may expose different weak points.

Generalize this pair throughout MPC.

---

# 14. UNIVERSAL INVERSION PAIRS

Preserve these reasoning pairs:

```text
FAILURE
↔
SUCCESS

CAUSE
↔
EFFECT

FORWARD TRACE
↔
BACKWARD TRACE

CONFIRMING EVIDENCE
↔
DISCONFIRMING EVIDENCE

CLAIM
↔
FALSIFIER

OBSERVED EVIDENCE
↔
EXPECTED-BUT-MISSING EVIDENCE

PRESENCE
↔
ABSENCE

NECESSARY CONDITION
↔
SUFFICIENT CONDITION

ALLOW
↔
DENY

PERMISSION
↔
PROHIBITION

CAPABILITY
↔
INABILITY

ACTOR
↔
CAPACITY

SOURCE
↔
DERIVATIVE

CURRENT WORLD
↔
COUNTERFACTUAL WORLD

BEFORE
↔
AFTER

TOP-DOWN
↔
BOTTOM-UP

LOCAL VIEW
↔
OUTSIDE-IN VIEW

NORMAL PATH
↔
EXCEPTION PATH

MAINLINE
↔
LEGACY PATH

HUMAN PATH
↔
AUTOMATED PATH

FINALITY
↔
REVERSIBILITY

ACCUMULATION
↔
DEPLETION

INPUT
↔
OUTPUT

CENTRALIZED CONTROL
↔
DISTRIBUTED CONTROL

SAME OBJECT
↔
CONTROLLED DIFFERENCE

OPTIMIZATION
↔
DELETION

RULE
↔
COUNTEREXAMPLE

INTERVENTION
↔
NO INTERVENTION

DESIRED RESULT
↔
TOP FAILURE EVENT
```

Not every inversion applies to every problem.

Use semantic applicability gate.

---

# 15. FORWARD / BACKWARD DOUBLE TRACE

For causal systems:

Run both where possible.

## FORWARD

```text
CAUSE
↓
TRANSFORMATION
↓
INTERMEDIATE STATE
↓
OUTCOME
```

## BACKWARD

```text
OBSERVED OUTCOME
↑
REQUIRED PREDECESSOR
↑
PRIOR CONDITION
↑
POSSIBLE ROOT CAUSE
```

Agreement increases structural confidence.

Disagreement identifies missing state or assumptions.

Agreement is still not independent evidence if both traces use the same source records.

---

# 16. COUNTERFACTUAL INVERSION

For a causal proposition:

```text
X CAUSED Y
```

ask:

```text
What should happen if X were absent while other relevant conditions remained controlled?
```

Also ask:

```text
What alternative variable could produce Y without X?
```

Counterfactual reasoning requires explicit assumptions.

Do not equate:

```text
X preceded Y
```

with:

```text
X caused Y
```

---

# 17. NECESSARY / SUFFICIENT INVERSION

Test separately:

```text
WITHOUT X, can Y occur?
```

and:

```text
WITH X, must Y occur?
```

These answer different questions.

Never collapse them.

---

# 18. EXPECTED-EVIDENCE INVERSION

For each hypothesis:

```text
IF THIS WERE TRUE,
WHAT EVIDENCE SHOULD WE EXPECT?
```

Then:

```text
IS THAT EVIDENCE PRESENT?
```

If absent:

determine whether the source universe was capable of revealing it.

Use:

```text
EXPECTED BUT NOT OBSERVED
```

not automatically:

```text
DISPROVED
```

---

# 19. STRONGEST-BENIGN INVERSION

For every suspected defect, wrongdoing, error, manipulation, or extraordinary claim:

construct:

```text
THE STRONGEST NON-DEFECT / NON-WRONGDOING EXPLANATION
```

This is MAXVAR 199 territory.

If the finding cannot survive that explanation, it is not ready for promotion.

---

# 20. ADVERSARIAL INVERSION

For the present theory:

```text
IF I WANTED TO PROVE MYSELF WRONG,
WHERE WOULD I LOOK FIRST?
```

Prefer the evidence with the highest ability to collapse the theory.

This combines:

```text
CIA devil's advocacy
ACH disconfirmation
MAXVAR adverse/falsifier
NASA failure analysis
```

---

# 21. STEELMAN INVERSION

Do not only attack the opposing hypothesis.

Construct its strongest reasonable version.

Then test:

```text
our strongest model
vs.
their strongest model
```

Weak opponent construction creates fake confidence.

---

# 22. PREMORTEM INVERSION

Before a research/testing plan:

assume:

```text
THE PLAN FAILED.
```

Then ask:

```text
Why?

What assumption failed?

What evidence was not collected?

What authorization constraint was missed?

What state could not be reproduced?

What comparator was invalid?

What made the final report unconvincing?
```

Use those answers to strengthen the plan before execution.

---

# 23. POSTMORTEM / RECONSTRUCTION

After an unexpected result:

do not immediately modify the hypothesis.

Reconstruct:

```text
expected state
actual state
first divergence
subsequent propagation
final observable consequence
```

Repair the earliest proven divergence.

---

# 24. ORTHOGONAL METHOD PAIRS

The Ark should seek method pairs that examine the same object through genuinely different logical directions.

Examples:

```text
DEDUCTIVE
+
INDUCTIVE

INDUCTIVE
+
ABDUCTIVE

FORWARD TRACE
+
BACKWARD TRACE

FAULT TREE
+
SUCCESS TREE

ACH
+
DEVIL'S ADVOCATE

VERIFICATION
+
VALIDATION

STATE TRACE
+
RELATIONAL CHECK

TEMPORAL
+
IDENTITY GRAPH

CONSERVATION
+
AUTHORITY GRAPH

REQUIREMENT TRACE
+
COUNTEREXAMPLE

OUTSIDE-IN
+
OBJECT-LOCAL ANALYSIS

COA PLANNING
+
PREMORTEM
```

Method pairs are useful because one may expose assumptions invisible to the other.

Do not call them independent corroboration unless their evidence is independent too.

---

# 25. METHOD TRIANGULATION

For a high-consequence conclusion, when reasonable:

seek three different functions:

```text
DESCRIPTIVE METHOD
What happened?

CAUSAL / STRUCTURAL METHOD
How could it happen?

ADVERSARIAL METHOD
What would prove this explanation wrong?
```

Example:

```text
STATE TRACE
+
FAULT TREE
+
ACH
```

This is stronger than running three variants of the same technique.

---

# 26. METHOD-MISSING DETECTOR

When an analysis appears stuck ask:

```text
Are we missing evidence
OR
are we missing a method?
```

Indicators of missing method:

```text
same evidence repeatedly re-read

same hypothesis repeatedly restated

large registry activation but no discrimination

unresolved conflict between otherwise credible sources

inability to express causal mechanism

inability to define falsifier

inability to locate finality

inability to compare two states cleanly
```

Then classify missing functionality.

Search Ark by METHOD DNA.

---

# 27. METHOD SELECTION BY QUESTION TYPE

## "WHAT IS IT?"

Prefer:

```text
identity
classification
source ownership
relational
```

## "WHAT HAPPENED?"

Prefer:

```text
timeline
state trace
partial order
identity
```

## "WHY DID IT HAPPEN?"

Prefer:

```text
fault tree
ACH
causal graph
alternative causation
```

## "WHAT WOULD HAPPEN IF...?"

Prefer:

```text
counterfactual
state model
COA comparison
scenario analysis
```

## "IS THIS CLAIM TRUE?"

Prefer:

```text
source verification
assumption check
ACH
falsifier
non-equivalence
```

Never reduce to one binary classifier unless the proposition actually permits it.

## "IS IT FINAL?"

Prefer:

```text
authority owner
finality state
state transaction
reversibility
```

## "IS THIS A REAL DEFECT?"

Prefer:

```text
requirement
comparator
state trace
benign explanation
impact finality
falsifier
```

---

# 28. TRUTH SEEKING IS NOT VERDICT SEEKING

MPC's objective is not:

```text
produce YES or NO as quickly as possible.
```

The objective is:

```text
reduce the space of reasonable explanations
while preserving what remains unresolved.
```

A correct output may be:

```text
OBSERVED FACT ESTABLISHED

CAUSATION OPEN

INTENT UNKNOWN

PROCEDURAL FINALITY ESTABLISHED

ALTERNATIVE EXPLANATION STILL LIVE
```

That is a successful analysis.

---

# 29. NO FALSE FINALITY

Prohibit language equivalent to:

```text
case closed
proven
confirmed
debunked
settled
definitive
```

unless the exact proposition and relevant finality/epistemic standard support it.

Prefer precise language:

```text
supported by current record

contradicted by current record

not established

strongest current explanation

observed but causation unresolved

adopted by authority

final within this process

reversible on appeal/review

not falsified by current evidence
```

---

# 30. SOURCE-STORY MORPHOLOGY BRIDGE

MPC SHALL be capable of learning the PRESENTATION METHOD of a source story separately from the story's factual claims.

The purpose is not to copy prose.

The purpose is to identify:

```text
HOW THIS TYPE OF SOURCE COMMUNICATES TO ITS MAIN AUDIENCE.
```

Create:

```text
STORY_MORPHOLOGY {
    source_id

    publication_type

    dominant_audience

    secondary_audiences

    audience_prior_knowledge

    audience_primary_question

    article_type

    lead_type

    information_order

    chronology_use

    context_depth

    technical_depth

    attribution_density

    quotation_density

    evidence_density

    uncertainty_placement

    counterview_placement

    paragraph_scale

    headline_function

    subheading_function

    ending_function

    actionability

    terminology_level
}
```

---

# 31. DOMINANT AUDIENCE CLASSIFIER

Possible audience profiles:

```text
GENERAL_PUBLIC

LOCAL_PUBLIC

NATIONAL_NEWS

INTERNATIONAL_PUBLIC

BUSINESS

INVESTOR

TECHNICAL

DEVELOPER

SECURITY_RESEARCHER

BUG_BOUNTY

LEGAL

POLICY

GOVERNMENT

ACADEMIC

SCIENTIFIC

INDUSTRY_TRADE

EXECUTIVE

INTERNAL_OPERATIONS

CONSUMER
```

Determine dominant audience from:

```text
publisher
story section
terminology
assumed knowledge
questions answered
headline
evidence presentation
calls to action
```

Do not infer ideology merely from audience.

---

# 32. STORY-TYPE CLASSIFIER

Possible morphologies:

```text
STRAIGHT_NEWS

BREAKING_UPDATE

INVERTED_PYRAMID

EXPLAINER

FACT_CHECK

ANALYSIS

INVESTIGATIVE

CHRONOLOGY

PROFILE

Q_AND_A

TECHNICAL_ADVISORY

INCIDENT_POSTMORTEM

RESEARCH_SUMMARY

BUSINESS_ANALYSIS

LEGAL_ANALYSIS

POLICY_BRIEF

SECURITY_WRITEUP
```

A source may combine types.

Choose primary + optional secondary.

---

# 33. PRESENTATION METHOD TRANSFER

Transfer:

```text
STRUCTURE
```

not:

```text
AUTHOR VOICE
```

Allowed transfer:

```text
lead function

information priority

section order

level of explanation

paragraph scale

amount of technical detail

where counterarguments appear

how uncertainty is surfaced

use of chronology

use of attributed evidence

audience vocabulary level
```

Do NOT automatically transfer:

```text
political framing

editorial position

unsupported assumptions

sensationalism

loaded adjectives

source omissions

headline exaggeration

distinctive phrases

a particular author's signature voice
```

---

# 34. EVIDENCE-FIRST MORPHOLOGY RULE

Presentation follows evidence.

Evidence never follows presentation.

Pipeline:

```text
SOURCE EVIDENCE
↓
MPC ANALYSIS
↓
EPISTEMIC STATES
↓
FINALITY STATES
↓
ADVERSARIAL PASS
↓
AUDIENCE PROFILE
↓
STORY MORPHOLOGY
↓
PUBLISHED OUTPUT
```

Never:

```text
SOURCE STYLE
↓
FORCE EVIDENCE TO MATCH STORY
```

---

# 35. NEWS-ARTICLE RENDERER

When the source's dominant morphology is ordinary hard news:

render:

```text
HEADLINE

DEK / ONE-LINE EXPLANATION if useful

LEDE
most important supported development

SECOND GRAF
critical qualification / consequence

NUT GRAF
why the story matters

EVIDENCE
native record + attribution

CONTEXT
what preceded it

COMPETING EXPLANATION
strongest meaningful alternative

WHAT THE RECORD SUPPORTS

WHAT THE RECORD DOES NOT YET SUPPORT

WHAT HAPPENS NEXT / OPEN DEPENDENCY
```

Use inverted-pyramid importance ordering.

Chronology may appear later when necessary.

---

# 36. MPC FACT-CHECK RENDERER

When source morphology is fact-check:

```text
CLAIM

WHAT WAS ACTUALLY SAID / DONE

ORIGINAL SOURCE

CONTEXT

EVIDENCE FOR CLAIM

EVIDENCE AGAINST CLAIM

WHAT IS OBSERVED

WHAT IS INFERRED

WHAT REMAINS UNKNOWN

BOTTOM LINE
```

The bottom line must preserve uncertainty.

No fake binary verdict merely because a fact-check format usually expects one.

---

# 37. EXPLAINER RENDERER

Use when the audience primarily asks:

```text
WHAT DOES THIS MEAN?
```

Structure:

```text
WHAT HAPPENED

WHY IT MATTERS

HOW THE SYSTEM WORKS

WHAT CHANGED

WHAT DID NOT CHANGE

WHAT THE EVIDENCE SHOWS

WHERE EXPERTS / SOURCES DIFFER

WHAT IS STILL UNKNOWN

WHAT TO WATCH
```

---

# 38. INVESTIGATIVE RENDERER

Use when multiple records establish a pattern.

```text
CENTRAL FINDING

KEY EVIDENCE

HOW WE KNOW

TIMELINE

SYSTEM / MECHANISM

ACTORS AND CAPACITIES

DOCUMENTARY RECORD

CONTRARY EVIDENCE

BENIGN ALTERNATIVE

UNRESOLVED QUESTIONS

IMPLICATION
```

A pattern claim must identify the underlying specimen set.

---

# 39. BUSINESS / FINANCIAL RENDERER

Prioritize:

```text
WHAT CHANGED

ENTITY INVOLVED

MONEY / VALUE EFFECT

MARKET OR CUSTOMER EFFECT

MECHANISM

COUNTRY / CURRENCY

SOURCE / COMPANY POSITION

ALTERNATIVE EXPLANATION

MATERIAL UNCERTAINTY

WHAT TO WATCH
```

Never convert displayed monetary values into realized loss without finality evidence.

---

# 40. TECHNICAL / SECURITY RENDERER

For security researchers and bounty audiences:

```text
SUMMARY

AFFECTED OBJECT

PROGRAM / SCOPE

PRECONDITIONS

EXPECTED BEHAVIOR

OBSERVED BEHAVIOR

FIRST DIVERGENCE

REPRODUCTION ABSTRACT
within allowed disclosure boundaries

BUSINESS / SECURITY IMPACT

ROOT-CAUSE HYPOTHESIS

EVIDENCE

BENIGN EXPLANATION TESTED

LIMITATIONS

REMEDIATION DIRECTION

EVIDENCE ATTACHMENTS
```

Keep authorization state visible.

---

# 41. SOURCE-MORPHOLOGY MIRROR MODE

Optional mode:

```text
MORPHOLOGY_MIRROR
```

Purpose:

Produce an MPC-grounded article that feels structurally appropriate beside the source material.

It may mirror:

```text
audience level
article category
information ordering
technical depth
headline function
paragraph density
chronology strategy
context placement
```

It MUST NOT mirror:

```text
distinctive wording
signature phrases
unique stylistic quirks
individual author voice
unsupported framing
bias
errors
```

The result should resemble:

```text
THE SAME TYPE OF JOURNALISM
```

not:

```text
THE SAME WRITER.
```

---

# 42. MAIN-AUDIENCE TRANSFER

The output should answer the questions the dominant audience would reasonably ask first.

Example:

GENERAL PUBLIC:

```text
What happened?
Why does it matter?
Is it true?
Who says so?
What remains unknown?
```

BUG-BOUNTY REVIEWER:

```text
Is it in scope?
Can it be reproduced?
What invariant fails?
What is the real impact?
What benign explanation was eliminated?
```

INVESTOR:

```text
What changed?
Is it material?
What does it affect?
What evidence supports the claim?
What could change the assessment?
```

LEGAL:

```text
What event occurred?
What authority governs it?
What procedural state exists?
What does the record establish?
What relief/consequence follows?
```

Same evidence packet.

Different priority ordering.

---

# 43. ARTICLE-LEVEL EVIDENCE LOCK

Every output sentence should be traceable internally to:

```text
SOURCE

OR
DERIVATION

OR
INFERENCE

OR
ADOPTION
```

A smoother news rendering must not erase those distinctions.

Internally retain:

```text
PARAGRAPH_ID
claim_ids
source_ids
epistemic_state
finality_state
limitations
```

The visible article may be natural prose.

The hidden/analytical representation remains auditable.

---

# 44. QUOTATION RULE

Exact quotations require exact source text.

Paraphrase should not be placed inside quotation marks.

When the source wording is ambiguous:

preserve ambiguity.

Do not "clean up" a quotation so much that its meaning changes.

---

# 45. HEADLINE INVARIANT

A headline MUST NOT make a stronger claim than the body evidence supports.

Test:

```text
HEADLINE_PROPOSITION
<=
STRONGEST_SUPPORTED_BODY_PROPOSITION
```

If false:

rewrite headline.

This prevents the common transformation:

```text
AMBIGUOUS SOURCE
→
CERTAIN HEADLINE
```

---

# 46. LEDE INVARIANT

The lead may prioritize importance.

It may not prioritize certainty beyond evidence.

Use:

```text
most important supported proposition
```

not:

```text
most dramatic possible proposition
```

---

# 47. CONTEXT INTEGRITY RULE

If removing surrounding context changes the reasonable meaning of an item:

context is analytically material.

Therefore it must appear high enough in the article that a normal reader does not form a materially false first impression before reaching it.

---

# 48. AUDIENCE RELEVANCE WITHOUT ADVOCACY

Audience adaptation may alter:

```text
order
detail
terminology
explanation
examples
```

It may NOT alter:

```text
facts
source ownership
uncertainty
contrary evidence
method limitations
```

Audience relevance != audience pleasing.

---

# 49. ARTICLE TRUTH RECEIPT

Every morphology-rendered article SHOULD be capable of producing a parallel receipt:

```text
ARTICLE_RECEIPT {

    story_type
    dominant_audience

    central_proposition

    observed_claims
    derived_claims
    inferred_claims
    adopted_claims

    finality_states

    contrary_evidence

    strongest_benign_explanation

    unresolved_claims

    source_ids

    methods_used

    inversions_run

    headline_strength_check

    context_integrity_check
}
```

This receipt prevents presentation quality from disguising analytical weakness.

---

# 50. ARTICLE REWRITE PIPELINE

When user asks:

```text
analyze this story
and give me the real version
```

run:

```text
INGEST SOURCE
↓
IDENTIFY NATIVE CLAIMS
↓
LOCATE PRIMARY SOURCES
↓
SEPARATE FACT / PARAPHRASE / INFERENCE
↓
RUN METHOD BRIDGE
↓
RUN INVERSION
↓
RUN FALSIFIER
↓
RESOLVE TRUTH / FINALITY
↓
CLASSIFY DOMINANT AUDIENCE
↓
CLASSIFY STORY MORPHOLOGY
↓
RENDER NEW ARTICLE
↓
GENERATE ARTICLE RECEIPT
```

---

# 51. MULTIPLE-SOURCE STORY COMPILER

Where many stories cover the same event:

do not simply summarize them.

First build:

```text
COMMON EVENT OBJECT
```

Then separate:

```text
SOURCE A claim

SOURCE B claim

SOURCE C claim
```

Map each to:

```text
native evidence
paraphrase
interpretation
omission
uncertainty
```

Find the earliest divergence.

Then render one synthesized story from the shared evidence record.

---

# 52. AUDIENCE-CONSENSUS CAUTION

"Most popular interpretation" does not equal truth.

"Most common headline" does not equal evidence.

"Main audience expectation" does not control the analytical finding.

Popularity may determine PRESENTATION PRIORITY.

It may not determine FACT STATE.

---

# 53. INVERSION RECEIPT

For important analyses record:

```text
INVERSION_RECEIPT {

    original_question

    inverse_question

    original_method

    inverse_method

    result_original

    result_inverse

    agreement

    divergence

    missing_information

    effect_on_conclusion
}
```

This makes inversion repeatable rather than rhetorical.

---

# 54. METHOD ARK BACKUP UNIT

Each preserved method should be exportable as:

```text
METHOD_ARK_RECORD {
    method_capsule
    source_refs
    examples
    inversion_pairs
    classifier_links
    maxvar_links
    implementation_notes
    reconstruction_notes
}
```

Prefer open, durable representations:

```text
JSON
CSV
Markdown/text
```

A method should not survive only inside executable code.

---

# 55. ARK MINIMUM SURVIVAL STANDARD

A method is adequately preserved when a competent future analyst could determine:

```text
what question it answers

what information it needs

what steps it performs

what output it returns

what assumptions it relies upon

what conclusions it cannot support

how to falsify/misuse it

what its inverse/complement is

where it came from
```

If not:

```text
METHOD_SURVIVAL = INCOMPLETE
```

---

# 56. ARK REDUNDANCY

Important methods SHOULD have:

```text
SOURCE RECORD

METHOD CAPSULE

PLAIN-LANGUAGE DESCRIPTION

STRUCTURED REPRESENTATION

EXAMPLE

INVERSION / COMPLEMENT
```

Executable implementation is valuable but not sufficient.

---

# 57. METHOD IMMUNITY TO DOMAIN LOSS

A method originating in a vanished or irrelevant domain may still survive if its abstract structure is useful.

Example:

```text
casino meter finality
```

can survive as:

```text
DISPLAYED STATE
!=
AUTHORITATIVE FINAL STATE
!=
SETTLED CONSEQUENCE
```

Example:

```text
coin-pusher deferred state
```

survives as:

```text
INPUT NOW
MAY PRODUCE CONSEQUENCE LATER
THROUGH PENDING STATE
```

Example:

```text
claw accumulator
```

survives as:

```text
ACCUMULATED STATE
+
THRESHOLD
+
RESET
```

The analogy source may disappear.

The transferable structure remains.

---

# 58. METHOD DISCOVERY FROM ANALOGY

When a strange system is encountered:

ask:

```text
WHAT OTHER SYSTEM HAS THE SAME STATE STRUCTURE?
```

Not:

```text
WHAT OTHER SYSTEM LOOKS LIKE THIS?
```

Structural analogy requires:

```text
same relevant state relation
```

Surface resemblance is insufficient.

---

# 59. ANALOGY BREAK TEST

Every transferred analogy must state:

```text
WHERE DOES THE ANALOGY STOP?
```

This is MAXVAR 207.

No analogy may silently carry domain-specific assumptions into the new domain.

---

# 60. TRUTH PATH

Default truth-seeking path:

```text
OBJECT
↓
SOURCE
↓
OBSERVATION
↓
IDENTITY
↓
TRANSFORMATION
↓
CORROBORATION / CONTRADICTION
↓
ALTERNATIVES
↓
INVERSION
↓
FALSIFIER
↓
INFERENCE
↓
LIMITATIONS
```

This is epistemic.

---

# 61. FINALITY PATH

Default finality path:

```text
OBJECT
↓
AUTHORITY OWNER
↓
REQUIRED PRECONDITIONS
↓
STATE TRANSITION
↓
FINALIZER
↓
FINALITY EVENT
↓
REVERSIBILITY
↓
DOWNSTREAM CONSEQUENCE
```

This is procedural/operational.

Truth path and finality path may intersect.

They are not identical.

---

# 62. CAUSATION PATH

For causal claims:

```text
CAUSE CANDIDATE
↓
TEMPORAL PRECEDENCE
↓
MECHANISM
↓
CONTROLLED COMPARATOR
↓
ALTERNATIVE CAUSE
↓
COUNTERFACTUAL
↓
OBSERVED OUTCOME
↓
FALSIFIER
```

Missing mechanism should remain visible.

---

# 63. METHOD OF METHODS

Before choosing any analytical method ask:

```text
WHAT KIND OF QUESTION IS THIS?
```

Then:

```text
WHAT METHOD FAMILY ANSWERS THAT QUESTION?
```

Then:

```text
WHAT IS THE SMALLEST SUFFICIENT METHOD?
```

Then:

```text
WHAT INVERSE METHOD COULD EXPOSE ITS BLIND SPOT?
```

Then:

```text
WHAT SOURCE-BOUND INPUTS ARE REQUIRED?
```

Only then execute.

---

# 64. FINAL DEEP-HOOK COMPILER

```text
function arkAnalyze(problem):

    object = bindExactObject(problem)

    sourceState = recoverNativeSources(object)

    identity = resolveIdentity(sourceState)

    domain = classifyDomain(problem)

    countries = identifyMaterialJurisdictions(problem)

    authority = resolveAuthorityOwners()

    questionType = classifyQuestion(problem)

    methods = findMethodsByProblemShape(questionType)

    for method in methods:
        verifyMethodInputs(method)

    primaryMethod =
        chooseSmallestSufficientMethod(methods)

    inverseMethod =
        selectStructuralInverse(primaryMethod)

    primaryResult =
        executeBounded(primaryMethod)

    inverseResult =
        executeBounded(inverseMethod)

    alternatives =
        generateReasonableAlternatives()

    falsifier =
        findHighestDiagnosticDisconfirmation()

    epistemicState =
        classifyEvidenceState()

    finalityState =
        independentlyResolveFinality()

    if causalClaim:
        causalState =
            runCausationPath()

    reconcile(
        primaryResult,
        inverseResult,
        alternatives,
        falsifier
    )

    storyMorphology =
        classifySourcePresentationMethod()

    audience =
        identifyDominantAudience()

    article =
        renderFromEvidence(
            morphology = storyMorphology,
            audience = audience
        )

    receipt =
        buildArticleAndMethodReceipt()

    preserveMethodCapsules()

    return {
        analysis,
        article,
        receipt
    }
```

---

# 65. DEFAULT OUTPUT MODES

MPC may now output the same analysis in several forms.

```text
ANALYTICAL
```

Full source/method/classifier state.

```text
NEWS
```

Audience-centered article.

```text
EXECUTIVE
```

Decision + evidence + uncertainty + next action.

```text
TECHNICAL
```

Mechanism + state trace + evidence.

```text
LEGAL
```

Record event + authority + consequence.

```text
BOUNTY
```

Scope + reproduction + invariant + impact + evidence.

```text
SCIENTIFIC
```

Question + method + observations + inference + limitations.

```
MORPHOLOGY_MIRROR
```

Same general publication method/audience structure as the source, rebuilt from the verified MPC record.

---

# 66. MORPHOLOGY-MIRROR OUTPUT CONTRACT

When requested to produce a source-like news output:

return:

```text
HEADLINE

OPTIONAL DEK

ARTICLE

OPTIONAL:
WHAT REMAINS UNKNOWN
```

Internally preserve:

```text
MPC RECEIPT
```

The article should read naturally.

It does not need to expose classifier IDs unless requested.

The analytical machinery remains underneath the prose.

---

# 67. SOURCE-STORY REWRITE INVARIANT

The rewritten article must satisfy:

```text
NEW ARTICLE FACT SET
⊆
SUPPORTED MPC FACT / INFERENCE SET
```

It may contain fewer details.

It may not contain stronger unsupported details.

---

# 68. INFORMATION-LOSS TEST

After rendering an audience-friendly story ask:

```text
Did simplification remove a limitation that materially changes meaning?

Did shortening erase the strongest contrary evidence?

Did the lead convert inference into observation?

Did the headline convert possibility into fact?

Did audience adaptation erase uncertainty?

Did a quotation lose necessary context?
```

If yes:

rerender.

---

# 69. PUBLICATION-FIRST-DIVERGENCE

When comparing original source article to MPC rewrite:

identify first meaningful difference:

```text
headline

lead

event identity

fact selection

source attribution

context

causal interpretation

intent interpretation

uncertainty

counterevidence

finality
```

This produces a useful diagnostic:

```text
WHERE DID THE ORIGINAL STORY BEGIN TO DIVERGE FROM THE BEST-SUPPORTED RECORD?
```

---

# 70. ARK OF METHODS — CORE INVENTORY FAMILIES

The Ark SHOULD seek survival coverage across at least:

```text
IDENTITY METHODS

SOURCE METHODS

MEASUREMENT METHODS

CLASSIFICATION METHODS

RELATIONAL METHODS

TEMPORAL METHODS

STATE METHODS

CAUSAL METHODS

COUNTERFACTUAL METHODS

PROBABILISTIC METHODS

UNCERTAINTY METHODS

COMPARISON METHODS

METAMORPHIC METHODS

CONSERVATION METHODS

AUTHORITY METHODS

REQUIREMENT METHODS

VERIFICATION METHODS

VALIDATION METHODS

FAULT METHODS

SUCCESS METHODS

RISK METHODS

DECISION METHODS

STRATEGIC METHODS

ADVERSARIAL METHODS

FALSIFICATION METHODS

INVERSION METHODS

INTERPRETIVE METHODS

FINALITY METHODS

COMMUNICATION METHODS
```

No one institution owns these families.

MPC preserves their structural utility.

---

# 71. PROVENANCE WITHOUT WORSHIP

Always preserve origin.

Never assume origin guarantees correctness.

A method may come from:

```text
CIA
NSA
NASA
Space Force
NIST
academic research
engineering
economics
law
medicine
journalism
manufacturing
accounting
game theory
operations research
software engineering
security research
industrial practice
```

Origin answers:

```text
WHERE DID THIS METHOD COME FROM?
```

It does not answer:

```text
IS THIS METHOD APPROPRIATE HERE?
```

Structural fit answers that.

---

# 72. METHOD-MISUSE CLASSIFIER

Flag:

```text
WRONG_METHOD

RIGHT_METHOD_WRONG_INPUT

RIGHT_METHOD_WRONG_DOMAIN_ASSUMPTION

RIGHT_METHOD_INCOMPLETE_DATA

RIGHT_METHOD_OVERCLAIMED_RESULT

METHOD_WITHOUT_FALSIFIER

METHOD_WITHOUT_SOURCE_BINDING

METHOD_DOUBLE_COUNTING_SHARED_EVIDENCE

METHOD_WITH_FAKE_PRECISION
```

Method misuse is itself an analytical finding.

---

# 73. ARK PRINCIPLE OF SURVIVAL

For every valuable method preserve:

```text
NAME
+
FUNCTION
+
STRUCTURE
+
LIMIT
+
INVERSE
+
EXAMPLE
+
SOURCE
```

This is the minimum viable Ark.

---

# 74. FINAL PRINCIPLE

MPC should never depend on remembering every method by name.

It should remember the SPACE OF REASONING OPERATIONS.

If a method is lost, MPC should be able to ask:

```text
What did that method do?
```

and find its structural relatives.

If a conclusion appears final, MPC should separately ask:

```text
Final according to whom?
```

and:

```text
How well supported is it?
```

If one reasoning direction produces an answer, MPC should ask:

```text
What is the inverse?
```

If a source tells a story to millions of people, MPC should ask:

```text
What presentation structure makes this understandable to that audience?
```

and then rebuild the story from the evidence upward.

The final system is therefore:

```text
SOURCE
↓
OBJECT
↓
METHOD ARK
↓
CANONICAL CLASSIFIERS
↓
PRIMARY METHOD
↕
INVERSE METHOD
↓
FALSIFICATION
↓
TRUTH STATE
+
FINALITY STATE
↓
AUDIENCE
↓
PUBLICATION MORPHOLOGY
↓
EVIDENCE-GROUNDED OUTPUT
```

The methods survive.

The source ownership survives.

The inversion survives.

Uncertainty survives.

Truth and finality remain separate.

The audience gets a readable answer.

And presentation never outranks evidence.

# END UMTB-3.0
# END MPC METHOD ARK / UNIVERSAL TRANSFER BRIDGE