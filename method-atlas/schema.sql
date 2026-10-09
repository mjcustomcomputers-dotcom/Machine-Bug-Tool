-- Additive MPC Method Atlas, SQLite / Cloudflare D1 compatible.
-- MHA and MHC are discovery namespaces; none modifies canonical registries.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS atlas_metadata (
 key TEXT PRIMARY KEY NOT NULL,
 value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS atlas_sources (
 source_id TEXT PRIMARY KEY NOT NULL,
 title TEXT NOT NULL,
 native_url TEXT NOT NULL,
 source_class TEXT NOT NULL CHECK(source_class IN ('PRIMARY_PUBLICATION','OFFICIAL_GUIDANCE','ACADEMIC_COURSE','RESEARCH_REFERENCE')),
 review_state TEXT NOT NULL CHECK(review_state IN ('DIRECTLY_RETRIEVED','LOCATOR_ONLY')),
 checked_on TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS atlas_methods (
 method_id TEXT PRIMARY KEY NOT NULL CHECK(method_id GLOB 'MHA-[0-9][0-9][0-9][0-9]'),
 method_name TEXT NOT NULL,
 family TEXT NOT NULL,
 mechanism TEXT NOT NULL,
 required_input TEXT NOT NULL,
 falsifier TEXT NOT NULL,
 implementation_state TEXT NOT NULL DEFAULT 'RESEARCH_HOOK' CHECK(implementation_state IN ('RESEARCH_HOOK','PROTOTYPE','VALIDATED_IMPLEMENTATION')),
 quantum_requirement TEXT NOT NULL DEFAULT 'NONE' CHECK(quantum_requirement IN ('NONE','QUANTUM_HARDWARE_OR_SIMULATOR','CLASSICAL_QUANTUM_INSPIRED','POST_QUANTUM_CRYPTO_REVIEW')),
 primary_source_id TEXT NOT NULL REFERENCES atlas_sources(source_id),
 provenance_state TEXT NOT NULL DEFAULT 'SOURCE_LINKED_CANDIDATE' CHECK(provenance_state IN ('SOURCE_LINKED_CANDIDATE','METHOD_FULLTEXT_REVIEWED')),
 UNIQUE (family, method_name)
);
CREATE TABLE IF NOT EXISTS atlas_triggers (
 method_id TEXT NOT NULL REFERENCES atlas_methods(method_id),
 dimension TEXT NOT NULL,
 trigger_strength INTEGER NOT NULL CHECK(trigger_strength BETWEEN 1 AND 5),
 PRIMARY KEY(method_id,dimension)
);
CREATE INDEX IF NOT EXISTS atlas_triggers_by_dimension ON atlas_triggers(dimension, method_id);
CREATE TABLE IF NOT EXISTS atlas_classifiers (
 classifier_id TEXT PRIMARY KEY NOT NULL CHECK(classifier_id GLOB 'MHC-[0-9][0-9][0-9][0-9]'),
 method_id TEXT NOT NULL REFERENCES atlas_methods(method_id),
 question TEXT NOT NULL,
 missing_evidence TEXT NOT NULL,
 falsifier TEXT NOT NULL,
 classifier_state TEXT NOT NULL DEFAULT 'DISCOVERY_CANDIDATE' CHECK(classifier_state IN ('DISCOVERY_CANDIDATE','EVIDENCE_LINKED','REJECTED','REVIEWED')),
 UNIQUE(method_id,question)
);
CREATE INDEX IF NOT EXISTS atlas_classifiers_by_method ON atlas_classifiers(method_id);
CREATE TABLE IF NOT EXISTS atlas_crosswalk (
 method_id TEXT NOT NULL REFERENCES atlas_methods(method_id),
 parent_namespace TEXT NOT NULL CHECK(parent_namespace IN ('MAXVAR','NESTMAX','BL','MBSS','EXT')),
 parent_native_id TEXT NOT NULL,
 link_status TEXT NOT NULL CHECK(link_status IN ('PROPOSED_STRUCTURAL_LINK','SOURCE_VERIFIED_LINK')),
 basis TEXT NOT NULL,
 PRIMARY KEY(method_id,parent_namespace,parent_native_id)
);
CREATE INDEX IF NOT EXISTS atlas_crosswalk_parent ON atlas_crosswalk(parent_namespace,parent_native_id);
INSERT OR IGNORE INTO atlas_metadata(key,value) VALUES
 ('atlas_version','METHOD-ATLAS-SQLITE-1.0'),
 ('canonical_registry_write_permission','NONE'),
 ('method_dispatch','MANUAL_AND_TYPED'),
 ('automatic_method_execution','false'),
 ('source_authentication','false'),
 ('target_network_actions','false'),
 ('bounty_finding_promotion','false');


-- Source-bound proposed corroboration/complement/challenge links. No truth promotion.
CREATE TABLE IF NOT EXISTS atlas_method_relations (
 method_id TEXT NOT NULL REFERENCES atlas_methods(method_id),
 related_method_id TEXT NOT NULL REFERENCES atlas_methods(method_id),
 relation_type TEXT NOT NULL CHECK(relation_type IN ('COMPLEMENT','CHALLENGE','CROSS_CHECK')),
 rationale TEXT NOT NULL,
 evidence_independent INTEGER NOT NULL DEFAULT 0 CHECK(evidence_independent=0),
 link_status TEXT NOT NULL DEFAULT 'PROPOSED_METHOD_COMPARISON' CHECK(link_status IN ('PROPOSED_METHOD_COMPARISON','REVIEWED_METHOD_COMPARISON')),
 PRIMARY KEY(method_id,related_method_id,relation_type),
 CHECK(method_id != related_method_id)
);
CREATE INDEX IF NOT EXISTS atlas_method_relations_lookup ON atlas_method_relations(method_id,related_method_id);


-- Multi-axis deterministic Method Atlas reclassification (non-canonical).
CREATE TABLE IF NOT EXISTS atlas_method_taxonomy (
 method_id TEXT NOT NULL REFERENCES atlas_methods(method_id),
 axis TEXT NOT NULL CHECK(axis IN ('DISCIPLINE','PURPOSE','MODEL_KIND','DIRECTION','EVIDENCE','IMPLEMENTATION','SOURCE_REVIEW','QUANTUM_REQUIREMENT','WORKFLOW_STAGE')),
 class_key TEXT NOT NULL,
 classification_basis TEXT NOT NULL CHECK(classification_basis IN ('FAMILY_DECLARED','DIMENSION_TYPED','METHOD_ID_OVERRIDE','NATIVE_METHOD_METADATA','SOURCE_LOCATOR_METADATA')),
 review_state TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(review_state IN ('PROPOSED','REVIEWED')),
 PRIMARY KEY (method_id,axis,class_key)
);
CREATE INDEX IF NOT EXISTS atlas_method_taxonomy_axis ON atlas_method_taxonomy(axis,class_key,method_id);
CREATE INDEX IF NOT EXISTS atlas_method_taxonomy_method ON atlas_method_taxonomy(method_id,axis);


-- Derived per-atom, per-variation, per-direction, per-boundary consideration ledger.
-- These rows are review decisions, never execution or source authentication receipts.
CREATE TABLE IF NOT EXISTS atlas_variation_ledger (
 subject_id TEXT NOT NULL,
 atom_id TEXT NOT NULL,
 variant_id TEXT NOT NULL,
 variation_kind TEXT NOT NULL,
 method_id TEXT NOT NULL REFERENCES atlas_methods(method_id),
 direction TEXT NOT NULL CHECK(direction IN ('FORWARD','BACKWARD')),
 boundary TEXT NOT NULL CHECK(boundary IN ('INTERNAL_MODEL','EXTERNAL_SOURCE')),
 evidence_digest TEXT NOT NULL CHECK(length(evidence_digest)=64),
 variant_digest TEXT NOT NULL CHECK(length(variant_digest)=64),
 source_signature TEXT NOT NULL,
 dimension_signature TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('DIMENSION_NOT_MATCHED','DIRECTION_UNSUPPORTED','SOURCE_UNBOUND','EXTERNAL_SOURCE_UNBOUND','TRIGGERED_INPUT_REVIEW_REQUIRED','NO_MATERIAL_VARIATION')),
 recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(subject_id,atom_id,variant_id,method_id,direction,boundary,evidence_digest,variant_digest,source_signature,dimension_signature)
);
CREATE INDEX IF NOT EXISTS atlas_variation_ledger_atom ON atlas_variation_ledger(subject_id,atom_id,variant_id);
CREATE INDEX IF NOT EXISTS atlas_variation_ledger_method ON atlas_variation_ledger(method_id,direction,boundary);


-- Optional V11 performance probes; never imply faster results without a benchmark.
-- Reverse-link traversal uses related_method_id, so index its inverse direction.
CREATE INDEX IF NOT EXISTS atlas_method_relation_reverse
ON atlas_method_relations(related_method_id,relation_type,method_id);

-- Only actionable consideration decisions; this partial index is NOT a proof gate.
CREATE INDEX IF NOT EXISTS atlas_variation_actionable
ON atlas_variation_ledger(method_id,subject_id,atom_id,recorded_at)
WHERE decision='TRIGGERED_INPUT_REVIEW_REQUIRED';

-- Cover dimension, scored trigger and method ID for source-only candidate discovery.
-- SQLite may still choose a different plan; check EXPLAIN QUERY PLAN.
CREATE INDEX IF NOT EXISTS atlas_trigger_strength_lookup
ON atlas_triggers(dimension,trigger_strength,method_id);
