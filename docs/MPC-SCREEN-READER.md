# Private screen reading and change analysis

## Inverse OCR method — optional next-capture region

When full-frame OCR produces word and line positions, expand **Screen reader → Crop area**, select **Suggest crop from OCR**, and inspect the proposed native-source percentages before using **Apply crop for next capture**. MPC uses already recognized geometries (up to 128 qualifying atoms), tries bounded dense-region/inverse-frame candidates and validates the fraction of recognized text it would retain. It never automatically changes the crop, restarts capture, probes network targets or changes privacy masks. A crop can omit previously unseen information.

This is a process transformation rather than an additional classifier: OCR text atoms → spatial proposal → source-geometry audit → user review → a newly permitted capture. The estimate reports **pixel area reduction**, not guaranteed OCR speed. When a second capture uses the proposed region, the interface displays one observed OCR timing comparison, explicitly not a controlled performance benchmark. The current classifiers, virtual-OSI layers, source boundaries and Tesseract assets stay unchanged.

The Windows desktop now has **Screen reader** in the navigation. It samples a selected window or monitor, crops and masks the image before encoding, reads English text locally, and runs the existing MPC classifier and dependency methods on the observation. A large text area supports selection, copying, `.txt` export, and an explicit handoff to chat.

The application starts centered within the monitor's usable work area, including its native window frame. It uses Windows' device-independent work-area coordinates so a smaller or DPI-scaled desktop caps both the starting size and minimum size. The permission checkbox sits beside the capture controls, copy/export controls sit above the large output, and the performance panel is optional. Unchecking active session permission stops capture. The existing interface zoom and movable assistant remain available.

## Start a useful first session

1. Extract the new portable build into a new folder, close the old app, and open `MPC-Workspace.exe`. Confirm the commit under **Settings → Local service → GUI source** against the build receipt.
2. Create or select a project. Screen OCR needs no language model or API key.
3. Open **Screen reader → Choose / refresh sources**. Choose a document window when that covers the task; the source list requests names and identifiers without capturing thumbnails.
4. Leave **One screen capture** and **Original pixels** selected for the first check. Set a crop or privacy masks if needed. Coordinates are percentages of the selected source, so they remain separate from UI zoom and preview size.
5. Check the permission box for this session, then **Start**. The independent visible indicator has its own **Stop** button. **Ctrl + Shift + F8** stops an active capture when Windows grants that shortcut.
6. Inspect the text and masked preview. Use **Copy text**, **Save .txt**, **Copy for ChatGPT / Codex**, or **Use in chat**. The last option prepares the evidence and opens the assistant; **Send** is the explicit reasoning request.

For repeated reading, select **Repeated capture** and 0.5, 1, 2 or 4 samples per second. The default is one sample per second. A sampling rate is not a promise of that many completed OCR or language-model responses. **Print Screen** can be assigned for the active session; if another program owns it, the app reports the conflict and keeps **Capture now** available.

**Windows mouse fallback:** right-click inside a text input, evidence editor, chat composer, OCR text, or output pane for a native **Copy / Paste / Select All** menu. **Undo / Redo / Cut** are available only where Chromium reports an editable selection. Read-only OCR and result fields offer selection/copy but never Paste or Cut. A right-click on the in-memory, masked preview image offers **Copy preview image** to the Windows clipboard; this copies the displayed (scaled) masked preview, not a new full-resolution capture. All commands require the user's explicit mouse action; no automatic clipboard syncing, uploads, file writes, or new text retention. Existing **Copy text**, **Save .txt** and source-packet controls remain the primary reliable fallback.\n\n**Stop** retains the last recognized text for reading and copying. **Stop & clear** also clears this screen view's text, pending result and classifier display. Changing source, crop, masks or privacy settings requires a new capture session. A project change clears the prior project's screen result. Text already explicitly copied, exported or sent to a project remains in that destination according to its own retention settings.

## Reverse feedback: detect changes before repeating expensive work

The ordering is deliberate:

| Stage | Actual implementation | Work avoided |
| --- | --- | --- |
| Native source selection | Electron desktop video with an exact source ID, owned by a dedicated sandboxed renderer | Unselected windows are not independently captured or OCR'd |
| Crop and mask | Source pixels; outward rounding and two-pixel padding for masks | Excluded pixels never enter the preview or OCR PNG |
| Cheap change check | SHA-256 over the fully masked RGBA pixels plus crop geometry; retains the digest only | Identical pixels can skip both PNG encoders and IPC |
| Bounded sampling | A fresh admission at least every two seconds when sampling permits; one active OCR and only the newest waiting PNG | A slow reader does not accumulate a video backlog; refresh permits recovery from expired queued work |
| Exact OCR cache | PNG SHA-256 bound to session, project, source, crop, masks, processing, language and geometry | Repeated bytes can reuse text and word geometry |
| Text change classifier | Full-text digest and up to 64 ordered line hashes; same-text native results reused | A cursor, animation or other pixel change need not repeat every semantic check |
| Reverse dependencies | Existing `delta_plan` computes which derived checks are affected by changed observation text | Prior hypotheses and checks are invalidated when their input changes |
| Deeper reasoning | Explicit source packet passed to the selected model, with input coverage reported | A language model is not called for every frame |

The first observation needs OCR. Detecting pixel change does not identify its meaning, and matching text does not explain a non-text visual change. The classifier reports those limits. There is no artificial screen flashing, camera optical receiver, LED transmitter, physical visible-light communications channel, quantum processing, or new semiconductor accelerator in this build. The useful optical concepts implemented here are sampled image observation, identity checks, photometric normalization and selective recomputation.

## Native resolution and image treatment

OCR receives the cropped native video pixels, independently of the app's 50–200% UI zoom. The preview is scaled down to at most 800 × 450 for comfortable display; its small size does not reduce the OCR input resolution. The PNG limit is 16 MiB, the cropped area limit is 16,777,216 pixels, and the OCR engine's per-axis limit is 8192. Select a smaller region if the captured area exceeds those bounds.

**Original pixels** preserves antialiasing and color. **Increase text contrast** applies a bounded grayscale percentile stretch. **Black & white text (Otsu)** chooses a threshold from the image histogram by maximizing between-class variance. Both optional modes preserve dimensions and repaint privacy masks after processing. They may help certain low-contrast text, but can remove useful color or fine detail; compare against Original pixels on the same source. They do not reconstruct missing resolution. The algorithm is described in [OpenCV's official thresholding documentation](https://docs.opencv.org/4.13.0/d7/d4d/tutorial_py_thresholding.html); this app implements the small algorithm directly and does not bundle OpenCV.

OCR word boxes use `OCR_IMAGE_PIXELS`. Each receipt also includes the source frame dimensions and the validated crop in source pixels. To map a word back to the captured source, add the crop's `x` and `y` to its OCR box coordinates. These remain captured-image coordinates; using them as Windows desktop/DPI input coordinates would require a separate mapping and separate action authorization. This feature does not click or type into other applications.

## Existing MPC engine and cognitive-firewall checks

The classifier calls the original local `analyzeBusinessLogic` implementation, `delta_plan`, and the native `fault_tree` evaluator. It preserves the existing BL32/384 pack and the original evaluator and research-candidate registries. It displays selected candidate checks and their fingerprints; running the pack does not authenticate the displayed content.

Configured English cues cover instruction overrides, credential requests, payment language, destructive operations, local execution requests, urgency and claimed authority. Each interpretation is a **hypothesis** with an observed excerpt, an alternative explanation and a way to check it. Quoted or protective wording is explicitly marked when detected. A matched cue is not proof of an attack; absence of a match is not a safety finding. Authorship, user action and motives remain unobserved. These checks support a cognitive-firewall workflow by keeping displayed instructions as untrusted evidence and requiring explicit adoption for reasoning or action.

See [MPC-SCREEN-CLASSIFIER.md](MPC-SCREEN-CLASSIFIER.md) for the exact local engine calls, report schema and limitations. Screen content cannot invoke the native bridge, enable capture, select another source, resolve provider credentials or authorize tool actions. The deterministic check does not substitute for a language model; it gives that model and the user a smaller, source-bound set of observations to examine.

## Cache, disposal and fault containment

| Resource | Limit or lifecycle |
| --- | --- |
| Current image readback | One masked RGBA buffer during hashing/processing; erased after use or on failure/unload |
| Canvas and preview backing stores | Cleared after encoding and on stop/failure |
| Renderer PNG bytes | Kept intact until the main process acknowledges admission, then erased |
| Main IPC image bytes | Erased immediately after validation/copy into the bounded pipeline |
| OCR input | One active PNG and one newest waiting PNG; replaced, expired and revoked owned buffers are erased |
| Waiting frame lifetime | Five-second usefulness limit, with an independent pending-expiry timer |
| OCR result cache | At most 2 MiB / 32 entries / 15 seconds; text and geometry only; cleared on revocation |
| Classifier state | One bounded redacted report and at most 64 line hashes; reset when capture is revoked |
| PNG encoding | Five-second deadline per encode |
| OCR worker | Twenty-second initialization/recognition deadline; warmed within an active session and terminated on Stop |
| Source session | 5, 15 or 30 minutes; requires a new user start after expiry |

No screenshot files are deliberately written to a temporary folder or SSD cache. The bundled OCR engine and English data load from the installed app, with Tesseract disk caching disabled. The OCR worker has application-level network guards. The build workflow also executes the actual packaged OCR smoke in a separate network namespace with no external network access.

Clearing owned buffers is not a claim of secure erasure of every Chromium, GPU, allocator, structured-clone, swap/pagefile or operating-system copy. Text strings cannot be reliably overwritten in JavaScript. Windows memory management can page process memory. A user-enabled preview is an intentional in-memory copy until it is replaced or stopped; explicit exports and clipboard copies are outside the capture cache.

Native revocation covers Stop, the stop shortcut, source/project changes, window navigation/crash, failed capture or indicator processes, missing heartbeat, screen lock, suspend and application exit. Async generation checks prevent an old source lookup, PNG, OCR answer or classifier result from publishing into a newer session. Independent fault-injection tests cover the corresponding races. The finite-state and fault-tree model receipts are in [MPC-SCREEN-VALIDATION.json](MPC-SCREEN-VALIDATION.json). They describe supplied software models and control mutations, not flight qualification or a complete proof of system safety. [NASA's fault-tree bibliography](https://ntrs.nasa.gov/api/citations/20000070463/downloads/20000070463.pdf) describes the top-down hazard-analysis method that motivated these checks.

## Reasoning and connections

Use **Local AI setup** for Ollama at `http://127.0.0.1:11434`; no credential reference is needed. Once the local model is installed, OCR, deterministic classification and local inference do not require OpenAI API credits. The application checks the requested local model's metadata before sending evidence and does not treat a cloud alias as local inference.

**Copy for ChatGPT / Codex** creates a source-marked text packet for a user-controlled paste into those products. It does not turn a ChatGPT subscription into an API credential. Remote MCP needs an actual installed host adapter and its documented URL/transport. Ordinary GitHub, Drive, Dropbox and Gmail API URLs are REST endpoints, not interchangeable MCP endpoints.

The built-in read-only provider routes and exact fields are in [MPC-CONNECTION-SETUP.md](MPC-CONNECTION-SETUP.md). Enter your own scoped token through the desktop credential field; leave **Remember** off for session-only retention, or use available operating-system encryption. **Edit / replace token** updates the existing connection. **Stored access tokens** lets you forget an app-owned token without displaying it. The app stops screen capture before credential entry. Disabling a connection or forgetting its local token does not revoke the token at the provider.

## Measure before tuning Windows

The Screen reader metrics distinguish samples, skips before encoding, admitted PNGs, OCR completions, cache reuse, queue size and capture/encoding/OCR/classifier time. Export the current performance snapshot and record the source commit and exact workload. Main-process CPU/RSS include the OCR worker threads; the displayed CPU uses 100% for one logical core. Separate renderer, GPU and model processes need their own observations.

[MPC-PERFORMANCE-SYSINTERNALS.md](MPC-PERFORMANCE-SYSINTERNALS.md) gives finite Process Explorer, Process Monitor, RAMMap and WPR/WPA procedures to identify the slow stage. Use their actual observations to choose the next change. Repeatedly emptying the Windows standby list, using realtime priority or disabling security controls is not part of this capture implementation.

Build and fixture timings identify the environment in their receipts. The [classifier benchmark receipt](validation/MPC-SCREEN-CLASSIFIER-BENCHMARK.json) binds the synthetic timings to the actual classifier and test source hashes; it excludes OCR and screen capture. Linux/Xvfb native smoke validates Electron integration and real pixels in that environment. It does not establish performance, Windows DPI behavior, protected-window capture behavior, real account access or local-model answers on a user's Windows computer; those require the corresponding local acceptance check.
