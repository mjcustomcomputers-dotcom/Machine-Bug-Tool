# MPC V29 — Language Translation, Java Bytecode, CAN Bus & Method Mountains

**Source:** `mjcustomcomputers-dotcom/Machine-Bug-Tool`, stacked on V28 commit `7e0ead087b8fd786fc5e8dcb69d53457f369060f` ([PR #28](https://github.com/mjcustomcomputers-dotcom/Machine-Bug-Tool/pull/28)).
**Review branch:** `feature/mpc-multilingual-can-code-method-mountains-v29`.
**Execution policy:** `ACQUIRED → ANALYZED → DECIDED`. **Presentation:** METHOD / RESULT / EVIDENCE / NEXT.

## Architecture

```text
SOURCE + VERSION + OWNER
          ↓
       ATOMS
          ↓
  METHOD BLOCKS (domain, prerequisites, typed output)
          ↓
  METHOD MOUNTAINS (directional dependency layers)
          ↓
  REDUCTION (first executable method or smallest missing source)
          ↓
  INDEPENDENT REPLAY / FALSIFIER
          ↓
  COMPACT ENGINEERING RESULT
```

Every step returns a finite machine-readable receipt. The compact report references its full receipt digest. Detailed assurance flags live in that structured receipt; ordinary output displays only the material result, evidence, and next action.

## Method hooks

The source-linked [V29 Method Atlas overlay](../research/linguistic-code-can-method-mountains-v29.json) contains **46 research-hook contracts**:

| Domain | Count | Principal interface |
|---|---:|---|
| Language | 12 | BCP47 → controlled vocabulary → reverse lexical replay → provenance |
| Java / IR | 10 | classfile header → typed AST → JVM subset → independent AST oracle |
| CAN bus | 14 | SocketCAN identifier/flags → DLC → offline series → layered protection |
| Meta | 10 | atom → block → mountain → reduction → concise scientific reporting |

Research contracts are tagged separately from the finite local implementations. The original 24 MPC evaluators, 239 Method Atlas candidates, historical MAXVAR/BL32-384/MBSS records, V20–V28 controllers, and native proof gates remain intact.

## Executable language science

**`lib/mpc-v29-language-translation.mjs`** supports four declared-language families (**English, Spanish, French, German**) across two registers (**SHORT, ENGINEERING**) and eight versioned semantic message codes. BCP 47 locale tags retain language, script and region; the controlled dictionary uses explicit terminology such as **verification test passed**, instead of wording that could falsely imply a financial/administrative approval. The **independent** `mpc-v29-language-audit.mjs` reverses each output from its own glossary and checks exact source owner/version and message code. Unicode NFC and NFKC transformations are inspected separately, including compatibility-meaning loss.

Relevant standards: [RFC 5646 BCP 47](https://www.rfc-editor.org/info/rfc5646/), [Unicode UAX #15 (2026)](https://www.unicode.org/reports/tr15/), and [Unicode CLDR](https://cldr.unicode.org/).

**`lib/mpc-v29-compact-linguistic.mjs`** produces concise professional writing from V28's original semantic frames and independent replay receipts. It preserves actual negation, quantifier, attribution, contrary material and original full receipts while collapsing routine repeated metadata from the visible text. The earlier V28 source/renderer and historical acceptance remain versioned and unchanged.

## Executable Java / intermediate-representation science

**`lib/mpc-v29-java-ir.mjs`** implements an exact Java SE 27 classfile **header classifier** (magic `CAFEBABE`, major versions 45–71, preview minor version gates and constant-pool count). It also contains a finite, fuel-limited signed `int32` JVM stack subset: `iconst_m1..5`, `bipush`, `sipush`, `iadd`, `isub`, `imul`, `ineg`, `ireturn`. A bounded expression AST compiler is checked with an **independently evaluated AST arithmetic oracle**, including signed 32-bit wrap behavior and mutational counterexamples.

This is a structural JVM/IR research laboratory; complete Java class loading and full JVM bytecode verification remain separate source tasks. The source is the [Java SE 27 JVM specification](https://docs.oracle.com/javase/specs/jvms/se27/html/index.html), including [classfile verification](https://docs.oracle.com/javase/specs/jvms/se27/html/jvms-4.html). [LLVM LangRef](https://llvm.org/docs/LangRef.html) supplies additional phi-node, SSA and undefined-value research contracts.

## Executable CAN-bus science

**`lib/mpc-v29-can-observation.mjs`** accepts bounded **caller-supplied offline frame receipts**. It decodes SocketCAN-style CAN SFF (11-bit) and EFF (29-bit) identifier flags; distinguishes Classic CAN from CAN FD; checks Classic data length 0–8 bytes and the FD DLC table including 9→12, 10→16 and 15→64 bytes; handles Classic RTR requests separately; retains payload SHA-256 rather than raw bytes.

An independent **counter-window check** separates rollover, repeated values, modular skipped counters, clock regression and out-of-period observations. A separate AUTOSAR-style assurance classifier keeps E2E **CRC/integrity**, SecOC **freshness/authenticator**, and policy authorization evidence as distinct values. The algorithm operates on offline source data, with no vehicle/interface access.

Standards: [Linux SocketCAN](https://docs.kernel.org/networking/can.html), [Linux CAN ID flags](https://github.com/torvalds/linux/blob/master/include/uapi/linux/can.h), [ISO 15765-2:2024](https://www.iso.org/standard/84211.html) (current published revision), [AUTOSAR SecOC](https://autosar.org/fileadmin/standards/R23-11/FO/AUTOSAR_FO_PRS_SecOcProtocol.pdf), and [AUTOSAR E2E](https://www.autosar.org/fileadmin/standards/R21-11/FO/AUTOSAR_RS_E2E.pdf).

## Blocks, mountains and reduction

**`lib/mpc-v29-method-mountains.mjs`** uses source/subject/version-bound typed atoms, selects relevant methods in the requested domain, builds **blocks** by family, forms typed directional **mountain layers**, marks cyclic dependency candidates, and identifies the **smallest primary record** needed to advance. It gives priority to an already-applicable method; contradictory source ownership/version moves directly to acquisition; unchanged fingerprints return STOP. Resource budget: **64 atoms, 46 catalog hooks, at most 12 selected methods, four blocks**.

The output module `formatCompactEngineeringReceiptV29` uses four lines, with the full receipt available for forensic detail:

```text
METHOD    CANFD_DLC_EXACT_LENGTH_MAP
RESULT    METHOD_BLOCKS_READY
EVIDENCE  DLC, CODEC_KIND
NEXT      Run first supported finite method, then its independent replay.
```

## Acceptance and next integration

```sh
node --test tests/mpc-v29-language-java.test.mjs tests/mpc-v29-can-methods.test.mjs
node research/run-mpc-v29-engineering-pass.mjs
node --test
pnpm run build
```

A pinned Node 24.19/pnpm 11.25 GitHub workflow tests these on the **exact V29 commit**. Validation is source-level; actual local Windows native, vehicle-specific interfaces and hosted Workspace receiving remain separate acceptance targets.

**Checkpoint:** `MPC_V29_MULTILINGUAL_JAVA_CAN_METHOD_MOUNTAINS`.
**Core saved:** 46 research hooks, five source-bound executable areas, two independent language/bytecode replay mechanisms, compact verified output and method mountain planner.
**Next:** inspect CI for the exact source, repair reproducible failures, save PR readback; preserve the review branch until source receiving or deployment is explicitly authorized.
