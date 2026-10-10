# MPC Atom–Process–Method Identity

**Working motto:** “ALL UR METHODS R BELONG TO US — TELL U WUT.” In the product this means our **execution controller owns the sequence, bindings, experiments and original code it authored**, not that an organization can own mathematics, facts, publicly known procedures, or somebody else's code.

This development branch deliberately names operations by **what is executed** rather than using agency names (“NASA,” “CIA,” etc.) as performance or authority badges. Research inspiration is never evidence of institutional sponsorship or endorsement. Each public technique retains its actual authorship and license; source-code distribution requires an appropriate rights review. This repository has no top-level LICENSE file observed at source head. Third-party code and packages still have their own notices/licenses.

## Atom and process grammar

| Type | Exact meaning | Example |
|---|---|---|
| SOURCE | Consented owner, source ID, session, frame hash and geometry | `screen:4:0`, `4096×2160` |
| ATOM | Bounded observation with typed properties, trust and uncertainty | Tesseract line box and confidence |
| METHOD | Deterministic transformation of typed atoms | `ATOMIZE_WORD_GEOMETRY` |
| PROCESS | Sequenced methods with explicit preconditions and stage cost | `ATOMIZE → INVERT_SEARCH → PROPOSE → AUDIT` |
| INVERSE METHOD | Work backward from desired property to a candidate input | Reduce next capture rectangle by projecting recognized text geometry back into native source coordinates |
| METHOD ON METHOD | Check another method's output or invert its inputs | Reject a proposal missing source identity or omitting too many observed text atoms |
| FALSIFIER | Concrete independent control disproving a proposed benefit | Same selected static window, capture original and candidate crop, measure paired OCR time/confidence |
| DECISION | Bounded operator action, not autonomous promotion | “Apply crop for next capture,” then user presses Start |

The source's original BL32/384, 24 native evaluators, 239 Method Atlas candidates, method-hook, fault-tree and delta-plan IDs are **preserved**. The new ROI process adds no registry identity or inflated executed-method count. Terms such as `CLASSIFIED` in native receipts remain exact legacy API states, not user-facing product branding.

## Evidence-driven optimization pass

Two real Windows receipts supplied to this pass measured 4096×2160 OCR at 4,538 ms versus local classifier processing at 2.58 ms, and 4096×2016 OCR at 2,882 ms versus classifier processing at 2.86 ms. They involve different frames and content; they **do not** establish a fair performance benchmark or that 2016 pixels is the cause of the difference.

The screen reader now proposes a finite inverse-region search from **existing** OCR line or word geometry. It evaluates a full recognized-text envelope and up to 225 bounded dense-region candidates, audits the source coordinate projection, requires at least four valid atoms and 65% of weighted previously recognized text, and requires at least 28% pixel-area reduction. It refuses truncated geometry and very-low-confidence OCR and reports excluded atoms. Results are not authoritative proof that excluded regions are irrelevant. Raw screenshots, OCR strings, consent choices and privacy masks are not changed or stored by the proposal.

On user review, **Apply crop for next capture** changes only source-relative crop percentages (privacy masks unchanged); **Start** remains a separate explicit action. The display compares one old/new OCR timing pair when applicable, with context-change and variance caveats. Crop geometry can lower work even though runtime may not scale linearly; actual speed/accuracy is determined only by repeated native tests on the same stable source. **Copy method receipt** exports the proposal and its limitations only when clicked.

Further process work: optional native accessibility text acquisition for a user-selected application, content segmentation before OCR, incremental recognition with source-geometry lineage, and a guarded multi-sample benchmark comparing full and cropped regions. They are not present or claimed working in this pass.
