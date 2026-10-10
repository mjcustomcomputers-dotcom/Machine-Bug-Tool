# Draft technical update for grant re-evaluation

Status: **draft for the applicant to review; not sent**. Add the application/reference ID, recipient from the original correspondence, final build link and any billing evidence before sending. No award, endorsement or funding decision is represented here.

Subject: Technical progress update and request to re-evaluate MPC cognitive-firewall accessibility work

Hello,

I would like to provide a technical update for my grant application and request re-evaluation in light of the current MPC Workspace implementation.

The project now connects permission-based screen reading to local English OCR and the existing MPC classifier and dependency engine. It detects unchanged masked pixels before encoding, uses bounded in-memory processing, and invalidates dependent conclusions when source text changes. Its cognitive-firewall checks treat screen instructions as untrusted material and present possible purposes as hypotheses with evidence, alternative explanations and falsifiers.

The accessibility work includes a workspace that reflows with the window, adjustable interface size, a hideable/movable assistant, a large copyable text output, privacy masks, session limits and independent capture Stop controls. Users can obtain OCR and deterministic classifications without OpenAI API credits. Local language-model reasoning uses Ollama; a separate explicit copy action prepares source-marked text for ChatGPT or Codex. Those paths do not imply that a ChatGPT subscription supplies API access.

The validation package distinguishes native implementation tests, deliberate failure controls, real bundled-engine OCR checks, synthetic performance measurements and the remaining tests on the receiving Windows computer. Fault-tree and finite-state methods are used as software engineering checks; I am not representing the project as NASA-certified or flight-qualified.

I have personally paid for testing during this work, as described in my earlier application context. I can provide the relevant billing records. I would appreciate guidance on whether this progress and the associated evidence support re-evaluation, and whether testing support or API credits are available under the applicable program.

Technical evidence: the build's exact source commit, GitHub Actions run, portable artifact and checksum; `MPC-SCREEN-READER.md`; `MPC-SCREEN-CLASSIFIER.md`; `MPC-SCREEN-VALIDATION.json`; and the native smoke and performance receipts attached to that build.

Thank you,

Melvin Jackson
