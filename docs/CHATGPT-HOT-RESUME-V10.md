# MPC ChatGPT Hot Resume V10 — additive exact-controller source bridge

**STATUS:** Development only. Stacked on V9 PR #7. Separate from existing feature/connector-native-authority-falsifier-v10. **Not merged, deployed, or an autonomous connector broker.**

## Change and source boundary

V10 adds lib/chatgpt-hot-resume-v10.mjs without modifying MAXVAR, NESTMAX, BL, MBSS, EXT, Method Atlas, the deployed private MPC Site, or program research records.

- **planHotResume:** accept a freshly retrieved native Airtable controller and a pinned typed identity; reject absent/mismatched/incomplete controllers. Always use the live checkpoint ID and exact next_action, never a stale Drive/Dash projection or the global machine-state snapshot. Controller data is caller-supplied, not independently authenticated: the caller/host must actually read the record.
- **planVersionCache:** reconcile caller-supplied native source metadata using the existing V9 bridge; a native revision AND SHA-256 must both exactly match a prior cache entry before skipping the unchanged source body. Version mismatch, digest mismatch, missing digest, direct-source conflict, or a Dash-only projection forces revalidation or a block. Revision sorting is not a canonicity rule. Any returned cache update is a proposal; nothing is stored.
- **planModeDispatch:** defaults to TEST; in TEST ALL consequential actions are blocked, even when connector capability and user approval are declared. RECON can propose a private checkpoint only with recorded approval + a supported native conditional revision guard; it cannot update code or test targets. COMMIT can propose code/checkpoint actions only after current connector capability, user approval and native conditional-version protection, or target tests only with separate exact program scope. All modes remain pure planners. Host actions require separate registered tools, actual authorization, and readback.

connector-bridge/hot-resume-pointers.v10.json pins:
- KOMOJU Airtable appdD5WC0CVuRirtP / tblC9KnJuUvwxbikS / rech8Afm8n1P1qgMD as a TARGET_CONTROL locator. The historical observed DELTA-044 is NOT a claim that this is still current.
- Social Deal appZPanYDOUZRinwr / tblKHFcWGkk4v4LxX / reckbawZxBahBiddZ as a GC002 CANDIDATE_BRANCH locator, NOT a global Social Deal project controller. Verify the current native record before any action.
- Older Google Drive checkpoints remain history/source artifacts; Dropbox Dash indexed Drive results count as one underlying native source, not independent corroboration.

## Host usage in ChatGPT

1. Start in TEST. Read the manifest for exact IDs only, then use the currently connected Airtable app to read that exact controller. For KOMOJU, read Checkpoint ID, Current Cursor, Next Action from live Airtable. For Social Deal, first verify GC002 belongs to the requested candidate branch. Do not silently substitute a whole-project controller.
2. Construct expected_controller from the manifest and live_controller from that same native ID, adding checkpoint_id, cursor, next_action, and the actual observation time. Do not pass generic search snippets, a Dash UUID, cached JSON, or a synthetic result as a live controller.
3. Optionally supply 1–3 selected direct native source_records using V9's record schema and cache_entries with native_key, version, digest, observed_at. Only a verified direct metadata+digest equality allows a source-body skip. Missing fields require a fresh bounded native source read; the result is never canonical proof.
4. Inspect state, next_action and source_cache.steps; if blocked, fail closed. Fetch only identified changes. Run separately chosen hosted MPC methods using their registered schemas; routing 384 business-logic children is applicability accounting, not 384 executed evaluations. Do not authorize a target test through model output.
5. For a real authorized private checkpoint, host must validate the actual approved action and provider-specific concurrency protection. Airtable logical checkpoint names do not provide compare-and-swap. If the connector lacks conditional writes, leave the proposal BLOCKED instead of pretending V10 safely writes.
6. Only after an authorized connector write succeeds, re-read the exact native record/revision. Record CHECKPOINT_ID, FRONTIER, PINNED_SOURCES, COMPLETED, OPEN, BLOCKED, CHANGED_STATE, NEXT_ACTION, DO_NOT_REPEAT. GitHub repository code is never a substitute for private target evidence.

### Local example (pure; no connectors contacted)

~~~js
import {planHotResume,planModeDispatch} from './lib/chatgpt-hot-resume-v10.mjs';
import pins from './connector-bridge/hot-resume-pointers.v10.json' with {type:'json'};
const expected_controller=pins.projects.KOMOJU.controller;
// Caller MUST first read the actual Airtable record using a real registered connector.
const result=planHotResume({
 project:'KOMOJU', expected_controller,
 live_controller:null, // => BLOCKED_NATIVE_CONTROLLER_NOT_READ
 mode:'TEST', source_records:[],cache_entries:[],capabilities:[]
});
const guarded=planModeDispatch({
 mode:'TEST',capabilities:[],operation:'WRITE_CHECKPOINT',
 surface:'GOOGLE_DRIVE',object_id:'real-native-id',user_approved:true
});
// guarded.state === 'BLOCKED_TEST_READ_ONLY'; write_performed is false.
~~~

## Validation / release boundary

Locally run on Node >=22.13.0:
~~~sh
node --test tests/chatgpt-connector-bridge.test.mjs tests/chatgpt-hot-resume-v10.test.mjs
node --test
npm run build
~~~

- A pre-existing V9 test fixture used native_id:'not same', violating V9's own typed-ID regex. V10 changes the fixture to native_id:'not-same' so the intended distinct-identity assertion executes. No V9 production bridge code was changed.
- Local portable copy verified 25/25 bridge tests passed on Node 22.16.0 (V9 6 + V10 19), with exact-byte V10 module/test Git blob hashes checked after GitHub upload. This is NOT a run of the complete repository and not a production proof gate.
- Full node --test and npm run build against the fully checked-out GitHub branch remain NOT RUN here (private repository cannot be cloned into this local sandbox; dependencies not installed). Execute in the prepared Node 24 / pnpm 11.25.0 Codex Cloud environment, and record the actual checkout SHA and exit codes. Do not claim PR #7's required full test/build succeeded.
- No source-level benchmark of startup speed has been performed. The delta cache should reduce unnecessary body fetches, not guarantee a timing multiplier.
- No new GitHub → Sites synchronization or hosted MPC connector dispatch exists. No automatic merge, deployment, credential ingestion, bounty target testing, or security-finding promotion.

**Next engineering PASS:** independently run full checkout tests/build, reconcile with the separate V10 branch, and if authorized add a private host-owned cache storage adapter with atomic revision guards; keep the pure V10 planner unchanged if regressions are absent.
