# Negative checkpoint — progressive LP fix/relax

Native code source: `f0d2ad799952b6a552a2650cbbdf8c48500616e3`.
Focused GitHub Actions: https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/actions/runs/38109592687 — SUCCESS, four original truth unit tests and three paired larger synthetic runs.
Implementation: `frontieror/solvers/hoffman1993/solve.py` `lp_neighborhood` exploratory flag.
Frozen accepted cycle source `05df8ff9c10b898d7c1832217f504e9c53c91089` remains unchanged.

Same-source fixed-neighborhood experiment, no official organizer score:
- 240 rows/20 sides seed7: plain CP 6.72152s original-verified objective498; guided repair 9.92034s no incumbent. Narrow free counts20,40 provably infeasible under fixed LP guesses; free60 returned UNKNOWN before 2.4s limit.
- 240 rows/20 sides seed31: plain 3.9164s, objective619; repair 8.79977s objective619 with no repaired witness, falling back to original CP.
- 480 rows/25 sides seed17: plain 29.93319s no incumbent; guided repair 29.92158s no incumbent. Free25/fixed96 and free50/fixed71 returned proved infeasible for temporary assumptions; free75/fixed46 exhausted its short budget without a solution. Two LP variants tested. Nothing here proves the original Crew problem infeasible.

**Falsifier:** fixed LP-integer guesses can be inconsistent with exact integer sides; blindly opening all guesses by size is insufficient and wastes the solver budget. Next isolated research experiment: CP-SAT assumption cores to identify which guessed variables cause contradiction and unfix those specifically, then run unfixed original model with remaining time.

Original-model independent verifier remains final; all previous sources/ZIPs are retained. No submission or score improvement asserted.
