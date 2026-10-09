# 0.6.0-http.1 methods and hierarchy receipt

Recovered source: mpc-hosted-upgrade-draft.zip (Library libfile_81969947bbd48191872d64f1f98e1923). The draft's Python source was parsed as data to recover all 32 branch method mappings. Source digest is retained in lib/method-overlay.json.

Important identity conflict: the draft uses the same BL child IDs and pack ID as the 0.4.6 source but changes labels, parent lists, questions and ranking. It is preserved as a separate named draft overlay, not silently substituted for the pinned 0.4.6 registry. business_logic_sweep returns the overlay and explicitly reports that model evaluation is a separate step requiring supplied inputs.

Hierarchy exposed:
- MAXVAR: existing 256 definitions and original pins unchanged.
- NESTMAX: loaded program/IID eight-branch domain pack, 174 enumerated definitions. Legacy descriptor 160 remains recorded as a discrepancy. Parent mappings retain original literal text; the referenced parent document was not newly read, and no claim of recovering the whole NESTMAX corpus is made.
- Business logic: existing 32 branches × 12 lenses = 384 definitions unchanged.
- Draft overlay: all original Nash, Harsanyi, Selten, STPA, Alloy, NASA, FTA/FMEA, Sterman, recipe-math, claw, coin-pusher, casino, Johnny5, Susan, CIA-ACH, Kryptonite method attributions and proposed parent pointers preserved separately.

New tools:
- get_method_catalog: implementation levels, scope/limits, all draft branch mappings; one method selector yields its exact input schema.
- evaluate_method: strict selected-model validation, bounded deterministic evaluation, model fingerprint and explicit no-promotion flags.
- get_nestmax_registry: catalog, exact ID lookup (max 24), or branch child-ID index.

Ten evaluators:
1. Nash: all pure equilibria for two-player payoff matrices up to 8×8; one strictly interior mixed equilibrium for nondegenerate 2×2 games. Not a general mixed-equilibrium solver.
2. Harsanyi-related: expected utility for up to 16 supplied states/actions. Probabilities must sum to one. No Bayesian equilibrium or belief inference.
3. Selten-related: backward induction on up to 63 nodes in a perfect-information two-player tree; one selection, deterministic first-listed tie breaking. Not a full refinement solver.
4. Conservation: single declared unit, opening + inflows − outflows, residual and caller tolerance. No hidden-state inference.
5. Identity: namespace/native ID/owner/version/label comparisons. No alias inference or native authentication.
6. State trace: supplied deterministic transitions and up to 64 recorded events; first-divergence result. Not Alloy/SAT model checking or full STPA hazard analysis.
7. Fault tree: bounded acyclic AND/OR graph with unknown leaf support; no probability inference.
8. FMEA: supplied S/O/D ratings multiplied into RPN; RPN is not probability or authenticated risk.
9. ACH: supplied evidence judgments counted per hypothesis with contradictory source references; not truth scoring.
10. Coverage: caller-reported subset review states bound to supplied input/pack fingerprints; references required for reviewed/resolved states. Not authenticated proof, full-pack completeness or persistence.

All tools operate on finite supplied models/records; no target requests, autonomous testing, exploit planning, or submission. The qualitative overlays do not authorize external actions.

Validation: complete 81-test suite passed, then a 15-test methods suite passed including a newly added authenticated MCP evaluation test (82 unique passing tests overall). Includes known Nash examples, degenerate/tied controls, explicit-probability calculations, off-path tree choices, cycle/shared/unreachable rejection, residuals, identity presentation differences, trace divergence, three-valued fault logic, FMEA/ACH, coverage fingerprints, full overlay name preservation, NESTMAX scope, strict bounds and authentication. Prior stalled-request/overload recovery checks remain passing.

Existing limits retained: 2 MB input, 1 MB response, 5-second body-arrival deadline, 8 in-flight requests per isolate, 60 tool calls per user/minute/isolate, no automatic retries. Each model is deliberately bounded; no claim against upstream outages or globally distributed resource exhaustion.

Conceptual references for formal game distinctions (not endorsements of this implementation):
- MIT OCW Game Theory 14.126 lecture notes: https://ocw.mit.edu/courses/14-126-game-theory-spring-2016/pages/lecture-notes/
- MIT OCW Game Theory for Strategic Advantage lecture notes: https://www.ocw.mit.edu/courses/15-025-game-theory-for-strategic-advantage-spring-2015/pages/lecture-notes/
