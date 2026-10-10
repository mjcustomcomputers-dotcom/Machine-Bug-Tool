# MPC V30 — Engineering Lab / First Local Receiving Adapter

**Source branch:** `feature/mpc-workspace-engineering-lab-v30`  
**Exact parent:** `5f624980c12620811459fa80684d9cb1458811ef` (verified V29 PR #29)  
**Execution:** Opt-in finite methods in the existing MPC Workspace **Methods** page.

## METHOD → RESULT → EVIDENCE → NEXT

MPC Workspace now receives **seven existing V29/V28 computation families** through its actual loopback service. A collapsible Engineering Lab sits inside the already-built Methods page. The original 24 native evaluator dropdown and job acquisition route continue to operate independently.

The panel stays closed at launch. Open a project, expand **Engineering Lab**, select one of the available methods, load a synthetic example or supply the bounded JSON model, then click **Run selected method**. The panel shows four concise result lines, provides **Copy result**, and provides a complete machine-readable receipt in the secondary details view with **Copy full receipt**.

This is a practical **receiving interface**, using the existing application runtime rather than an additional text-only method catalog.

## Seven implemented receiving operations

| Operation | Existing algorithm invoked | Primary result |
|---|---|---|
| `MOUNTAINS` | `planMethodMountainsV29` + `formatCompactEngineeringReceiptV29` | Method blocks, dependency layers, smallest missing record, next action |
| `TRANSLATION` | `emitControlledTranslationV29` + `replayControlledTranslationV29` | Locale-specific controlled message with independent reverse replay |
| `JAVA_EXPRESSION` | `compileTinyJavaExpressionV29` + `auditTinyCompilerReplayV29` | Bounded compiler/JVM arithmetic compared with independent AST oracle |
| `CAN_FRAME` | `inspectPassiveCanFrameV29` | Offline CAN / CAN FD identifier, DLC and payload integrity metadata |
| `CAN_COUNTER` | `inspectCanCounterWindowV29` | Offline counter gaps, wraps, repeats and timestamp conditions |
| `CAN_PROTECTION` | `auditCanProtectionChainV29` | CRC, freshness, authenticator and policy evidence stages |
| `LINGUISTIC_OUTPUT` | `formatCondensedLinguisticOutputV29` with the unchanged V28 independent linguistic audit | Compact claim-language and underlying independent replay |

## Backend source and auth path

- `lib/mpc-workspace-method-lab-v30.mjs`: exact finite method dispatcher. Only seven operations. Requires `opt_in:true`, existing `project_id`, exact matching `input.scope_id`, versioned source/owner references (or V28 frame-bound citations), a **32-KiB JSON input limit** and **256-KiB receipt output limit**.
- `scripts/mpc-workspace-server.mjs`: `POST /api/workspace/methods/engineering`, behind the existing loopback host, CSRF and same-origin checks and an existing-workspace project lookup.
- `desktop/renderer/method-lab.js`: client-side consent-to-run, project selection, seven bounded synthetic fixture generators, strict JSON parse, local request, automatic project-change discard, compact method/result/evidence/next output, and copyable receipt.
- `desktop/renderer/index.html` + `styles.css` + `app.js`: one collapsed-by-default Methods subpanel with accessible labels, reduced-motion compatibility, ordinary responsive layouts and text-only result assignments.

**Selected source identity stays attached** to each review receipt. `input_json_sha256` identifies the exact supplied model and `receipt_sha256` fingerprints the complete internal calculation envelope. No automatic persistence or connector write occurs. A completed computation is explicit; launching the Workspace alone never executes a method.

## Windows packaging boundary

The existing portable Windows stager already copies the `desktop/renderer` asset directory and statically closes the server's transitive ES-module import graph. V30 tests verify the following files are included in the staged app:

```text
desktop/renderer/method-lab.js
scripts/mpc-workspace-server.mjs
lib/mpc-workspace-method-lab-v30.mjs
lib/mpc-v29-language-audit.mjs
lib/mpc-v29-can-observation.mjs
lib/mpc-v29-method-mountains.mjs
lib/mpc-linguistic-audit-v28.mjs
```

Actual Windows executable launch, Chromium focus/scroll/zoom behavior and live operator-selected non-synthetic records remain separate acceptance gates. The source build and offline portable staging can be verified in GitHub Actions.

## Exact-source acceptance commands

```sh
node --test tests/mpc-v30-engineering-lab.test.mjs tests/mpc-v30-engineering-server.test.mjs
node --test tests/mpc-v29-language-java.test.mjs tests/mpc-v29-can-methods.test.mjs
node --test tests/mpc-workspace-renderer.test.mjs tests/mpc-workspace-server.test.mjs tests/mpc-workspace-desktop.test.mjs
node --test
pnpm run build
```

The V30 Actions workflow pins Node 24.19, pnpm 11.25, frozen dependencies and exact Git parent ancestry. Acceptance requires **real CI execution on the final V30 head** and native file readback, not a standalone source commit.

**Checkpoint:** `MPC_V30_WORKSPACE_FIRST_NATIVE_METHOD_RECEIVING`.  
**Completed source:** one opt-in full-stack local Workbench path to retained V29/V28 methods, with precise source/project binding and copyable output.  
**Next:** obtain the exact passing GitHub Actions receipt, keep the PR draft, and separately run Windows portable acceptance before promotion.
