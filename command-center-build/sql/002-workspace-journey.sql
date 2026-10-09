-- MPC Workspace journey state, schema version 2.
--
-- Apply only after the exact version-1 MPC Command Center schema has been
-- admitted. The owning adapter supplies the transaction, migration hashes and
-- PRAGMA user_version update. This migration never alters the identity-locked
-- Research Workbench database.

CREATE TABLE cc_migrations (
  schema_version INTEGER PRIMARY KEY NOT NULL CHECK(schema_version IN (1,2)),
  migration_name TEXT NOT NULL UNIQUE CHECK(length(migration_name)>0),
  migration_sha256 TEXT NOT NULL CHECK(length(migration_sha256)=64
    AND migration_sha256 NOT GLOB '*[^0-9a-f]*'),
  applied_at_utc TEXT NOT NULL
) STRICT;

CREATE TABLE cc_project_state (
  project_id TEXT PRIMARY KEY NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  retention_policy TEXT NOT NULL DEFAULT 'RETAIN_TEXT'
    CHECK(retention_policy IN ('RETAIN_TEXT','METADATA_ONLY')),
  selected_task_id TEXT,
  selected_provider_profile_id TEXT NOT NULL DEFAULT '',
  draft_text TEXT,
  draft_sha256 TEXT NOT NULL DEFAULT '' CHECK(draft_sha256=''
    OR (length(draft_sha256)=64 AND draft_sha256 NOT GLOB '*[^0-9a-f]*')),
  draft_bytes INTEGER NOT NULL DEFAULT 0 CHECK(draft_bytes>=0),
  updated_at_utc TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES cc_projects(project_id),
  FOREIGN KEY(project_id,selected_task_id) REFERENCES cc_tasks(project_id,task_id),
  CHECK((draft_sha256='' AND draft_bytes=0 AND draft_text IS NULL)
    OR (draft_sha256<>'' AND draft_bytes>=0)),
  CHECK(retention_policy='RETAIN_TEXT' OR draft_text IS NULL)
) STRICT, WITHOUT ROWID;

-- Version 1 had projects but no retention choice. Preserve those projects and
-- choose the only safe migration default: retain metadata, not unknown text.
INSERT INTO cc_project_state(project_id,objective,retention_policy,updated_at_utc)
SELECT project_id,'','METADATA_ONLY',created_at_utc FROM cc_projects;

CREATE TABLE cc_artifacts (
  project_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  artifact_kind TEXT NOT NULL CHECK(artifact_kind IN
    ('INPUT_TEXT','INPUT_FILE','SCREENSHOT','ROUTER_RECEIPT','MODEL_RECEIPT',
     'JOB_CHECKPOINT','REPORT','SCRIPT','SCRIPT_OUTPUT','SNAPSHOT_MANIFEST',
     'SNAPSHOT_COMPARISON','OTHER')),
  source_id TEXT,
  display_name TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(length(media_type)>0),
  artifact_ref TEXT NOT NULL CHECK(length(artifact_ref)>0 AND instr(artifact_ref,char(0))=0),
  artifact_sha256 TEXT NOT NULL CHECK(length(artifact_sha256)=64
    AND artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  artifact_bytes INTEGER NOT NULL CHECK(artifact_bytes>=0),
  representation_of_artifact_id TEXT,
  created_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,artifact_id),
  FOREIGN KEY(project_id) REFERENCES cc_projects(project_id),
  FOREIGN KEY(project_id,source_id) REFERENCES cc_sources(project_id,source_id),
  FOREIGN KEY(project_id,representation_of_artifact_id)
    REFERENCES cc_artifacts(project_id,artifact_id),
  CHECK(representation_of_artifact_id IS NULL OR representation_of_artifact_id<>artifact_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX cc_artifact_source ON cc_artifacts(project_id,source_id);

CREATE TABLE cc_job_inputs (
  project_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  input_kind TEXT NOT NULL CHECK(input_kind IN ('SOURCE','ARTIFACT')),
  source_id TEXT,
  artifact_id TEXT,
  ordinal INTEGER NOT NULL CHECK(ordinal>=0),
  PRIMARY KEY(project_id,job_id,input_kind,ordinal),
  FOREIGN KEY(project_id,job_id) REFERENCES cc_jobs(project_id,job_id),
  FOREIGN KEY(project_id,source_id) REFERENCES cc_sources(project_id,source_id),
  FOREIGN KEY(project_id,artifact_id) REFERENCES cc_artifacts(project_id,artifact_id),
  CHECK((input_kind='SOURCE' AND source_id IS NOT NULL AND artifact_id IS NULL)
     OR (input_kind='ARTIFACT' AND artifact_id IS NOT NULL AND source_id IS NULL))
) STRICT, WITHOUT ROWID;

CREATE TABLE cc_job_artifacts (
  project_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  artifact_role TEXT NOT NULL CHECK(artifact_role IN
    ('FULL_ROUTER_RECEIPT','MODEL_RESULT','CHECKPOINT','REPORT','SCRIPT','SCRIPT_OUTPUT','OTHER')),
  link_sequence INTEGER NOT NULL CHECK(link_sequence>0),
  PRIMARY KEY(project_id,job_id,artifact_id,artifact_role),
  UNIQUE(project_id,job_id,link_sequence),
  FOREIGN KEY(project_id,job_id) REFERENCES cc_jobs(project_id,job_id),
  FOREIGN KEY(project_id,artifact_id) REFERENCES cc_artifacts(project_id,artifact_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX cc_job_artifact_latest ON cc_job_artifacts
  (project_id,job_id,artifact_role,link_sequence DESC);

CREATE TABLE cc_job_checkpoints (
  project_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  checkpoint_sequence INTEGER NOT NULL CHECK(checkpoint_sequence>0),
  artifact_id TEXT NOT NULL,
  dependency_sha256 TEXT NOT NULL CHECK(length(dependency_sha256)=64
    AND dependency_sha256 NOT GLOB '*[^0-9a-f]*'),
  next_action TEXT NOT NULL,
  created_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,checkpoint_id),
  UNIQUE(project_id,job_id,checkpoint_sequence),
  FOREIGN KEY(project_id,job_id) REFERENCES cc_jobs(project_id,job_id),
  FOREIGN KEY(project_id,artifact_id) REFERENCES cc_artifacts(project_id,artifact_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX cc_checkpoint_job ON cc_job_checkpoints(project_id,job_id,checkpoint_sequence DESC);

CREATE TABLE cc_job_progress_events (
  project_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  action_label TEXT NOT NULL CHECK(length(action_label)>0),
  acquired_count INTEGER NOT NULL DEFAULT 0 CHECK(acquired_count>=0),
  analyzed_count INTEGER NOT NULL DEFAULT 0 CHECK(analyzed_count>=0),
  decided_count INTEGER NOT NULL DEFAULT 0 CHECK(decided_count>=0),
  completed_count INTEGER NOT NULL DEFAULT 0 CHECK(completed_count>=0),
  total_count INTEGER CHECK(total_count IS NULL OR total_count>=completed_count),
  PRIMARY KEY(project_id,event_id),
  FOREIGN KEY(project_id,event_id) REFERENCES cc_job_receipt_events(project_id,event_id),
  FOREIGN KEY(project_id,job_id) REFERENCES cc_jobs(project_id,job_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE cc_model_runs (
  project_id TEXT NOT NULL,
  model_run_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  connection_id TEXT,
  requested_provider TEXT NOT NULL,
  requested_model TEXT NOT NULL,
  requested_access_program TEXT NOT NULL DEFAULT '',
  observed_provider TEXT NOT NULL DEFAULT '',
  observed_model TEXT NOT NULL DEFAULT '',
  observed_access_program TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL CHECK(outcome IN ('COMPLETED','CANCELLED','INCOMPLETE','FAILED')),
  result_artifact_id TEXT,
  error_code TEXT NOT NULL DEFAULT '',
  first_token_ms INTEGER CHECK(first_token_ms IS NULL OR first_token_ms>=0),
  elapsed_ms INTEGER CHECK(elapsed_ms IS NULL OR elapsed_ms>=0),
  created_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,model_run_id),
  FOREIGN KEY(project_id,job_id) REFERENCES cc_jobs(project_id,job_id),
  FOREIGN KEY(project_id,connection_id) REFERENCES cc_connections(project_id,connection_id),
  FOREIGN KEY(project_id,result_artifact_id) REFERENCES cc_artifacts(project_id,artifact_id),
  CHECK((outcome='COMPLETED' AND result_artifact_id IS NOT NULL
    AND observed_provider<>'' AND observed_model<>'' AND error_code='')
    OR outcome<>'COMPLETED')
) STRICT, WITHOUT ROWID;
CREATE INDEX cc_model_job ON cc_model_runs(project_id,job_id);

CREATE TABLE cc_report_sources (
  project_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_role TEXT NOT NULL CHECK(source_role IN ('EVIDENCE','CONTEXT','FALSIFIER','LIMITATION')),
  PRIMARY KEY(project_id,report_id,source_id,source_role),
  FOREIGN KEY(project_id,report_id) REFERENCES cc_reports(project_id,report_id),
  FOREIGN KEY(project_id,source_id) REFERENCES cc_sources(project_id,source_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE cc_snapshots (
  project_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  manifest_artifact_id TEXT NOT NULL,
  comparison_scope_owner TEXT COLLATE BINARY NOT NULL,
  comparison_scope_namespace TEXT COLLATE BINARY NOT NULL,
  comparison_scope_id_type TEXT COLLATE BINARY NOT NULL,
  comparison_scope_id TEXT COLLATE BINARY NOT NULL,
  coverage_state TEXT NOT NULL CHECK(coverage_state IN
    ('COMPLETE','PARTIAL','UNAVAILABLE','UNREADABLE','NOT_ACQUIRED','ERROR')),
  captured_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,snapshot_id),
  FOREIGN KEY(project_id,source_id) REFERENCES cc_sources(project_id,source_id),
  FOREIGN KEY(project_id,manifest_artifact_id) REFERENCES cc_artifacts(project_id,artifact_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE cc_snapshot_entries (
  project_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  entry_kind TEXT NOT NULL CHECK(entry_kind IN ('NATIVE','ALIAS')),
  native_owner TEXT COLLATE BINARY NOT NULL,
  native_namespace TEXT COLLATE BINARY NOT NULL,
  native_id_type TEXT COLLATE BINARY NOT NULL,
  native_id TEXT COLLATE BINARY NOT NULL,
  native_version TEXT COLLATE BINARY NOT NULL DEFAULT '',
  content_sha256 TEXT NOT NULL DEFAULT '' CHECK(content_sha256=''
    OR (length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
  relative_locator TEXT COLLATE BINARY NOT NULL,
  availability TEXT NOT NULL CHECK(availability IN ('AVAILABLE','UNAVAILABLE','UNREADABLE','NOT_ACQUIRED','ERROR')),
  alias_target_entry_id TEXT,
  PRIMARY KEY(project_id,snapshot_id,entry_id),
  FOREIGN KEY(project_id,snapshot_id) REFERENCES cc_snapshots(project_id,snapshot_id),
  FOREIGN KEY(project_id,snapshot_id,alias_target_entry_id)
    REFERENCES cc_snapshot_entries(project_id,snapshot_id,entry_id),
  CHECK((entry_kind='NATIVE' AND alias_target_entry_id IS NULL)
    OR (entry_kind='ALIAS' AND alias_target_entry_id IS NOT NULL AND alias_target_entry_id<>entry_id))
) STRICT, WITHOUT ROWID;
CREATE INDEX cc_snapshot_native_identity ON cc_snapshot_entries
  (project_id,snapshot_id,native_owner,native_namespace,native_id_type,native_id);

CREATE TABLE cc_snapshot_comparisons (
  project_id TEXT NOT NULL,
  comparison_id TEXT NOT NULL,
  left_snapshot_id TEXT NOT NULL,
  right_snapshot_id TEXT NOT NULL,
  result_artifact_id TEXT NOT NULL,
  comparison_state TEXT NOT NULL CHECK(comparison_state IN ('COMPLETE','PARTIAL','BLOCKED')),
  created_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,comparison_id),
  FOREIGN KEY(project_id,left_snapshot_id) REFERENCES cc_snapshots(project_id,snapshot_id),
  FOREIGN KEY(project_id,right_snapshot_id) REFERENCES cc_snapshots(project_id,snapshot_id),
  FOREIGN KEY(project_id,result_artifact_id) REFERENCES cc_artifacts(project_id,artifact_id),
  CHECK(left_snapshot_id<>right_snapshot_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE cc_scripts (
  project_id TEXT NOT NULL,
  script_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  language TEXT NOT NULL CHECK(language IN ('POWERSHELL','PYTHON','SHELL')),
  script_state TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(script_state IN ('DRAFT','EXPORTED_FOR_MANUAL_RUN')),
  explanation TEXT NOT NULL,
  prerequisites TEXT NOT NULL,
  expected_output_schema TEXT NOT NULL,
  exported_at_utc TEXT,
  created_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,script_id),
  FOREIGN KEY(project_id,job_id) REFERENCES cc_jobs(project_id,job_id),
  FOREIGN KEY(project_id,artifact_id) REFERENCES cc_artifacts(project_id,artifact_id),
  CHECK((script_state='DRAFT' AND exported_at_utc IS NULL)
    OR (script_state='EXPORTED_FOR_MANUAL_RUN' AND exported_at_utc IS NOT NULL))
) STRICT, WITHOUT ROWID;

CREATE TABLE cc_script_outputs (
  project_id TEXT NOT NULL,
  output_id TEXT NOT NULL,
  script_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  supplied_host TEXT NOT NULL DEFAULT '',
  supplied_exit_status INTEGER,
  execution_basis TEXT NOT NULL CHECK(execution_basis IN
    ('USER_SUPPLIED_UNVERIFIED','AUTHORIZED_LOCAL_RECEIPT')),
  local_receipt_id TEXT,
  observed_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,output_id),
  FOREIGN KEY(project_id,script_id) REFERENCES cc_scripts(project_id,script_id),
  FOREIGN KEY(project_id,source_id) REFERENCES cc_sources(project_id,source_id),
  FOREIGN KEY(project_id,artifact_id) REFERENCES cc_artifacts(project_id,artifact_id),
  FOREIGN KEY(project_id,local_receipt_id) REFERENCES cc_operation_receipts(project_id,receipt_id),
  CHECK((execution_basis='USER_SUPPLIED_UNVERIFIED' AND local_receipt_id IS NULL)
    OR (execution_basis='AUTHORIZED_LOCAL_RECEIPT' AND local_receipt_id IS NOT NULL))
) STRICT, WITHOUT ROWID;

CREATE TABLE cc_folder_rules (
  project_id TEXT NOT NULL,
  mount_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_kind TEXT NOT NULL CHECK(rule_kind IN ('INCLUDE','EXCLUDE')),
  pattern TEXT COLLATE BINARY NOT NULL CHECK(length(pattern)>0 AND instr(pattern,char(0))=0),
  created_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,mount_id,rule_id),
  FOREIGN KEY(project_id,mount_id) REFERENCES cc_attached_folders(project_id,mount_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE cc_folder_scan_events (
  project_id TEXT NOT NULL,
  mount_id TEXT NOT NULL,
  scan_id TEXT NOT NULL,
  scan_event_id TEXT NOT NULL,
  scan_sequence INTEGER NOT NULL CHECK(scan_sequence>0),
  scan_state TEXT NOT NULL CHECK(scan_state IN ('RUNNING','COMPLETED','STOPPED','FAILED')),
  indexed_count INTEGER NOT NULL DEFAULT 0 CHECK(indexed_count>=0),
  pending_count INTEGER NOT NULL DEFAULT 0 CHECK(pending_count>=0),
  changed_count INTEGER NOT NULL DEFAULT 0 CHECK(changed_count>=0),
  unavailable_count INTEGER NOT NULL DEFAULT 0 CHECK(unavailable_count>=0),
  excluded_count INTEGER NOT NULL DEFAULT 0 CHECK(excluded_count>=0),
  observed_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,mount_id,scan_id,scan_event_id),
  UNIQUE(project_id,mount_id,scan_id,scan_sequence),
  FOREIGN KEY(project_id,mount_id) REFERENCES cc_attached_folders(project_id,mount_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE cc_connection_observations (
  project_id TEXT NOT NULL,
  observation_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  provider_surface TEXT NOT NULL,
  host_id TEXT COLLATE BINARY NOT NULL,
  account_id TEXT COLLATE BINARY NOT NULL,
  operation_name TEXT NOT NULL,
  observation_state TEXT NOT NULL CHECK(observation_state IN
    ('CONFIGURED','SUCCEEDED','FAILED','EXPIRED','UNAVAILABLE')),
  operation_receipt_id TEXT,
  error_code TEXT NOT NULL DEFAULT '',
  observed_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,observation_id),
  FOREIGN KEY(project_id,connection_id) REFERENCES cc_connections(project_id,connection_id),
  FOREIGN KEY(project_id,job_id) REFERENCES cc_jobs(project_id,job_id),
  FOREIGN KEY(project_id,operation_receipt_id) REFERENCES cc_operation_receipts(project_id,receipt_id),
  CHECK((observation_state='SUCCEEDED' AND operation_receipt_id IS NOT NULL AND error_code='')
     OR observation_state<>'SUCCEEDED')
) STRICT, WITHOUT ROWID;
CREATE INDEX cc_connection_observation_latest ON cc_connection_observations
  (project_id,connection_id,observed_at_utc DESC);

CREATE TRIGGER cc_migration_no_update BEFORE UPDATE ON cc_migrations
BEGIN SELECT RAISE(ABORT,'CC_MIGRATION_IMMUTABLE'); END;
CREATE TRIGGER cc_migration_no_delete BEFORE DELETE ON cc_migrations
BEGIN SELECT RAISE(ABORT,'CC_MIGRATION_IMMUTABLE'); END;

CREATE TRIGGER cc_source_pointer_identity_no_update BEFORE UPDATE ON cc_sources
WHEN OLD.project_id<>NEW.project_id OR OLD.source_id<>NEW.source_id
  OR OLD.source_owner<>NEW.source_owner OR OLD.source_namespace<>NEW.source_namespace
  OR OLD.native_id_type<>NEW.native_id_type OR OLD.native_id<>NEW.native_id
BEGIN SELECT RAISE(ABORT,'CC_SOURCE_IDENTITY_IMMUTABLE'); END;

-- A folder index can retain an exact path/version pointer before the user
-- selects that file's bytes for acquisition. Version 1 admitted only ACQUIRED
-- sources here, which forced bounded/skipped files to masquerade as acquired.
-- Keep every owner/namespace/version and native-receipt guard while admitting
-- the POINTER -> ACQUIRED transition already supported by cc_sources.
DROP TRIGGER cc_attached_file_admit_insert;
CREATE TRIGGER cc_attached_file_admit_insert BEFORE INSERT ON cc_attached_files
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM cc_sources s JOIN cc_attached_folders f
    ON f.project_id=s.project_id AND f.mount_id=NEW.mount_id
    WHERE s.project_id=NEW.project_id AND s.source_id=NEW.source_id
      AND s.source_namespace='LOCAL_FILESYSTEM' AND s.source_owner=f.host_id
      AND s.acquisition_state IN ('POINTER','ACQUIRED') AND f.connection_state<>'DETACHED'
      AND (s.native_version=NEW.file_version OR (s.native_version='' AND s.content_sha256=NEW.file_version)))
    THEN RAISE(ABORT,'CC_ATTACHED_FILE_REQUIRES_LOCAL_SOURCE_VERSION') END;
  SELECT CASE WHEN NEW.mapped_native_source_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cc_sources s JOIN cc_operation_receipts r
      ON r.project_id=s.project_id AND r.subject_source_id=s.source_id
    JOIN cc_connections c ON c.project_id=r.project_id AND c.connection_id=r.connection_id
    WHERE s.project_id=NEW.project_id AND s.source_id=NEW.mapped_native_source_id
      AND s.acquisition_state='ACQUIRED' AND s.source_namespace<>'LOCAL_FILESYSTEM'
      AND r.receipt_id=NEW.native_mapping_receipt_id AND r.receipt_origin='NATIVE_CONNECTOR'
      AND r.operation_kind='READ' AND r.operation_status='SUCCEEDED'
      AND c.provider_namespace=s.source_namespace)
    THEN RAISE(ABORT,'CC_FOLDER_NATIVE_ALIAS_REQUIRES_NATIVE_READ_RECEIPT') END;
END;

CREATE TRIGGER cc_artifact_no_update BEFORE UPDATE ON cc_artifacts
BEGIN SELECT RAISE(ABORT,'CC_ARTIFACT_IMMUTABLE'); END;
CREATE TRIGGER cc_artifact_no_delete BEFORE DELETE ON cc_artifacts
BEGIN SELECT RAISE(ABORT,'CC_ARTIFACT_IMMUTABLE'); END;

CREATE TRIGGER cc_event_terminal_guard BEFORE INSERT ON cc_job_receipt_events
WHEN coalesce((SELECT job_state FROM cc_job_receipt_events
  WHERE project_id=NEW.project_id AND job_id=NEW.job_id
  ORDER BY event_sequence DESC LIMIT 1),'') IN ('SUCCEEDED','FAILED','CANCELLED')
BEGIN SELECT RAISE(ABORT,'CC_JOB_TERMINAL'); END;

CREATE TRIGGER cc_event_transition_guard BEFORE INSERT ON cc_job_receipt_events
WHEN (NOT EXISTS (SELECT 1 FROM cc_job_receipt_events
        WHERE project_id=NEW.project_id AND job_id=NEW.job_id)
      AND NEW.job_state NOT IN ('QUEUED','RUNNING'))
  OR (EXISTS (SELECT 1 FROM cc_job_receipt_events
        WHERE project_id=NEW.project_id AND job_id=NEW.job_id)
      AND coalesce((SELECT job_state FROM cc_job_receipt_events
        WHERE project_id=NEW.project_id AND job_id=NEW.job_id
        ORDER BY event_sequence DESC LIMIT 1),'') NOT IN ('SUCCEEDED','FAILED','CANCELLED')
      AND NOT EXISTS (
        SELECT 1 FROM cc_job_receipt_events previous
        WHERE previous.project_id=NEW.project_id AND previous.job_id=NEW.job_id
          AND previous.event_sequence=(SELECT max(event_sequence) FROM cc_job_receipt_events
            WHERE project_id=NEW.project_id AND job_id=NEW.job_id)
          AND ((previous.job_state='QUEUED' AND NEW.job_state IN
                 ('QUEUED','RUNNING','BLOCKED','SUCCEEDED','FAILED','CANCELLED'))
            OR (previous.job_state='RUNNING' AND NEW.job_state IN
                 ('RUNNING','BLOCKED','SUCCEEDED','FAILED','CANCELLED'))
            OR (previous.job_state='BLOCKED' AND NEW.job_state IN
                 ('BLOCKED','RUNNING','FAILED','CANCELLED')))))
BEGIN SELECT RAISE(ABORT,'CC_JOB_STATE_TRANSITION_INVALID'); END;

CREATE TRIGGER cc_progress_no_update BEFORE UPDATE ON cc_job_progress_events
BEGIN SELECT RAISE(ABORT,'CC_PROGRESS_APPEND_ONLY'); END;
CREATE TRIGGER cc_progress_no_delete BEFORE DELETE ON cc_job_progress_events
BEGIN SELECT RAISE(ABORT,'CC_PROGRESS_APPEND_ONLY'); END;
CREATE TRIGGER cc_progress_job_guard BEFORE INSERT ON cc_job_progress_events
WHEN NOT EXISTS (SELECT 1 FROM cc_job_receipt_events event
  WHERE event.project_id=NEW.project_id AND event.event_id=NEW.event_id
    AND event.job_id=NEW.job_id)
BEGIN SELECT RAISE(ABORT,'CC_PROGRESS_EVENT_JOB_MISMATCH'); END;

CREATE TRIGGER cc_checkpoint_no_update BEFORE UPDATE ON cc_job_checkpoints
BEGIN SELECT RAISE(ABORT,'CC_CHECKPOINT_APPEND_ONLY'); END;
CREATE TRIGGER cc_checkpoint_no_delete BEFORE DELETE ON cc_job_checkpoints
BEGIN SELECT RAISE(ABORT,'CC_CHECKPOINT_APPEND_ONLY'); END;
CREATE TRIGGER cc_checkpoint_sequence_guard BEFORE INSERT ON cc_job_checkpoints
WHEN NEW.checkpoint_sequence<>coalesce((SELECT max(checkpoint_sequence)
  FROM cc_job_checkpoints WHERE project_id=NEW.project_id AND job_id=NEW.job_id),0)+1
BEGIN SELECT RAISE(ABORT,'CC_CHECKPOINT_SEQUENCE_INVALID'); END;

CREATE TRIGGER cc_model_run_no_update BEFORE UPDATE ON cc_model_runs
BEGIN SELECT RAISE(ABORT,'CC_MODEL_RUN_IMMUTABLE'); END;
CREATE TRIGGER cc_model_run_no_delete BEFORE DELETE ON cc_model_runs
BEGIN SELECT RAISE(ABORT,'CC_MODEL_RUN_IMMUTABLE'); END;

CREATE TRIGGER cc_report_source_no_update BEFORE UPDATE ON cc_report_sources
BEGIN SELECT RAISE(ABORT,'CC_REPORT_SOURCE_IMMUTABLE'); END;
CREATE TRIGGER cc_report_source_no_delete BEFORE DELETE ON cc_report_sources
BEGIN SELECT RAISE(ABORT,'CC_REPORT_SOURCE_IMMUTABLE'); END;

CREATE TRIGGER cc_snapshot_no_update BEFORE UPDATE ON cc_snapshots
BEGIN SELECT RAISE(ABORT,'CC_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER cc_snapshot_no_delete BEFORE DELETE ON cc_snapshots
BEGIN SELECT RAISE(ABORT,'CC_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER cc_snapshot_entry_no_update BEFORE UPDATE ON cc_snapshot_entries
BEGIN SELECT RAISE(ABORT,'CC_SNAPSHOT_ENTRY_IMMUTABLE'); END;
CREATE TRIGGER cc_snapshot_entry_no_delete BEFORE DELETE ON cc_snapshot_entries
BEGIN SELECT RAISE(ABORT,'CC_SNAPSHOT_ENTRY_IMMUTABLE'); END;
CREATE TRIGGER cc_snapshot_comparison_no_update BEFORE UPDATE ON cc_snapshot_comparisons
BEGIN SELECT RAISE(ABORT,'CC_SNAPSHOT_COMPARISON_IMMUTABLE'); END;
CREATE TRIGGER cc_snapshot_comparison_no_delete BEFORE DELETE ON cc_snapshot_comparisons
BEGIN SELECT RAISE(ABORT,'CC_SNAPSHOT_COMPARISON_IMMUTABLE'); END;

CREATE TRIGGER cc_script_identity_no_update BEFORE UPDATE ON cc_scripts
WHEN OLD.project_id<>NEW.project_id OR OLD.script_id<>NEW.script_id OR OLD.job_id<>NEW.job_id
  OR OLD.artifact_id<>NEW.artifact_id OR OLD.language<>NEW.language
  OR OLD.explanation<>NEW.explanation OR OLD.prerequisites<>NEW.prerequisites
  OR OLD.expected_output_schema<>NEW.expected_output_schema OR OLD.created_at_utc<>NEW.created_at_utc
BEGIN SELECT RAISE(ABORT,'CC_SCRIPT_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER cc_script_transition_guard BEFORE UPDATE ON cc_scripts
WHEN NOT (OLD.script_state='DRAFT' AND NEW.script_state='EXPORTED_FOR_MANUAL_RUN'
  AND OLD.exported_at_utc IS NULL AND NEW.exported_at_utc IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'CC_SCRIPT_STATE_TRANSITION_INVALID'); END;
CREATE TRIGGER cc_script_no_delete BEFORE DELETE ON cc_scripts
BEGIN SELECT RAISE(ABORT,'CC_SCRIPT_IMMUTABLE'); END;
CREATE TRIGGER cc_script_output_no_update BEFORE UPDATE ON cc_script_outputs
BEGIN SELECT RAISE(ABORT,'CC_SCRIPT_OUTPUT_APPEND_ONLY'); END;
CREATE TRIGGER cc_script_output_no_delete BEFORE DELETE ON cc_script_outputs
BEGIN SELECT RAISE(ABORT,'CC_SCRIPT_OUTPUT_APPEND_ONLY'); END;

CREATE TRIGGER cc_folder_rule_no_update BEFORE UPDATE ON cc_folder_rules
BEGIN SELECT RAISE(ABORT,'CC_FOLDER_RULE_IMMUTABLE'); END;
CREATE TRIGGER cc_folder_rule_no_delete BEFORE DELETE ON cc_folder_rules
BEGIN SELECT RAISE(ABORT,'CC_FOLDER_RULE_IMMUTABLE'); END;
CREATE TRIGGER cc_folder_scan_no_update BEFORE UPDATE ON cc_folder_scan_events
BEGIN SELECT RAISE(ABORT,'CC_FOLDER_SCAN_APPEND_ONLY'); END;
CREATE TRIGGER cc_folder_scan_no_delete BEFORE DELETE ON cc_folder_scan_events
BEGIN SELECT RAISE(ABORT,'CC_FOLDER_SCAN_APPEND_ONLY'); END;
CREATE TRIGGER cc_folder_scan_sequence_guard BEFORE INSERT ON cc_folder_scan_events
WHEN NEW.scan_sequence<>coalesce((SELECT max(scan_sequence) FROM cc_folder_scan_events
  WHERE project_id=NEW.project_id AND mount_id=NEW.mount_id AND scan_id=NEW.scan_id),0)+1
  OR coalesce((SELECT scan_state FROM cc_folder_scan_events
    WHERE project_id=NEW.project_id AND mount_id=NEW.mount_id AND scan_id=NEW.scan_id
    ORDER BY scan_sequence DESC LIMIT 1),'') IN ('COMPLETED','STOPPED','FAILED')
BEGIN SELECT RAISE(ABORT,'CC_FOLDER_SCAN_SEQUENCE_INVALID'); END;

CREATE TRIGGER cc_connection_observation_no_update BEFORE UPDATE ON cc_connection_observations
BEGIN SELECT RAISE(ABORT,'CC_CONNECTION_OBSERVATION_APPEND_ONLY'); END;
CREATE TRIGGER cc_connection_observation_no_delete BEFORE DELETE ON cc_connection_observations
BEGIN SELECT RAISE(ABORT,'CC_CONNECTION_OBSERVATION_APPEND_ONLY'); END;
CREATE TRIGGER cc_connection_observation_success_guard BEFORE INSERT ON cc_connection_observations
WHEN NEW.observation_state='SUCCEEDED' AND NOT EXISTS (
  SELECT 1 FROM cc_operation_receipts receipt
  WHERE receipt.project_id=NEW.project_id AND receipt.receipt_id=NEW.operation_receipt_id
    AND receipt.job_id=NEW.job_id AND receipt.connection_id=NEW.connection_id
    AND receipt.operation_status='SUCCEEDED')
BEGIN SELECT RAISE(ABORT,'CC_CONNECTION_SUCCESS_REQUIRES_MATCHING_RECEIPT'); END;
