// Host-owned, read-only Method Atlas view for MPC Workspace.
//
// The checked-in Atlas seed remains the source of this derived inventory. This
// wrapper deliberately builds a private in-memory SQLite projection for each
// Workspace service process: it never opens, repairs, or writes the persistent
// CLI cache and it never turns a catalog match into method execution.
import {DatabaseSync} from 'node:sqlite';
import {
  dbAdapter,
  loadMethodAtlas,
  statusMethodAtlas
} from '../scripts/method-atlas-cli.mjs';
import {routeMethodAtlas} from './method-atlas-router.mjs';

export const MPC_WORKSPACE_ATLAS_CANDIDATE_STATE = 'STRUCTURAL CANDIDATE · NOT EXECUTED';

const storageReceipt = Object.freeze({
  kind: 'SQLITE_MEMORY',
  locator: ':memory:',
  host_owned: true,
  persistent: false,
  canonical: false
});

function candidateRows(db) {
  const methods = db.prepare(`
    SELECT
      m.method_id,
      m.method_name,
      m.family,
      m.mechanism,
      m.required_input,
      m.falsifier,
      m.implementation_state,
      m.quantum_requirement,
      m.primary_source_id,
      m.provenance_state,
      s.title AS source_title,
      s.native_url AS source_native_url,
      s.source_class,
      s.review_state AS source_review_state,
      s.checked_on AS source_checked_on,
      c.classifier_id,
      c.question AS classifier_question,
      c.missing_evidence AS classifier_missing_evidence,
      c.falsifier AS classifier_falsifier,
      c.classifier_state
    FROM atlas_methods AS m
    JOIN atlas_sources AS s ON s.source_id = m.primary_source_id
    JOIN atlas_classifiers AS c ON c.method_id = m.method_id
    ORDER BY m.method_id
  `).all();
  const dimensions = new Map();
  for (const row of db.prepare(`
    SELECT method_id, dimension, trigger_strength
    FROM atlas_triggers
    ORDER BY method_id, trigger_strength DESC, dimension
  `).all()) {
    const values = dimensions.get(row.method_id) ?? [];
    values.push({dimension: row.dimension, trigger_strength: row.trigger_strength});
    dimensions.set(row.method_id, values);
  }
  const taxonomy = new Map();
  for (const row of db.prepare(`
    SELECT method_id, axis, class_key, classification_basis, review_state
    FROM atlas_method_taxonomy
    ORDER BY method_id, axis, class_key
  `).all()) {
    const values = taxonomy.get(row.method_id) ?? [];
    values.push({
      axis: row.axis,
      class_key: row.class_key,
      classification_basis: row.classification_basis,
      review_state: row.review_state
    });
    taxonomy.set(row.method_id, values);
  }
  return methods.map(row => ({
    method_id: row.method_id,
    method_name: row.method_name,
    family: row.family,
    mechanism: row.mechanism,
    required_input: row.required_input,
    falsifier: row.falsifier,
    implementation_state: row.implementation_state,
    quantum_requirement: row.quantum_requirement,
    primary_source_id: row.primary_source_id,
    provenance_state: row.provenance_state,
    dimensions: dimensions.get(row.method_id) ?? [],
    classifier: {
      classifier_id: row.classifier_id,
      question: row.classifier_question,
      missing_evidence: row.classifier_missing_evidence,
      falsifier: row.classifier_falsifier,
      classifier_state: row.classifier_state
    },
    source: {
      source_id: row.primary_source_id,
      title: row.source_title,
      native_url: row.source_native_url,
      source_class: row.source_class,
      review_state: row.source_review_state,
      checked_on: row.source_checked_on
    },
    taxonomy: taxonomy.get(row.method_id) ?? [],
    candidate_state: MPC_WORKSPACE_ATLAS_CANDIDATE_STATE,
    method_execution_performed: false,
    source_authentication: false,
    canonical_promotion: false
  }));
}

function facetRows(db) {
  const dimensions = db.prepare(`
    SELECT dimension AS value, COUNT(DISTINCT method_id) AS candidate_count
    FROM atlas_triggers
    GROUP BY dimension
    ORDER BY dimension
  `).all();
  const families = db.prepare(`
    SELECT family AS value, COUNT(*) AS candidate_count
    FROM atlas_methods
    GROUP BY family
    ORDER BY family
  `).all();
  const implementationStates = db.prepare(`
    SELECT implementation_state AS value, COUNT(*) AS candidate_count
    FROM atlas_methods
    GROUP BY implementation_state
    ORDER BY implementation_state
  `).all();
  const provenanceStates = db.prepare(`
    SELECT provenance_state AS value, COUNT(*) AS candidate_count
    FROM atlas_methods
    GROUP BY provenance_state
    ORDER BY provenance_state
  `).all();
  const sourceClasses = db.prepare(`
    SELECT source_class AS value, COUNT(*) AS source_count
    FROM atlas_sources
    GROUP BY source_class
    ORDER BY source_class
  `).all();
  const sourceReviewStates = db.prepare(`
    SELECT review_state AS value, COUNT(*) AS source_count
    FROM atlas_sources
    GROUP BY review_state
    ORDER BY review_state
  `).all();
  const taxonomy = db.prepare(`
    SELECT axis, class_key AS value, COUNT(DISTINCT method_id) AS candidate_count
    FROM atlas_method_taxonomy
    GROUP BY axis, class_key
    ORDER BY axis, class_key
  `).all();
  return {
    dimensions,
    families,
    implementation_states: implementationStates,
    provenance_states: provenanceStates,
    source_classes: sourceClasses,
    source_review_states: sourceReviewStates,
    taxonomy,
    domain_profiles: ['GENERAL', 'BUSINESS', 'GAMING']
  };
}

/**
 * Build the Workspace's bounded Method Atlas view.
 *
 * Every call owns a new `:memory:` database. The optional label is descriptive
 * only and cannot redirect storage or replace any Atlas source record.
 */
export function createMpcWorkspaceAtlas({label = 'MPC_WORKSPACE_HOST_MEMORY'} = {}) {
  if (typeof label !== 'string' || label.length === 0 || label.length > 80) {
    throw Error('INVALID_WORKSPACE_ATLAS_LABEL');
  }
  const db = new DatabaseSync(':memory:');
  let open = true;
  let initialStatus;
  let adapter;
  try {
    initialStatus = loadMethodAtlas(db);
    adapter = dbAdapter(db);
  } catch (error) {
    db.close();
    throw error;
  }

  const requireOpen = () => {
    if (!open) throw Error('MPC_WORKSPACE_ATLAS_CLOSED');
  };

  const status = () => {
    requireOpen();
    return {
      ...statusMethodAtlas(db),
      workspace_label: label,
      storage: storageReceipt,
      candidate_state: MPC_WORKSPACE_ATLAS_CANDIDATE_STATE,
      no_method_executed: true,
      source_authentication: false,
      canonical_promotion: false
    };
  };

  const candidates = () => {
    requireOpen();
    const rows = candidateRows(db);
    return {
      status: 'ATLAS_STRUCTURAL_INVENTORY',
      candidate_count: rows.length,
      candidates: rows,
      candidate_state: MPC_WORKSPACE_ATLAS_CANDIDATE_STATE,
      no_method_executed: true,
      source_authentication: false,
      canonical_promotion: false
    };
  };

  const facets = () => {
    requireOpen();
    return {
      status: 'ATLAS_STRUCTURAL_FACETS',
      ...facetRows(db),
      candidate_state: MPC_WORKSPACE_ATLAS_CANDIDATE_STATE,
      no_method_executed: true,
      canonical_promotion: false
    };
  };

  const inventory = () => {
    requireOpen();
    const verified = status();
    const sources = db.prepare(`
      SELECT source_id, title, native_url, source_class, review_state, checked_on
      FROM atlas_sources
      ORDER BY source_id
    `).all();
    return {
      status: 'ATLAS_STRUCTURAL_INVENTORY',
      atlas_version: verified.schema_version,
      counts: {
        methods: verified.methods,
        classifiers: verified.classifiers,
        sources: verified.sources,
        triggers: verified.triggers,
        proposed_crosswalk: verified.proposed_crosswalk,
        method_relations: verified.method_relations,
        taxonomy_tags: verified.taxonomy_tags
      },
      semantic_parity: verified.semantic_parity,
      sources,
      storage: storageReceipt,
      candidate_state: MPC_WORKSPACE_ATLAS_CANDIDATE_STATE,
      no_method_executed: true,
      source_authentication: false,
      canonical_promotion: false
    };
  };

  const route = async input => {
    requireOpen();
    const routed = await routeMethodAtlas(adapter, input);
    return {
      ...routed,
      selected_methods: routed.selected_methods.map(method => ({
        ...method,
        candidate_state: MPC_WORKSPACE_ATLAS_CANDIDATE_STATE
      })),
      candidate_state: MPC_WORKSPACE_ATLAS_CANDIDATE_STATE,
      workspace_atlas_storage: storageReceipt,
      no_method_executed: true,
      source_authentication: false,
      canonical_promotion: false
    };
  };

  const close = () => {
    if (!open) return false;
    open = false;
    db.close();
    return true;
  };

  return Object.freeze({
    initial_status: Object.freeze({
      ...initialStatus,
      storage: storageReceipt,
      candidate_state: MPC_WORKSPACE_ATLAS_CANDIDATE_STATE
    }),
    status,
    inventory,
    candidates,
    facets,
    route,
    close
  });
}
