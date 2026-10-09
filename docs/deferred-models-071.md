# Accumulator, deferred inventory, meter and finality models

Use `get_method_catalog` with method `claw_accumulator`, `coin_pusher_deferred`, or `casino_meter_finality` for the exact schema; invoke with `evaluate_method` and the same method ID plus input.

These are bounded bookkeeping analogies over supplied records, not specifications of any real gambling machine. Amounts are nonnegative integer units (use cents for money), with at most 64 events or records. They share existing authentication, request limits, fingerprinting and read-only behavior.

- Claw accumulator: accrual, explicit reset and recorded award remain independent. A supplied threshold does not prove payout entitlement. Award units use the declared unit and do not silently consume accumulator units.
- Coin pusher: opening pending inventory + deposits - releases - removals. Release is not payment and is not attributed to the latest depositor. Negative inventory is rejected.
- Casino meter: preserve meter, finalized and paid amounts with separate reference fields. Differences and overpayment observations are retained; numeric equality cannot prove finality. References are caller supplied and not authenticated.

Cross-reference these outputs with `conservation`, `state_trace`, `identity`, `compare_operative_states`, and `prepare_research_backup`. Use `get_research_registry` for existing Google Drive source pointers and deeper classifier definitions; this addition does not alter canonical MAXVAR definitions or assert a new source-backed classifier mapping.
