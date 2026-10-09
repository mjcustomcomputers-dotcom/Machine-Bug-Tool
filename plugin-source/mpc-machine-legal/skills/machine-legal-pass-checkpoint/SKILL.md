---
name: machine-legal-pass-checkpoint
description: Continue large Machine Legal / Research OS jobs in bounded passes with exact-resume checkpoints. Use when the user says next pass, continue, resume, checkpoint, pick up where we left off, move to a new chat, or when the current thread/tool volume is becoming large. Prevent re-searching and maintenance churn across chat boundaries.
metadata:
  priority: 10
  promptSignals:
    phrases:
      - "next pass"
      - "continue"
      - "resume"
      - "checkpoint"
      - "pick up where we left off"
      - "new chat"
      - "keep going"
---

# Machine Legal — Pass / Checkpoint Continuation

## Prime rule
`PROGRESS > RECONSTRUCTION.` A chat boundary is not a research boundary. Finish one bounded pass, persist a compact continuation receipt, and resume from that receipt without replaying completed retrieval or analysis.

## Pass size
Default to 1–3 objects, record events, source slices, propositions, or one tightly bounded research issue per pass. A pass may include multiple tool calls, but each call must support the same bounded objective.

Complete a bounded pass, save its frontier, and continue the next authorized action while the task remains active and the necessary tools are available. Use the checkpoint to preserve progress across interruptions. Surface a specific missing user decision only when it materially governs the next action.

## Start of a pass
1. Recover the newest valid checkpoint/frontier.
2. Verify only the controlling pointer or source that could have changed since that checkpoint.
3. Reuse already-pinned source IDs, hashes, citations, thread IDs, file IDs, and conclusions in their preserved states.
4. Do not re-run broad search merely because a new chat began.
5. State the exact pass objective internally before retrieving anything.

## During a pass
- Keep the substantive task primary.
- Work from known sources before discovery.
- When a defect appears, classify it. Repair only if it blocks the pass.
- If a non-blocking source/tool issue appears, mark it OPEN/QUARANTINED and continue.
- Do not spend the remainder of the pass proving why a tool failed if the user's research can proceed another valid way.
- If the user interrupts with a correction, update the live pass state and continue from the corrected point; do not discard already valid work.

## Checkpoint contents
A continuation checkpoint is deliberately compact. Preserve:

`CHECKPOINT_ID` — stable pass receipt.
`TASK` — one-sentence overall objective.
`FRONTIER` — controlling root/work-unit/project pointer.
`PINNED_SOURCES` — exact IDs/locators already resolved; no source bodies.
`COMPLETED_THIS_PASS` — acquired records, extracted facts, completed analysis, and verified claims, each labelled with its actual stage.
`WORK_PHASE` — EVIDENCE_ACQUISITION, ANALYSIS, VERIFICATION, or explicitly requested ARCHITECTURE.
`ACQUISITION_FRONTIER` — the next fact, record/owner/locator, and read or discovery action.
`OPEN` — unresolved dependencies/questions.
`BLOCKED_OR_QUARANTINED` — defects or propositions that cannot currently advance.
`CHANGED_STATE` — only state transitions that occurred.
`NEXT_ACTION` — one exact bounded action for the next pass.
`DO_NOT_REPEAT` — completed retrieval/search/repair that the next chat must not redo.

Do not duplicate full opinions, transcripts, spreadsheets, or long analysis in the checkpoint. Point to them.

## User-visible close
When the full task remains incomplete, end the pass with a compact status equivalent to:

`Checkpoint <ID> updated. This pass completed <delta>. The full job is not complete. Remaining: <open node>. Next pass: <exact next action>.`

Do not say the job is finished merely because a pass finished.

## Next-pass command semantics
When the user says `next pass`, `continue`, or equivalent:
- treat it as approval to execute `NEXT_ACTION` from the latest valid checkpoint;
- do not ask the user to restate facts already in the checkpoint/source system;
- do not restart discovery;
- verify changed dependencies only;
- produce the next checkpoint at the end.

If the latest checkpoint is missing or contradictory, recover the smallest authoritative state needed to resolve the contradiction. Do not rebuild the entire project.

## Chat rollover
If the thread is becoming long, retrieval-heavy, or dominated by repair chatter, checkpoint before further expansion. The checkpoint must be sufficient for a fresh chat to continue with no more than a small controlling-state read plus the next bounded action.

The goal is not zero context; it is zero unnecessary reconstruction.
