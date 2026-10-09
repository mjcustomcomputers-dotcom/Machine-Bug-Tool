# MPC / MACHINE LEGAL
## BUSINESS-LOGIC RECON, METHOD-TRANSFER & HOOK-HUNTING FIELD MANUAL

### PURPOSE

MPC is not merely a registry lookup system. For authorized research, it is a **business-process reasoning engine**.

The goal is to identify where a system's real behavior diverges from its claimed or intended business invariant by combining:

- exact source and object identity;
- actor, role, capacity, ownership, and authority;
- state-machine reasoning;
- timing and distributed-system ordering;
- money/value conservation;
- incentives and strategic behavior;
- queues, thresholds, accumulators, and delayed effects;
- one-variable comparisons;
- formal counterexample thinking;
- competing hypotheses and falsification;
- failure propagation;
- process-log conformance;
- evidence provenance;
- security impact;
- and high-quality vulnerability reporting.

A classifier is not a vulnerability.

A method agreeing with another method is not independent evidence.

A theoretical attack path is not a demonstrated consequence.

A displayed state is not automatically the authoritative state.

A user having permission to perform an action does not establish ownership of the target object.

A request being accepted does not establish finality.

A successful UI transition does not establish a successful economic transaction.

A shared identifier does not establish equivalence.

A different identifier does not establish non-equivalence.

The objective is to locate the **first meaningful divergence**, determine who owns that state, find the smallest falsifier, and stop weak hypotheses early.

---

# I. THE PRIME DIRECTIVE

For every workflow reduce the system to:

**OBJECT → ACTOR → CAPACITY → INPUT → CONTROLLER → PREDICATE → TRANSITION → STATE → OUTPUT → VALUE → RECIPIENT → FINALIZER → FEEDBACK → REVERSAL → EVIDENCE**

Then ask:

**What must remain invariant if I change exactly one thing?**

That question is the center of MPC business-logic recon.

---

# II. SOURCE AND AUTHORITY BEFORE ATTACK THEORY

Before generating hypotheses, establish the authoritative layers.

Typical hierarchy:

1. Current bounty/program scope and rules.
2. Current product/API documentation.
3. Current terms, business rules, support procedures, or contracts.
4. Native server/API records.
5. Native account/dashboard state.
6. Native client/browser/app state.
7. Network or device observations.
8. Preserved first-party application code/assets.
9. Historical first-party sources.
10. Third-party technical material.
11. Complaints, forums, social posts, GitHub copies, and other breadcrumbs.
12. Model inference.

Lower layers may identify a lead.

They must not silently overwrite a higher-authority source.

Always record:

`SOURCE_OWNER`
`SOURCE_CLASS`
`VERSION`
`RETRIEVAL_TIME`
`OBJECT`
`ACTOR`
`CAPACITY`
`WHAT_IT_PROVES`
`WHAT_IT_DOES_NOT_PROVE`
`SUPERSEDES`
`FALSIFIER`

---

# III. NON-EQUIVALENCE IS A FIRST-CLASS RULE

Do not silently collapse these states:

purchase ≠ payment ≠ authorization ≠ capture ≠ settlement

session ≠ transaction ≠ order ≠ payment ≠ voucher

refund request ≠ refund created ≠ refund completed ≠ money received

reservation ≠ entitlement ≠ redemption ≠ service delivery

browser redirect ≠ webhook ≠ API state ≠ dashboard state

permission ≠ ownership ≠ authority ≠ finality

display amount ≠ accounting amount ≠ settlement amount

campaign ≠ placement ≠ deal ≠ variant ≠ voucher

event ID ≠ transaction ID ≠ account ID ≠ parent ID

queued ≠ processing ≠ committed ≠ finalized

success response ≠ durable mutation

retry ≠ duplicate execution

same label ≠ same business object

same economic appearance ≠ same underlying authority

different API route ≠ different business state

If MPC cannot state the non-equivalence boundary, the hypothesis is not mature.

---

# IV. FIRST-DIVERGENCE LAW

When comparing two paths:

`A0 → A1 → A2 → A3 → A4`

and

`B0 → B1 → B2 → B3 → B4`

do not begin with A4 versus B4.

Align identity and version and find the earliest point where:

`Ai != Bi`

Classify that point.

Possible first-divergence owners:

- UI representation
- client-side classifier
- API request construction
- identifier canonicalization
- authorization
- object lookup
- business-rule evaluation
- state-transition gate
- queue insertion
- asynchronous worker
- external processor
- webhook generation
- reward calculation
- accounting ledger
- finalizer
- reporting layer

The earlier the divergence is located, the fewer speculative explanations remain.

---

# V. THE MPC HOOK OPERATORS

Use the existing operators aggressively.

## UP

Move upward one ownership level.

button → page → workflow → service → business process → external processor

Ask:

**Who ultimately owns the consequence?**

## DOWN

Decompose one level.

label → parameter → identifier → predicate → transition → mutation → artifact

Ask:

**What actually changes?**

## LEFT / RIGHT

Compare peers.

role A vs role B  
channel A vs channel B  
city A vs city B  
payment method A vs B  
API version A vs B  
account A vs B

Hold everything else constant.

## FORWARD

Follow the documented consequence.

What is supposed to happen next?

## REVERSE

Follow undo, cancel, refund, expiration, rollback, revocation, compensation, reversal, or restoration.

Many business-logic failures are only visible in reverse.

## SHAKE

Change timing or ordering without changing intended meaning.

Do not automatically equate SHAKE with concurrent flooding.

Useful SHAKE comparisons include:

before vs after expiry  
before vs after refresh  
before vs after callback  
retry after timeout  
return before webhook  
webhook before UI refresh  
cancel before settlement  
refund after partial state

## SWAP

Keep the datum or operation but change one owner-related axis.

actor  
capacity  
recipient  
channel  
account  
merchant  
parent object  
currency  
version

## INVERT

Ask what the system assumes can never happen, then model the opposite.

Examples:

Instead of “does payment create voucher?” ask:
**Can voucher state exist while payment finality is absent?**

Instead of “does refund reduce balance?” ask:
**Can balance change without the refund owning that value?**

Instead of “does this identifier identify the transaction?” ask:
**What other object could legitimately carry this identifier?**

INVERT is an assumption detector.

## SPLIT

Take one word or apparent state and split its possible meanings.

Examples:

“redeemed” may mean:
voucher consumed  
code converted to balance  
reward cashed in  
ticket validated

“complete” may mean:
client flow finished  
server workflow completed  
payment finalized  
external processor acknowledged

## JOIN

Take different representations and test whether they should converge to one canonical object.

API + dashboard + webhook + account history.

## HOLD

Freeze all variables except one.

This creates the strongest 31/32-style control.

## EXPIRE

Move only time across a documented validity boundary.

## WRAP / UNWRAP

Compare wrapper identity with underlying identity.

campaign wrapper → deal  
session → payment  
reservation → inventory unit  
marketplace order → processor transaction

## FALSIFIER

Always ask:

**What single native record would make this theory false?**

Do that before trying to prove it true.

---

# VI. THE EXISTING METHOD CREW

Do not create duplicate tools merely because a method has a memorable name.

The current crew should remain conceptually distinct.

## MAXVAR

Answers:

**Which dimension of the problem changed?**

The frozen 1–256 registry remains canonical.

Do not create MAXVAR 257 merely because a new method was discovered.

## NESTMAX

Answers:

**Which narrower contextual classifier activates under the parent dimensions?**

Child registries extend resolution; they do not replace the parent system.

## JOHNNY 5

Identifier hunter.

Primary question:

**What exactly identifies this object at every layer?**

Track:

native ID  
parent ID  
external ID  
display ID  
account ID  
version  
namespace  
owner  
recipient

Johnny 5 should constantly search for identity transformations.

## SUSAN

State-owner and consequence discipline.

Primary questions:

**Who owns this state?**

**What legally/technically makes the state operative?**

## MR. ANDERSON

Blind-spot and terminology hunter.

Look for:

same word / different function  
different word / same function  
deprecated name  
internal alias  
legacy endpoint  
marketing term hiding operational distinction

## CHESSMASTER

Strategic next-state reasoning.

Ask:

If actor A chooses X, what rational or deterministic response occurs from every other controller?

Do not analyze only the user's move.

Analyze the system's countermove.

## KRYPTONITE

Hostile falsification.

Ask:

**What smallest counterexample destroys our favorite theory?**

## RULE SCOUT

Extract:

limits  
eligibility  
exceptions  
timing windows  
one-time rules  
role restrictions  
refund rules  
ownership language  
definitions

Business rules create the expected invariant.

## TEMPORAL THREADWEAVER

Build the exact event sequence and preserve uncertainty in ordering.

## AUTHORITY / ORACLE / ADMIN SENTINEL

Separate:

who observes  
who calculates  
who authorizes  
who executes  
who records  
who can override  
who finally decides

---

# VII. NANCY LEVESON / STAMP-STPA TRANSFER

Treat business logic as a control system.

Model:

`CONTROLLER → CONTROL ACTION → CONTROLLED PROCESS → FEEDBACK → CONTROLLER PROCESS MODEL`

For every meaningful action test four possibilities:

1. required action is not supplied;
2. action is supplied when unsafe;
3. correct action occurs at the wrong time or in the wrong order;
4. action continues too long or terminates too early.

Then test the process model.

The controller may believe:

payment = pending

while processor says:

payment = captured

or:

UI says reservation cancelled

while inventory still says reserved.

The bug may not exist inside any component.

It may exist in the **relationship between correct components**.

STPA questions for MPC:

What controller issued the consequential action?

What state did it believe existed?

What source supplied that state?

Was the feedback stale?

Did another controller disagree?

Which controller wins?

Was the winning controller actually authorized to finalize?

What constraint should have prevented the unsafe transition?

Use STPA heavily for:

payments  
reservations  
refunds  
rewards  
permissions  
support overrides  
admin actions  
workflow approvals  
inventory  
subscriptions

---

# VIII. DANIEL JACKSON / ALLOY TRANSFER

Translate prose into relations.

Examples:

`refund.parent = payment.id`

`payment.owner = merchant`

`reward.campaign = qualifying_purchase.campaign`

`finalizer.object = observed_object`

`credit.recipient = qualifying_actor`

`one_business_event -> at_most_one_final_credit`

`captured_amount >= refunded_amount`

Then search for the **smallest finite structure** in which the invariant is false.

Do not start by modeling the entire product.

Small scope is a feature.

For recon:

2 accounts  
2 objects  
2 roles  
2 channels  
2 states

may expose a contradiction that disappears inside a 10,000-object model.

MPC should eventually implement a bounded relational evaluator rather than merely calling these checks “Alloy-style.”

Recommended future evaluator:

`relational_counterexample`

Inputs:

entities  
relations  
constraints  
invariants  
scope bounds

Output:

smallest counterexample  
unsatisfied invariant  
participating object IDs  
minimum changed relation  
falsifier

---

# IX. LESLIE LAMPORT / TLA+ TRANSFER

Business logic increasingly lives in distributed systems.

That means sequence diagrams are insufficient.

Lamport gives MPC several crucial distinctions.

## HAPPENS-BEFORE

Wall-clock timestamps do not automatically establish causation.

Represent:

A happened before B  
A was concurrent with B  
ordering is unknown

Do not manufacture a total order merely because timestamps exist.

## SAFETY

Something bad must never happen.

Examples:

captured total must never exceed authorized total

one coupon must never generate two final credits

a cancelled reservation must never later finalize as redeemed without a new valid transition

## LIVENESS

Something good must eventually happen.

Examples:

authorized-but-abandoned funds eventually expire

a successful refund eventually reaches a final refund state

a committed reservation eventually appears to the merchant

## INVARIANT

A property that must remain true through every permitted transition.

## NEXT-STATE RELATION

Do not merely list states.

Specify every legal transition.

Recommended future MPC method:

`temporal_property`

Support bounded properties such as:

ALWAYS P

EVENTUALLY P

P UNTIL Q

A BEFORE B

A NEVER AFTER B

AT_MOST_ONCE A

IF A THEN EVENTUALLY B

IF A THEN NEVER C

This would directly strengthen business-logic analysis of callbacks, webhooks, retries, capture/refund lifecycles, delayed rewards, and expiration.

---

# X. HERLIHY / WING — LINEARIZABILITY

When multiple operations affect the same logical object, ask whether each operation can be understood as if it took effect atomically at one point between invocation and completion.

Business-logic translation:

If two actions affect the same payment, voucher, inventory unit, account credit, or entitlement, can their observed history be reconciled with a legal sequential history?

Do not reduce every issue to “race condition.”

Ask the stronger question:

**Is the resulting history legal under the object's sequential business rules?**

Recommended MPC evaluator:

`partial_order_history`

Inputs:

operation  
object  
actor  
invoke time  
complete time  
state_before  
state_after  
result  
source_ref

Outputs:

partial-order graph  
concurrent operation groups  
candidate legal serializations  
impossible histories  
first violated invariant

This is much more useful than merely detecting overlapping timestamps.

---

# XI. SERIALIZABILITY / TRANSACTION THEORY

Linearizability is commonly single-object.

Business systems frequently mutate multiple logical objects.

Examples:

payment  
balance  
voucher  
order  
inventory  
reward

A workflow can make every individual record look plausible while the combined transaction is impossible.

Add multi-object reasoning.

Questions:

Could the observed history be produced by some legal serial ordering?

Does one transaction read stale state another transaction changed?

Do two transactions both act on a predicate that was true only before either committed?

Does finality cross objects without atomicity?

Recommended evaluator:

`transaction_history`

Model:

read set  
write set  
predicate read  
commit/abort  
real-time order  
object owner

Output:

dependency graph  
cycle candidates  
write skew  
lost update candidate  
stale-read candidate  
serializable / non-serializable / unknown

Do not automatically call a non-serializable history exploitable.

Security consequence remains a separate gate.

---

# XII. WIL VAN DER AALST — PROCESS MINING & CONFORMANCE CHECKING

This is one of the strongest additions for MPC.

A business application produces event logs.

A business rule defines an expected process.

Process mining asks:

**What process actually occurred?**

Conformance checking asks:

**Does the observed event trace conform to the expected model?**

This maps perfectly to business-logic recon.

Expected:

create session  
→ authorize  
→ capture  
→ issue entitlement

Observed:

create session  
→ issue entitlement  
→ authorization fails

That is a conformance deviation.

Another observed path:

purchase  
→ refund  
→ reward issued

may reveal a different business path than documentation describes.

Recommended MPC method:

`process_conformance`

Inputs:

case_id  
event_name  
object_id  
actor  
timestamp/order  
source_ref

plus:

expected workflow model

Outputs:

alignment  
missing expected events  
unexpected observed events  
wrong order  
skipped transitions  
duplicate transitions  
parallel paths  
closest valid path  
first divergence

This method should work especially well with HARs, API logs, webhooks, account histories, transaction exports, and saved event traces.

---

# XIII. PETRI-NET THINKING

State machines are excellent for one object.

Petri nets are better when multiple resources or prerequisites move independently.

Think in:

places  
tokens  
transitions

Example:

PAYMENT_AUTHORIZED token

INVENTORY_RESERVED token

ACCOUNT_ELIGIBLE token

Transition ISSUE_VOUCHER requires all required tokens.

A logic bug may occur when:

transition consumes the wrong token

transition fires twice

token is not consumed

rollback returns only some tokens

two transitions compete for one token

a stale token survives expiration

This is particularly strong for:

reservations  
marketplaces  
multi-party payments  
coupon systems  
referral rewards  
inventory  
seat booking  
gift cards  
balance systems

Recommended evaluator:

`token_flow`

---

# XIV. JOHN STERMAN / SYSTEM DYNAMICS

Model stocks, flows, delays, accumulators, and feedback.

Stocks:

balance  
reserved funds  
captured funds  
inventory  
credits  
reward count  
available capacity

Inflows:

purchase  
deposit  
credit  
inventory replenishment

Outflows:

refund  
redemption  
withdrawal  
expiration  
consumption

Never collapse a stock with its displayed measurement.

Ask:

What accumulates?

What drains it?

What delays observation?

What feedback causes another action?

Could delayed feedback cause amplification?

Could one event enter the stock twice?

Could a reversal remove value from the wrong stock?

---

# XV. RECIPE MATH / DIMENSIONAL ANALYSIS

Mom's recipe method stays.

It is useful because business systems constantly mix units.

Track units explicitly.

Examples:

JPY  
USD  
cents  
yen  
points  
credits  
percentage  
basis points  
quantity  
nights  
people  
items

Test equations dimensionally.

`price × quantity = total`

`gross - fee = net`

`captured - refunded = retained`

`opening + credits - debits = closing`

`discount ≤ eligible subtotal`

`reward_count × reward_value = reward_total`

Never compare numerically equal values until units are established.

Common failures:

100 interpreted as dollars on one side and cents on another

percentage interpreted as fraction

tax included versus tax exclusive

rounding before versus after aggregation

integer truncation

currency conversion applied twice

fee reversed differently from principal

Recommended evaluator:

`multi_ledger_conservation`

Do not restrict conservation to one scalar.

Represent ledgers:

payer  
merchant  
platform  
processor  
tax  
fee  
refund  
reward

Then enforce conservation across all of them.

---

# XVI. CLAW-MACHINE TRANSFER

A visible user action may not determine the outcome directly.

A hidden controller may accumulate:

attempt count  
paid amount  
risk score  
eligibility score  
payout budget  
threshold  
configuration state

Then alter later behavior.

Business-logic questions:

Is there hidden accumulated state?

Who owns it?

What resets it?

What increments it?

Does it belong to account, device, transaction, merchant, campaign, or global scope?

Does a later actor receive benefit produced by earlier actors?

Does timeout actually reset the accumulator?

Can the visible state reset while hidden state persists?

Never assume such a controller exists.

Treat it as a hypothesis requiring evidence.

---

# XVII. COIN-PUSHER TRANSFER

A coin pusher demonstrates **deferred causation**.

Actor A contributes state.

Actor B later triggers release.

The current actor may not be the principal causal contributor.

Translate into:

queued events  
pending balance  
reward counters  
credits  
inventory  
settlement batches  
referral progress  
eligibility counters

Ask:

Who contributed the state?

Who triggered threshold crossing?

Who receives the value?

Who owns the accumulator?

What happens on account switch?

What happens on expiry?

What happens on reset?

What happens after rollback?

Recommended method:

`queue_threshold`

Model:

queue entries  
owner  
creation event  
TTL  
threshold  
consumer  
reset condition  
release event

---

# XVIII. CASINO / SLOT-MACHINE ACCOUNTING TRANSFER

The key lesson is **state separation**, not gambling.

Never merge:

input authorization  
raw outcome  
rule/scaling transform  
displayed outcome  
award  
credit meter  
cashout/value object  
audit/monitoring record

Business equivalent:

request  
processor decision  
application classification  
UI status  
economic award  
account balance  
withdrawal/refund  
ledger/audit record

If two of these disagree, identify which one owns finality.

Do not assume the prettiest screen is authoritative.

---

# XIX. JOHN LITTLE / QUEUEING THEORY

Use queueing thinking when a system has:

pending requests  
workers  
batch settlement  
callbacks  
webhooks  
retry queues  
support review

Little's Law:

`L = λW`

Average number in system = arrival rate × average time in system.

MPC does not need to become a performance-testing system.

Use this as a **sanity model**.

If normal production logic implies large delayed queues, stale state may be expected.

If an alleged duplicate can be completely explained by two legitimate queued objects, the vulnerability hypothesis weakens.

Queue questions:

arrival identity  
queue identity  
deduplication key  
service discipline  
TTL  
retry behavior  
dead-letter path  
recovery path  
consumer ownership

---

# XX. NASH — UNILATERAL DEVIATION

Represent actors and strategies.

Ask:

Can one actor improve their economic/security outcome by changing only one permitted choice while everyone else follows the documented rules?

Possible choices:

channel  
payment method  
location  
role  
timing  
order  
configuration  
account  
currency

If yes:

either the product intentionally offers that strategy

or a business invariant may be broken.

Do not interpret “better payoff” alone as a security bug.

Find the violated security/business constraint.

---

# XXI. HARSANYI — INCOMPLETE INFORMATION

Different controllers know different things.

Browser knows one state.

Backend knows another.

Processor knows another.

Merchant knows another.

Attack assumptions often fail because we accidentally give every actor omniscience.

For every state decision record:

`ACTOR_INFORMATION_SET`

Ask:

What can this actor actually know at this point?

What information has not arrived yet?

What information may be stale?

What source could update that knowledge?

This is extremely strong for webhook/API/UI disagreement.

---

# XXII. SELTEN — SUBGAME / BACKWARD REASONING

Start at the claimed terminal outcome.

Move backward.

If the theory requires some intermediate actor to perform an action it would never rationally or legally perform once that state was reached, the path is weak.

For each terminal state:

refund complete

voucher issued

account credited

reservation confirmed

ask:

What prior state permits this?

What action creates that state?

What predicate permits the action?

Who owns the predicate?

Continue backward until reaching the user-controlled input.

---

# XXIII. HURWICZ / MASKIN / MYERSON — MECHANISM DESIGN

This is a major addition.

Business logic itself is often a **mechanism**.

Users have private information.

They send messages/actions to the mechanism.

The mechanism allocates:

money  
discounts  
inventory  
status  
priority  
rewards  
access

The crucial question is:

**Does the system incentivize truthful or intended behavior?**

Mechanism-design hooks:

incentive compatibility

strategic misreporting

private information

allocation rule

payment/reward rule

implementation

undesired alternate equilibria

revelation

Business-recon examples:

promo eligibility

referral programs

marketplaces

auctions

dynamic pricing

loyalty tiers

reputation

seller/buyer dispute systems

Do not call normal strategic optimization a vulnerability.

Look for cases where system rules allow an actor to obtain a security-sensitive allocation while violating the intended eligibility or authority constraint.

Recommended evaluator:

`mechanism_incentive`

---

# XXIV. HART / HOLMSTRÖM — CONTRACT THEORY

Many systems delegate actions.

Platform → merchant

merchant → employee

customer → agent

marketplace → seller

administrator → support

processor → platform

Contract theory asks how actions are controlled when incentives differ and not everything can be observed or specified in advance.

Transfer:

principal  
agent  
observable action  
hidden action  
reward  
penalty  
control right  
residual decision right

MPC question:

**Does technical permission accidentally grant a control right the business relationship does not grant?**

This strengthens:

permission vs ownership

delegation

support/admin functions

submerchant logic

reseller logic

marketplace settlement

partner integrations

---

# XXV. SALTZER & SCHROEDER — SECURITY DESIGN PRINCIPLES

Translate classic protection principles into business logic.

## COMPLETE MEDIATION

Every consequential access/action should be validated at the authoritative point.

Do not rely on an earlier page or earlier request having checked it.

Business hook:

Is the predicate re-evaluated at finalization?

## FAIL-SAFE DEFAULTS

Default should deny consequential state changes unless explicitly permitted.

## LEAST PRIVILEGE

Actor should receive no more business authority than required.

## ECONOMY OF MECHANISM

Complex duplicate paths create inconsistent enforcement.

## SEPARATION OF PRIVILEGE

High-impact consequences may require multiple independent predicates.

## LEAST COMMON MECHANISM

Shared state across unrelated principals creates cross-tenant risk.

These principles should be linked directly into MPC's existing authority and ownership branches.

---

# XXVI. ROSS ANDERSON — SECURITY ENGINEERING

Think about the complete socio-technical system.

Security failures often appear at boundaries between:

software

operators

payments

incentives

protocols

business rules

customers

administrators

Do not limit recon to HTTP mechanics.

Ask:

What does the business actually lose?

Who bears the cost?

Who receives the benefit?

What party has an incentive to push the system into this state?

What assumption does the designer make about rational behavior?

What happens during support intervention?

---

# XXVII. ADAM SHOSTACK — FOUR QUESTIONS

Before every substantial hook pass:

**What are we working on?**

**What can go wrong?**

**What are we going to do about it?**

**Did we do a good job?**

MPC translation:

OBJECT / WORKFLOW

FAILURE / ABUSE INVARIANT

FALSIFIER / CONTROL / REPAIR

COVERAGE / EVIDENCE / ADVERSE REVIEW

This should surround the entire recon process.

---

# XXVIII. NIST COMBINATORIAL TESTING

Business workflows quickly produce variable explosion.

Suppose we have:

3 roles  
4 channels  
5 states  
3 payment methods  
3 currencies  
4 versions

Exhaustive testing explodes.

Do not randomly sample.

Use combinatorial interaction testing.

Pairwise is useful but not automatically sufficient.

For important workflows use bounded t-way combinations.

Recommended MPC evaluator:

`tway_plan`

Inputs:

factors  
values  
constraints  
interaction strength  
forbidden combinations

Outputs:

small deterministic test matrix  
coverage report  
uncovered interactions

This belongs after the classifier pass.

It should reduce test volume, not generate automated traffic.

---

# XXIX. QUICKCHECK / PROPERTY-BASED TESTING

Traditional test:

“For payment X, refund 100 should return Y.”

Property:

“For every valid captured payment, cumulative completed refunds must never exceed refundable captured value.”

Properties generalize.

Useful properties:

idempotence

monotonicity

conservation

commutativity where expected

non-commutativity where required

ownership preservation

round-trip

reversibility

uniqueness

bounds

eventual convergence

Recommended method:

`property_probe`

MPC can generate candidate boundary specimens.

Actual target execution remains separately authorized and controlled.

---

# XXX. METAMORPHIC TESTING

Sometimes you do not know the exact correct output.

But you know how output should relate when input changes.

Example:

Base transaction = X.

Change only presentation language.

Money outcome should remain invariant.

Change only API transport.

Authority should remain invariant.

Change only harmless metadata.

Economic allocation should remain invariant.

Change quantity from 1 to 2.

Total should transform according to known rule.

This is exactly what our 31/32 technique wants.

Recommended evaluator:

`metamorphic_relation`

Fields:

baseline input

transformation

expected relation

baseline output

variant output

result:

PRESERVED  
VIOLATED  
UNKNOWN

This should become one of MPC's highest-value methods.

---

# XXXI. CMU MODEL-BASED VERIFICATION

Create an abstract state-machine model containing only variables necessary for the property under investigation.

Do not model UI cosmetics if testing refund authority.

Do not model inventory if testing identity unless inventory affects identity.

Good abstraction hides irrelevant complexity.

Model checker logic:

MODEL + PROPERTY → PASS or COUNTEREXAMPLE

MPC should think the same way even when no full formal solver is used.

---

# XXXII. NASA FTA — TOP EVENT BACKWARD

Define the undesired top event exactly.

Bad:

“payment bug”

Good:

“A merchant receives economic value twice from one authorized source event.”

Then move backward using AND/OR causes.

Example:

DOUBLE VALUE

requires:

duplicate finalizer

OR

two independent value paths

Each may require:

same source identity not canonicalized

AND

idempotency guard absent

Continue until reaching observable leaves.

Recommended improvement:

current MPC FTA should compute **minimal cut sets**.

This tells us the smallest combination of conditions sufficient for the top event.

---

# XXXIII. NASA FMEA — FAILURE FORWARD

For each component or interface ask:

What if this is:

missing

duplicated

stale

wrong

late

early

misowned

misversioned

partially completed

Then trace the effect forward.

Do not treat RPN as probability.

Use it as ordering assistance only.

---

# XXXIV. CIA / ACH

Never fall in love with the first explanation.

For an anomaly create hypotheses:

H1 real business-rule defect

H2 different underlying object

H3 asynchronous convergence

H4 cache/UI artifact

H5 intentional segmentation

H6 version difference

H7 test-environment artifact

H8 misunderstanding of source language

Evaluate evidence against all hypotheses.

The best evidence is **diagnostic evidence**:

evidence that separates hypotheses.

MPC improvement:

Do not merely count SUPPORTS/CONTRADICTS.

Rank evidence by diagnosticity.

A fact supporting all hypotheses provides little discrimination.

A fact contradicting seven and preserving one is high-value.

---

# XXXV. PROCESS THE USER DOES NOT CONTROL

Never assume all important state is user-controllable.

Important external actors may include:

payment processor

reservation provider

merchant

bank

scheduler

background worker

fraud engine

email system

support operator

affiliate system

inventory provider

The absence of access to that actor does not justify inventing its behavior.

Mark:

UNKNOWN CONTROLLER

and create an evidence target.

---

# XXXVI. HIGH-VALUE BUSINESS-LOGIC HOOK FAMILIES

Continuously hunt these families:

identity aliasing

parent/child mismatch

permission/ownership confusion

actor/capacity confusion

wrong finalizer

duplicate finalizer

stale state used as authority

cross-channel inconsistency

cross-version inconsistency

legacy-path coexistence

idempotency namespace mismatch

retry/replay disagreement

partial failure followed by finalization

rollback that does not restore invariant

double compensation

orphaned state

queue state surviving reset

TTL boundary behavior

hidden accumulator ownership

wrong recipient

wrong payer

wrong currency

wrong unit

fee/principal mismatch

refund allocation mismatch

reward attribution mismatch

eligibility state mismatch

inventory/entitlement divergence

display/finality mismatch

browser-return/server-state mismatch

webhook/API mismatch

support override mismatch

parameter authority mismatch

client-calculated predicate trusted by server

workflow step omission

workflow step repetition

illegal state transition

multiple apparent terminal states

one object represented under multiple identifiers

multiple objects collapsed into one identifier

scope crossing

tenant crossing

role crossing

account crossing

version crossing

time-window crossing

---

# XXXVII. THE SAGA / COMPENSATION METHOD

Distributed business transactions often cannot be rolled back atomically.

Instead they perform compensating actions.

Example conceptual saga:

reserve inventory

charge payment

issue entitlement

notify merchant

If entitlement issuance fails:

refund payment

release inventory

Potential bug class:

the forward action commits but compensation does not

or:

compensation happens twice

or:

compensation targets the wrong parent object

or:

new forward action occurs after compensation based on stale state

Add method:

`saga_trace`

Represent:

forward action

compensating action

owner

precondition

idempotency key

completion state

This is particularly strong for commerce, reservations, marketplaces, payouts, refunds, and subscriptions.

---

# XXXVIII. STATE OWNERSHIP GRAPH

Current pairwise identity comparison should eventually become a graph.

Node:

object/state representation.

Edge:

DERIVES_FROM

WRAPS

PARENT_OF

CHILD_OF

MIRRORS

FINALIZED_BY

REPORTED_BY

OWNS

REVERSES

SUPERSEDES

Example:

Session

PARENT_OF → Payment

Payment

EMITS → Webhook Event

Payment

MIRRORED_BY → Dashboard Row

Payment

REVERSED_BY → Refund

Then ask:

Which node owns finality?

Where does identity change?

Where can stale edges persist?

Recommended evaluator:

`identity_graph`

---

# XXXIX. AUTHORITY GRAPH

Different from identity.

Map:

actor → capacity → permission → action → target object → finalizer

Questions:

Who may request?

Who may approve?

Who may execute?

Who may finalize?

Who may override?

Who bears loss?

Who receives value?

Add evaluator:

`authority_graph`

Reject any theory that silently transforms:

“can call endpoint”

into:

“owns object”

or:

“is authorized to finalize consequence.”

---

# XL. MULTI-LEDGER ACCOUNTING

For money/value systems represent independent ledgers.

Example:

CUSTOMER -100

PROCESSOR +100

PROCESSOR -3 fee

MERCHANT +97

Refund:

MERCHANT -97

PROCESSOR -3 fee reversal?

CUSTOMER +100

The exact numbers depend on the system.

The method does not.

Require every unit of value to have:

source

destination

unit

event

owner

time

state

Never infer unseen ledger entries.

Flag unexplained residuals.

---

# XLI. INFORMATION-FLOW METHOD

For every important datum trace:

creator

reader

modifier

consumer

finalizer

recipient

Useful fields:

price

currency

merchant ID

campaign ID

payment ID

account ID

refund amount

role

eligibility flag

discount

recipient

Question:

Where does data change from:

descriptive

to authoritative?

That transformation boundary is a major hook.

---

# XLII. CANONICALIZATION METHOD

Many bugs occur because two systems canonicalize differently.

Examples:

uppercase/lowercase

locale

currency representation

URL form

phone/email normalization

account alias

merchant alias

campaign/deal alias

version

identifier prefix

Ask:

What function maps many representations into one canonical object?

Does every controller use the same mapping?

---

# XLIII. BOUNDARY-VALUE RECON

Every documented limit creates two valuable controls:

just inside

just outside

Examples:

expiry

minimum amount

maximum amount

quantity limit

refund window

reservation date

reward threshold

role transition

Do not automatically hammer boundaries.

One authorized control on each side is often more informative than hundreds of random requests.

---

# XLIV. NEGATIVE-SPACE RECON

Documentation says what should happen.

Also ask what it never discusses.

Examples:

What happens after a partial failure?

What happens when callback never arrives?

What happens when two parent objects reference the same child?

What happens after configuration changes mid-workflow?

What happens after account ownership changes?

Unknown space becomes an evidence target, not an assumed vulnerability.

---

# XLV. RECON FRONTIER OPTIMIZER

MPC currently has enough classifiers.

It needs better reduction.

Every unresolved candidate should receive:

`IMPACT_POTENTIAL`

`SOURCE_STRENGTH`

`DIAGNOSTICITY`

`REPRODUCIBILITY`

`SCOPE_FIT`

`DEPENDENCY_COUNT`

`PROOF_COST`

`FALSIFICATION_COST`

Prefer next actions with:

high diagnosticity

high impact relevance

strong source ownership

low cost

low risk

few dependencies

The ideal next step is frequently the specimen that can **kill the most hypotheses**, not the one that appears most likely to prove the bug.

---

# XLVI. RECOMMENDED NEW MPC COMPUTATIONAL METHODS

Do not create a new top-level MCP tool for every method.

Extend `evaluate_method`.

Recommended method IDs:

`partial_order`

`transaction_history`

`temporal_property`

`relational_counterexample`

`process_conformance`

`token_flow`

`multi_ledger`

`queue_threshold`

`metamorphic_relation`

`tway_plan`

`property_probe`

`identity_graph`

`authority_graph`

`saga_trace`

`diagnosticity`

`frontier_rank`

These should remain:

bounded

deterministic where practical

read-only

supplied-model based

non-promoting

non-target-interacting

---

# XLVII. WHAT EACH NEW METHOD SHOULD RETURN

Every evaluator should return a common envelope:

`METHOD`

`INPUT_FINGERPRINT`

`MODEL_SCOPE`

`RESULT_STATE`

`FIRST_DIVERGENCE`

`INVARIANT`

`COUNTEREXAMPLE`

`SUPPORTING_SOURCE_REFS`

`CONTRARY_SOURCE_REFS`

`UNKNOWN_DEPENDENCIES`

`FALSIFIER`

`NEXT_EVIDENCE_TARGET`

`MAXVAR_PARENTS`

`BUSINESS_LOGIC_CLASSIFIERS`

`CANONICAL_PROMOTION=false`

This common envelope makes methods composable.

---

# XLVIII. METHOD AGREEMENT IS NOT CORROBORATION

If:

STPA

Alloy

FTA

and Nash

all flag the same user-supplied fact, that is still **one fact analyzed four ways**.

Do not say:

“four methods confirmed the vulnerability.”

Say:

“four independent analytical lenses identify the same unresolved invariant.”

Corroboration requires independent evidence.

---

# XLIX. PASSIVE-FIRST BUSINESS-LOGIC RECON

Before touching a target actively, collect:

scope/rules

documentation

terms

help articles

API references

SDK definitions

schemas

public JavaScript

app metadata

saved normal workflows

identifier structures

historical versions where relevant

public complaints as leads

Then produce the workflow model.

Often 80% of weak hypotheses can be killed before testing.

---

# L. ORDINARY BASELINE BEFORE VARIATION

Never test the weird case first.

Capture one normal authorized transaction.

Pin:

actor

account

role

object IDs

parent IDs

amount

currency

state

timestamps

channel

version

result

feedback

finalizer

That becomes CONTROL-0.

Every later comparison should state exactly what changed from CONTROL-0.

---

# LI. THE ONE-VARIABLE RULE

For strong business-logic evidence:

change one thing.

If five variables changed and the result changed, the causal explanation is weak.

Good comparison:

same actor

same object

same amount

same state

same version

only channel changes

Then:

outcome changes.

That is valuable.

---

# LII. EVIDENCE PACKET

For every promoted candidate preserve:

exact source ID

exact version

native object ID

actor/capacity

timestamp

request/event identity

state before

state after

expected invariant

observed divergence

first divergence

economic/security consequence

falsifier

contrary evidence

program-rule citation

Never rely on screenshots alone when native structured records exist.

Screenshots can corroborate presentation.

They rarely prove backend finality by themselves.

---

# LIII. BUSINESS LOSS IS NOT AUTOMATICALLY SECURITY IMPACT

A discount difference may be intentional.

A pricing difference may be segmentation.

A stale display may have no consequence.

A duplicated UI row may correspond to one accounting object.

A bug-bounty candidate needs the program's accepted security-impact bridge.

Keep separate:

PRODUCT DEFECT

BUSINESS LOSS

SECURITY CONTROL FAILURE

BOUNTY-QUALIFYING IMPACT

---

# LIV. GOLD CANDIDATE GATE

Promote only if:

1. exact business object is identified;
2. current program scope permits the research;
3. expected invariant is source-owned;
4. baseline exists;
5. one-variable comparison is available where appropriate;
6. first divergence is identified;
7. native evidence supports the observed state;
8. authoritative finalizer is identified or explicitly unresolved;
9. strongest benign explanation has been tested;
10. contrary evidence does not destroy the chain;
11. real security consequence exists;
12. reproduction is bounded and safe.

Otherwise:

WATCH

OPEN

or

KILLED.

---

# LV. REPORT FORMAT

A good report should read like a machine-verifiable story.

## TITLE

Actor + broken invariant + consequence.

## ENVIRONMENT

Asset

Role

Account type

Version

Relevant configuration

## PRECONDITIONS

State required before reproduction.

## BUSINESS INVARIANT

One sentence.

## BASELINE

Normal expected workflow.

## VARIATION

Exactly what changed.

## REPRODUCTION

Minimal ordered steps.

## FIRST DIVERGENCE

The earliest point expected and observed behavior separate.

## EXPECTED

Source-owned result.

## OBSERVED

Native result.

## IMPACT

Concrete security consequence.

Avoid “could maybe.”

## EVIDENCE

IDs

timestamps

state records

requests/responses where permitted

screenshots/supporting files

## FALSIFIERS TESTED

State the strongest benign alternatives checked.

## REMEDIATION

Repair the invariant, not merely the visible symptom.

---

# LVI. HIGH-SIGNAL BOOK / PROFESSOR / METHOD SHELF

These are method sources, not authorities about any target.

### Nancy Leveson

Read:

*Engineering a Safer World*

STPA Handbook

Transfer:

controllers, feedback, unsafe control actions, process-model mismatch, systemic causation.

### Daniel Jackson

Read:

*Software Abstractions*

*Essence of Software*

Transfer:

relations, concepts, invariants, smallest counterexamples, identity structure.

### Leslie Lamport

Read:

*Specifying Systems*

“Time, Clocks, and the Ordering of Events in a Distributed System”

“The Temporal Logic of Actions”

Transfer:

partial orders, safety/liveness, invariants, next-state relations, distributed causality.

### Maurice Herlihy & Jeannette Wing

Read:

“Linearizability: A Correctness Condition for Concurrent Objects”

Transfer:

legal concurrent histories and atomic effect.

### Wil van der Aalst

Read:

*Process Mining: Data Science in Action*

Transfer:

process discovery, event-log conformance, Petri nets, workflow alignment.

### John Sterman

Read:

*Business Dynamics*

Transfer:

stocks, flows, accumulation, delay, feedback, conservation.

### John D. C. Little

Read:

Little's Law literature.

Transfer:

queue sanity, pending state, processing delay.

### Leonid Hurwicz / Eric Maskin / Roger Myerson

Read:

mechanism design foundations.

Transfer:

incentive compatibility, private information, allocation mechanisms, undesirable equilibria.

### Oliver Hart / Bengt Holmström

Read:

contract-theory background.

Transfer:

principal-agent relationships, hidden actions, control rights, incomplete contracts, delegation.

### Jerome Saltzer / Michael Schroeder

Read:

“The Protection of Information in Computer Systems”

Transfer:

complete mediation, least privilege, fail-safe defaults, separation of privilege, economy of mechanism.

### Ross Anderson

Read:

*Security Engineering*

Transfer:

whole-system security, incentives, banking/payment systems, protocol failures, operational reality.

### Adam Shostack

Read:

*Threat Modeling: Designing for Security*

and Four Question Framework materials.

Transfer:

structured threat enumeration and review.

### Koen Claessen / John Hughes

Read:

QuickCheck paper.

Transfer:

properties, generated examples, counterexample shrinking.

### Tsong Yueh Chen and metamorphic-testing literature

Transfer:

testing when the correct individual output is unknown but relationships between outputs are known.

### David Kuhn / Raghu Kacker / Yu Lei / NIST ACTS

Read:

NIST SP 800-142 and ACTS materials.

Transfer:

pairwise/t-way interaction coverage and compact constrained test design.

### Garcia-Molina / Salem

Read:

“Sagas.”

Transfer:

long-running transactions and compensating actions.

### Baier / Katoen

Read:

*Principles of Model Checking*

Transfer:

state-transition systems, temporal properties, counterexamples.

---

# LVII. FAST 60-SECOND HOOK PASS

When a new workflow appears, answer:

What is the business object?

What identifier owns it?

What parent owns that identifier?

Who is the actor?

What capacity?

Who can request the action?

Who can finalize it?

What is the state before?

What is the state after?

What exact predicate authorizes the transition?

What value moves?

Who pays?

Who benefits?

What channel carries the request?

What channel reports the result?

Are those the same authority?

Is the process synchronous or asynchronous?

What happens on retry?

What happens on reversal?

What happens after expiry?

What one-variable comparator exists?

What is the first divergence?

What is the strongest benign explanation?

What record would falsify the hypothesis?

If those questions cannot be answered, research the missing node before testing.

---

# LVIII. DEEP HOOK PASS

For a promising candidate run these families:

IDENTITY

AUTHORITY

STATE

TIME

VALUE

QUEUE

VERSION

CHANNEL

REVERSAL

INCENTIVE

CONSERVATION

CONFORMANCE

COUNTEREXAMPLE

FALSIFIER

For each family produce one unresolved question.

Then rank those questions by diagnosticity.

Do not produce 384 equivalent questions.

---

# LIX. DON'T LET MPC BLOAT

Do not add a classifier because a concept has a cool name.

Add a classifier only when it asks a materially different question.

Do not add a tool when `evaluate_method` can expose another method.

Do not copy full books or papers into MPC.

Persist:

method name

source locator

transfer primitive

limitations

operational question

Do not renumber MAXVAR.

Keep child registries fingerprinted and versioned.

Keep theoretical methods separate from target evidence.

---

# LX. RECOMMENDED MPC ARCHITECTURE

Layer 1:

MAXVAR 1–256 canonical dimensions.

Layer 2:

NESTMAX and specialized classifier packs.

Layer 3:

business-logic branches/classifiers.

Layer 4:

research/method registry.

Layer 5:

computational evaluators.

Layer 6:

evidence packet and provenance.

Layer 7:

counterexample/falsifier reduction.

Layer 8:

human-readable recon output.

Layer 9:

external storage/checkpointing.

Do not mix these responsibilities.

---

# LXI. CURRENT RECON OUTPUT CONTRACT

A normal MPC business-logic answer should emphasize:

OBSERVED RECORD

SOURCE OWNER

OBJECT / IDENTIFIER

ACTOR / CAPACITY

EXPECTED INVARIANT

FIRST DIVERGENCE

APPLICABLE CLASSIFIERS

WHAT THE RECORD SUPPORTS

WHAT REMAINS INFERRED

STRONGEST BENIGN EXPLANATION

FALSIFIER

MISSING EVIDENCE

NEXT SMALLEST ACTION

STOP CONDITION

Do not dump entire registries unless explicitly requested.

---

# LXII. STOP CONDITIONS

Stop a branch when:

documented rule fully explains it

objects are proven non-equivalent

no security consequence survives

program excludes the issue

required evidence is unavailable

test would exceed authorization

native finalizer rejects the variation

counterexample defeats the theory

Do not continue merely because considerable work has already been invested.

---

# LXIII. CORE FORMULA

A useful business-logic candidate can be thought of as:

`CANDIDATE = INVARIANT + CONTROLLED_VARIATION + FIRST_DIVERGENCE + AUTHORITY + CONSEQUENCE - BENIGN_EXPLANATIONS`

A strong research step is:

`NEXT_ACTION ≈ MAX(DIAGNOSTICITY × IMPACT × SOURCE_STRENGTH) / MIN(COST × RISK × DEPENDENCIES)`

These are prioritization heuristics, not probabilities.

---

# LXIV. FINAL OPERATING PRINCIPLE

The strongest business-logic bug is usually not:

“the server accepted a weird request.”

It is:

**two components each behaved plausibly while their shared business invariant failed.**

Therefore always search the seams:

between identifiers

between actors

between authorities

between state machines

between channels

between versions

between ledgers

between time windows

between forward and reverse paths

between the visible result and the authoritative consequence

between what one controller knows and what another controller knows

between what the business promises and what the machine actually finalizes.

That is where MPC should hook.