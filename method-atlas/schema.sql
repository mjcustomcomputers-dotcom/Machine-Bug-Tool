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
