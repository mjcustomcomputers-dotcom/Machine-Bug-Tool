---
name: machine-legal-live-source-router
description: Route legal research to current authoritative sources based on the exact classifier gap, preserve source freshness and coverage metadata, and distinguish live/current retrieval from historical or secondary repositories. Use for current law, recent cases, source coverage gaps, professor/.edu repositories, government APIs, cross-jurisdiction research, or any request to make legal research current and reproducible.
metadata:
  priority: 10
  promptSignals:
    phrases:
      - "live data"
      - "current law"
      - "latest cases"
      - "source ladder"
      - "edu repository"
      - "professor repository"
      - "current authority"
      - "freshness"
      - "legal data"
      - "repository gap"
---

# Machine Legal Live-Source Router

## Prime rule
`FACT QUESTION -> SOURCE ACQUISITION -> FACT EXTRACTION -> ANALYSIS -> CLAIM VERIFICATION.`

Enter EVIDENCE_ACQUISITION when the next useful fact depends on a record or full text still to be obtained. Name that fact and use the appropriate source tool to obtain the record. Read a known native object directly; use focused discovery when its locator is unknown. After retrieval, extract what the source actually says, preserve the source ID/version/time, and advance the question. Select the missing object type: opinion/holding, docket/filing, statute, current regulation, historical regulation, legislation/action, agency rulemaking record, state/local source, comparative/international source, scholarship/method, or repository coverage gap.

## Live means retrieved, not remembered
A proposition is not "current" merely because the model believes it is current. For every material current-law dependency, preserve a retrieval receipt containing when available:
- source/provider and source class;
- native stable ID/citation;
- official/native URL;
- retrieved-at timestamp/cutpoint;
- decision/publication/effective date;
- source last-modified / ingestion / update date;
- coverage window or corpus date range;
- current/historical status;
- full-text status;
- what the retrieval proves and does not prove.

If source-side freshness metadata is unavailable, say so. Never fabricate a last-updated time.

## Preferred source ladder by object
1. **Native official publisher/court/agency** when it exposes the needed full text or machine-readable record.
2. **Official government API/MCP** (e.g. GovInfo; Congress.gov; Regulations.gov; eCFR/Federal Register APIs) for query-time current federal material.
3. **CourtListener / Free Law Project** for U.S. opinions, citation verification, dockets and RECAP; read the actual opinion/filing, not just the search result.
4. **Open primary-law index** such as Legal Data Hunter when the classifier gap requires a jurisdiction/source not covered by the narrower U.S. path or when source discovery itself is the problem. Preserve its underlying official source URL and do not treat the index as the legal authority owner.
5. **Academic/open historical repository** (Harvard CAP, law-school repositories, institutional archives) for historical coverage, corpus repair, scanned reporters, research datasets, or when current indexes lack older material.
6. **Reliable complete mirrors** only when upstream official/full-text sources fail. Mark mirror status explicitly.
7. Generic web search is a locator/fallback, not authority text.

A lower rung may be better for a specific object. The router chooses by source fitness, not prestige alone.

## Historical/current non-equivalence
Historical corpus != current law. In particular, Harvard CAP is an archival corpus and historical fallback; do not use it to establish that a rule remains current without a current source check. Current consolidated regulation != historical regulation. Current docket != later-filed docket entry. Published case != later treatment.

## Multi-source fusion without provenance loss
When more than one source returns the same legal object:
- deduplicate by stable citation/native identifier and normalized case/document identity;
- preserve every source locator and retrieval timestamp;
- prefer native/official full text for quotations;
- use other sources for coverage, metadata, citation graph, OCR repair, or falsification;
- never merge conflicting metadata silently. Create a conflict/gap node.

## Discovery-first behavior
When jurisdiction/source coverage is uncertain, discover the available corpus before searching it. Prefer source manifests and source-discovery tools over blind repeated keyword searches. For cross-jurisdiction questions, verify which countries/courts/source types are indexed before spending quota.

## Freshness states
Use one of:
- LIVE_VERIFIED: retrieved at query time and source provides current/update metadata consistent with the target;
- LIVE_RETRIEVED_NO_SOURCE_TIMESTAMP: query-time retrieval but upstream freshness metadata is absent;
- INDEX_CURRENTNESS_DEPENDS_ON_PROVIDER: current index queried, ingestion latency not independently established;
- HISTORICAL_VERIFIED: authoritative archival/historical corpus for the stated date;
- STALE_OR_OUT_OF_SCOPE: source does not cover the requested current period/object;
- FRESHNESS_UNRESOLVED: currentness cannot be established.

## Acquisition completion and next phase
An acquisition step completes when the requested record or source text has been read and its relevant facts extracted with a retrieval receipt. State the new fact and its source. Move into ANALYSIS when that material answers the current acquisition target; enter VERIFICATION when a defined claim and criterion are ready. Obtain a further record when a specific remaining question requires it. Perform adverse/currentness checks when they matter to the claim being evaluated.

Use [machine-legal-work-triage](../machine-legal-work-triage/SKILL.md) to execute the selected read through the available native connector, extract the target fact, and dispatch the next ready action. Preserve returned content, exact source/version, and its citation; supply only fields accepted by the current router schema. Continue with those acquired records rather than repeating discovery.

## Free/low-cost discipline
Prefer already-connected or no-cost public sources. Treat quota-limited services as gap-fillers. Do not consume a scarce external query when CourtListener, GovInfo, a native government API, or already-cached immutable full text resolves the same node.
