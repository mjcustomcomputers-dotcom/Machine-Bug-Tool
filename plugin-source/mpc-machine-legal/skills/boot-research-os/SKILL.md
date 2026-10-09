---
name: boot-research-os
description: Recover and resume the live Machine Legal / Research OS state for the current project without restarting completed work. Use when the user says boot, refresh, resume, continue, recover, next pass, or equivalent.
metadata:
  priority: 10
  promptSignals:
    phrases:
      - "boot machine legal"
      - "boot research os"
      - "refresh machine legal"
      - "resume current frontier"
      - "recover current cursor"
      - "continue from checkpoint"
---

# Boot Research OS

Recover the smallest current state needed to perform the user's next action. Use the core index skill's operational phases: acquire the missing record, analyze acquired material, or verify a defined claim. A current receipt already obtained in this session supports continuation; refresh the particular dependency when it changes. Acquisition of an identified source can proceed while an unrelated project field remains unresolved.

A boot claim is a factual assertion about current durable state and therefore requires a receipt.

## Mandatory boot receipt gate
Do not say Machine Legal is "booted," "loaded," "recovered," or "resumed from live canonical state" unless the following fields have been resolved from connected current sources or explicitly marked UNRESOLVED:

- project / matter identity;
- current mission or cut node;
- canonical controller / registry object and source locator;
- current cursor / frontier and source locator;
- last committed checkpoint / exact-resume capsule and source locator;
- authoritative artifact pointer(s) needed for the active node;
- retrieval cutpoint (when the current source was checked).

The receipt may stay compact in ordinary answers, but the model must internally preserve every field. If the user asks to prove the boot, surface the receipt directly.

## Recovery sequence
1. Resolve the current project and live mission/cut node.
2. Query structured operating state first (for example Airtable) when it is the canonical controller.
3. Resolve the corresponding authoritative Drive/control objects and current durable artifacts.
4. Read the latest committed checkpoint / exact-resume capsule.
5. Cross-check native evidence sources needed for the active node (for example Gmail, docket, agency record).
6. Hydrate only dependencies needed for the next atomic action.
7. Compare recovered current state with cached/chat state and reject stale regressions.
8. Continue only the unfinished delta.
9. Persist completed acquisitions, extracted facts, analytical results, and verification results in their actual stages when write authorization exists. Record the next source/action and the source version that supports progress.

## Fail-closed rules
- Memory, conversation summaries, filenames, timestamps, and "newer-looking" child documents are locators, not canonical proof.
- If a required boot field cannot be resolved, mark that field UNRESOLVED. Do not infer it from surrounding material.
- If canonical sources disagree, preserve each state, identify the conflict, mark the affected branch BLOCKED/READ-ONLY, and stop promotion until the conflict is resolved.
- A successful Gmail search can prove a native email event; it does not by itself prove the project cursor or canonical controller state.
- Do not call a run "complete" while a higher-level Pro/Work task is still producing output or while an identified dependency is pending.

## Compact boot-receipt form
`PROJECT | CONTROLLER(locator,status) | CURSOR(locator,status) | CHECKPOINT(locator,status) | ACTIVE ARTIFACT(locator,status) | CUTPOINT | NEXT ATOMIC NODE`

Keep setup chatter out of the user-facing answer unless a blocker matters. The proof may be terse; the provenance may not be omitted.
