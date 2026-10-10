# MPC V32 — Windows portable build and native receiving

**Checkpoint:** `MPC_V32_WINDOWS_PORTABLE_RECEIVING`  
**Stack parent:** V31 source commit `08216cdc968b3d0688e615d3f220905f7feede55`  
**Review branch:** `feature/mpc-v32-windows-portable-receiving`  
**PR:** [#32](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/pull/32)

## METHOD — Build, verify, receive

V31's forward/backward reasoning, counterfactual proof cuts, abduction, and diagnosis already passed 1,359 source tests. V32 continues the practical engineering frontier, using the existing Windows portable packaging script and source/ASAR receipt format.

`scripts/verify-v32-windows-portable.mjs` verifies (1) the exact clean Git commit and Windows x64 target; (2) every shipped portable file against the external build inventory; (3) Electron ASAR runtime files against staged original SHA-256 values using a **platform-neutral extraction-and-hash pass**; (4) external HTML/JS/CSS renderer files against the same source manifest; (5) embedded Electron package source identity; (6) internal versus external receipts; and (7) the portable ZIP's checksum. Its six regression tests cover exact positive and negative checks.

The cross-platform extraction is deliberate. The Electron ASAR API can treat nested filename separators differently on Windows. To prevent a platform-dependent lookup decision, V32 extracts the actual ASAR archive to a fresh temporary directory and hashes each stage-listed regular file by its real path. The extracted test files are disposed of afterward. GitHub reported the issue at [electron/asar#369](https://github.com/electron/asar/issues/369).

## RESULT — Build pipeline

`.github/workflows/mpc-v32-windows-portable-receiving.yml` has two jobs:

**Linux packaging:** frozen pinned Node/pnpm; V32 verifier controls plus V31 source regression; entire repository tests and source build; exact clean-source Windows x64 Electron packager; ZIP/receipt generation; full portable/ASAR/renderer/hash readback; immutable artifact upload.

**Windows receiving:** download the exact artifact from the same workflow run; recompute the ZIP checksum; extract ZIP; compare all source and payload bytes again; execute the shipped `MPC-Workspace.exe` in Electron's Windows-native Node runtime mode; extract ASAR and run one synthetic V31 reasoning model through the **actual packaged** loopback Workspace server. A separate Windows regression invocation checks the source-equivalent V31 method path.

The Windows synthetic input demonstrates `A AND B → X → GOAL` and `C → GOAL`. It expects two minimal supports, `{fA,fB}` and `{fC}`, and two minimum evidence-withdrawal cuts, `{fA,fC}` and `{fB,fC}`. This tests forward/reverse agreement plus the independent method result replay through the portable code.

## EVIDENCE — Saved receipts

Artifacts are uploaded as `MPC-V32-Windows-x64-<source-sha>` and `MPC-V32-Windows-Native-Acceptance-<source-sha>`, with the complete ZIP, `.sha256`, source/build inventory, package verification JSON and native Windows receipt.

Acceptance is source-specific: preserve the **actual final successful run** and SHA in PR #32. Each run's artifact stays available through GitHub Actions for 30 days according to its upload configuration. Old ZIPs retain their source identity; do not confuse them with a newer accepted build.

## NEXT — Open on the local Windows computer

1. Open the final successful V32 GitHub Actions run and download the Windows portable artifact ZIP.
2. Extract the artifact bundle, verify the embedded portable ZIP's SHA-256, then extract the portable ZIP into a chosen local folder. Keep its `resources` directory with the executable.
3. Launch `MPC-Workspace.exe` or its included launcher.
4. Open an MPC project, choose **Methods → Engineering Lab → Forward vs Reverse**, load a synthetic example, click **Run selected method**, and copy the full receipt.
5. For genuine work, enter a user-selected native source-bound model with the exact project/scope, actor, source reference, owner, version and evidence state. Compare the observed proof and its falsifier; preserve the receipt under the original project.

PowerShell checksum example after downloading the artifact bundle:

```powershell
$folder = "$HOME\Downloads\MPC-V32-Portable"
$zip = Join-Path $folder 'MPC-Workspace-0.1.0-windows-x64-portable.zip'
$sum = Join-Path $folder 'MPC-Workspace-0.1.0-windows-x64-portable.zip.sha256'
$expected = ((Get-Content -LiteralPath $sum -Raw).Trim() -split '\s+')[0]
$actual = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw 'ZIP_CHECKSUM_MISMATCH' }
Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $folder 'extracted') -Force
```

**Acceptance stages:** GitHub source/build/portable byte verification; Windows CI-native packaged-method receiving; operator-owned Windows interactive/real-record evaluation. Only report the stage actually supported by an uploaded receipt.

**DO NOT REPEAT:** V22–V31 research expansion, original 24 native IDs, original 239 Atlas IDs, preexisting security/regression repairs.  
**NEXT_AFTER_CI:** user-owned Windows launch and one selected local project record through the preserved V31 forward/reverse method.
