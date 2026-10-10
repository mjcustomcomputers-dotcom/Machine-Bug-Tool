-- MPC Command Center: additive, separate-database starter, schema version 1.
-- SQLite >= 3.37 with its built-in JSON functions. No dependency installation.
-- Allocate a NEW command-center database; NEVER run this against Workbench,
-- the Method Atlas cache, a native controller, or another production database.
-- Workbench fingerprints every schema object and binds its DB to its bundle.
--
-- A caller must enable PRAGMA foreign_keys=ON on EVERY connection, before a
-- transaction. After admitting/initializing this separate file, configure
-- PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000.
-- WAL is intentionally not set here before the database identity check.
-- On any initialization error, ROLLBACK and close; never delete/recreate a
-- database to hide the failure. Reapplying this version is idempotent, but is
-- not a substitute for the owning application's schema/manifest admission.
--
-- All native IDs must be bound as strings. TEXT/BINARY identity preserves
-- leading zeros, case, owner, namespace, ID type, and native version. An empty
-- version/hash means unavailable, never "latest" or verified. Hashes compare
-- bytes; database constraints do not authenticate evidence or remote receipts.
-- No credential-value columns or arbitrary connector configuration JSON are
-- present. secret_store_ref contains ONLY an OS secret-store locator. The
-- eventual application must also reject/redact credentials in all free text.
-- Receipt append-only controls protect normal SQL operations, not a user who
-- controls the database file or can disable/drop constraints and triggers.
--
-- Full-text search is OPTIONAL and absent from this migration. If the runtime
-- already supports FTS5, an explicitly requested temporary search index may
-- be built ONLY from cc_retained_documents, restricted to the active project,
-- and discarded after use. Never load/install an extension automatically.

PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
BEGIN IMMEDIATE;

CREATE TEMP TABLE cc_migration_guard (stage INTEGER NOT NULL);
CREATE TEMP TRIGGER cc_migration_preflight
BEFORE INSERT ON cc_migration_guard WHEN NEW.stage=1
BEGIN
  SELECT CASE WHEN
    (SELECT application_id FROM pragma_application_id) NOT IN (0, 0x4d504343)
    OR ((SELECT application_id FROM pragma_application_id)=0 AND (
      (SELECT user_version FROM pragma_user_version)<>0
      OR EXISTS (SELECT 1 FROM main.sqlite_schema WHERE name NOT LIKE 'sqlite_%')
    ))
    OR ((SELECT application_id FROM pragma_application_id)=0x4d504343 AND (
      (SELECT user_version FROM pragma_user_version)<>1
      OR NOT EXISTS (SELECT 1 FROM main.sqlite_schema WHERE type='table' AND name='cc_schema')
      OR EXISTS (SELECT 1 FROM main.sqlite_schema
                 WHERE name NOT LIKE 'sqlite_%' AND name NOT GLOB 'cc_*')
    ))
  THEN RAISE(ABORT, 'CC_SEPARATE_DATABASE_OR_VERSION_REQUIRED') END;
END;
INSERT INTO cc_migration_guard VALUES (1);

CREATE TABLE IF NOT EXISTS cc_schema (
  schema_name TEXT PRIMARY KEY NOT NULL CHECK(schema_name='MPC_COMMAND_CENTER'),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  applied_at_utc TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
INSERT INTO cc_schema(schema_name,schema_version)
SELECT 'MPC_COMMAND_CENTER',1
WHERE (SELECT application_id FROM pragma_application_id)=0;

CREATE TEMP TRIGGER cc_migration_metadata
BEFORE INSERT ON cc_migration_guard WHEN NEW.stage=2
BEGIN
  SELECT CASE WHEN (SELECT count(*) FROM cc_schema)<>1 OR NOT EXISTS (
    SELECT 1 FROM cc_schema WHERE schema_name='MPC_COMMAND_CENTER' AND schema_version=1
  ) THEN RAISE(ABORT, 'CC_SCHEMA_METADATA_MISMATCH') END;
END;
INSERT INTO cc_migration_guard VALUES (2);

CREATE TABLE IF NOT EXISTS cc_projects (
  project_id TEXT PRIMARY KEY NOT NULL CHECK(length(project_id)>0),
  display_name TEXT NOT NULL CHECK(length(display_name)>0),
  created_at_utc TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS cc_sources (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL CHECK(length(source_id)>0),
  source_owner TEXT COLLATE BINARY NOT NULL CHECK(length(source_owner)>0),
  source_namespace TEXT COLLATE BINARY NOT NULL CHECK(length(source_namespace)>0),
  native_id_type TEXT COLLATE BINARY NOT NULL CHECK(length(native_id_type)>0),
  native_id TEXT COLLATE BINARY NOT NULL CHECK(length(native_id)>0),
  native_version TEXT COLLATE BINARY NOT NULL DEFAULT '',
  content_sha256 TEXT NOT NULL DEFAULT '' CHECK(content_sha256='' OR
    (length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^0-9a-f]*')),
  acquisition_state TEXT NOT NULL DEFAULT 'POINTER' CHECK(acquisition_state IN ('POINTER','ACQUIRED')),
  acquired_at_utc TEXT,
  PRIMARY KEY(project_id,source_id),
  UNIQUE(project_id,source_owner,source_namespace,native_id_type,native_id,native_version,content_sha256),
  FOREIGN KEY(project_id) REFERENCES cc_projects(project_id),
  CHECK((acquisition_state='POINTER' AND acquired_at_utc IS NULL) OR
    (acquisition_state='ACQUIRED' AND acquired_at_utc IS NOT NULL
      AND (native_version<>'' OR content_sha256<>'')))
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS cc_source_aliases (
  project_id TEXT NOT NULL,
  alias_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  alias_owner TEXT COLLATE BINARY NOT NULL CHECK(length(alias_owner)>0),
  alias_namespace TEXT COLLATE BINARY NOT NULL CHECK(length(alias_namespace)>0),
  alias_native_id_type TEXT COLLATE BINARY NOT NULL CHECK(length(alias_native_id_type)>0),
  alias_native_id TEXT COLLATE BINARY NOT NULL CHECK(length(alias_native_id)>0),
  alias_version TEXT COLLATE BINARY NOT NULL DEFAULT '',
  alias_kind TEXT NOT NULL CHECK(alias_kind IN ('SEARCH_INDEX','MIRROR','SHORTCUT')),
  PRIMARY KEY(project_id,alias_id),
  UNIQUE(project_id,alias_owner,alias_namespace,alias_native_id_type,alias_native_id,alias_version),
  FOREIGN KEY(project_id,source_id) REFERENCES cc_sources(project_id,source_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS cc_alias_source ON cc_source_aliases(project_id,source_id);

-- One row per acquired native snapshot, regardless of alias count. This view
-- is not a count of independent witnesses or corroborated propositions.
CREATE VIEW IF NOT EXISTS cc_evidence_units AS
SELECT project_id,source_id,source_owner,source_namespace,native_id_type,
       native_id,native_version,content_sha256
FROM cc_sources WHERE acquisition_state='ACQUIRED';

CREATE TABLE IF NOT EXISTS cc_atoms (
  project_id TEXT NOT NULL,
  atom_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_locator TEXT NOT NULL CHECK(length(source_locator)>0),
  atom_type_namespace TEXT NOT NULL CHECK(length(atom_type_namespace)>0),
  atom_type_id_type TEXT NOT NULL CHECK(atom_type_id_type IN ('string','integer')),
  atom_type_id TEXT NOT NULL CHECK(length(atom_type_id)>0),
  value_type TEXT NOT NULL CHECK(value_type IN ('STRING','NUMBER','BOOLEAN','NULL','OBJECT','ARRAY')),
  value_json TEXT NOT NULL CHECK(json_valid(value_json)),
  -- Preserve each source contract's state namespace/value without merging its
  -- vocabulary with another contract. ADOPTED needs external adoption provenance.
  evidence_state_namespace TEXT NOT NULL CHECK(length(evidence_state_namespace)>0),
  evidence_state TEXT NOT NULL CHECK(length(evidence_state)>0),
  PRIMARY KEY(project_id,atom_id),
  FOREIGN KEY(project_id,source_id) REFERENCES cc_sources(project_id,source_id),
  CHECK(CASE WHEN atom_type_id_type='string' THEN 1
    WHEN json_valid(atom_type_id) THEN json_type(atom_type_id)='integer'
    ELSE 0 END),
  CHECK(CASE value_type
    WHEN 'STRING' THEN json_type(value_json)='text'
    WHEN 'NUMBER' THEN json_type(value_json) IN ('integer','real')
    WHEN 'BOOLEAN' THEN json_type(value_json) IN ('true','false')
    WHEN 'NULL' THEN json_type(value_json)='null'
    WHEN 'OBJECT' THEN json_type(value_json)='object'
    WHEN 'ARRAY' THEN json_type(value_json)='array'
    ELSE 0 END)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS cc_atom_source ON cc_atoms(project_id,source_id);

CREATE TABLE IF NOT EXISTS cc_atom_dependencies (
  project_id TEXT NOT NULL,
  atom_id TEXT NOT NULL,
  depends_on_atom_id TEXT NOT NULL,
  relation_namespace TEXT NOT NULL CHECK(length(relation_namespace)>0),
  relation_type TEXT NOT NULL CHECK(length(relation_type)>0),
  PRIMARY KEY(project_id,atom_id,depends_on_atom_id,relation_namespace,relation_type),
  FOREIGN KEY(project_id,atom_id) REFERENCES cc_atoms(project_id,atom_id),
  FOREIGN KEY(project_id,depends_on_atom_id) REFERENCES cc_atoms(project_id,atom_id),
  CHECK(atom_id<>depends_on_atom_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS cc_dependency_reverse ON cc_atom_dependencies(project_id,depends_on_atom_id);

CREATE TABLE IF NOT EXISTS cc_tasks (
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title)>0),
  work_phase_namespace TEXT NOT NULL CHECK(length(work_phase_namespace)>0),
  work_phase TEXT NOT NULL CHECK(length(work_phase)>0),
  task_state TEXT NOT NULL DEFAULT 'OPEN' CHECK(task_state IN
    ('OPEN','IN_PROGRESS','BLOCKED','COMPLETE','CANCELLED')),
  next_action TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(project_id,task_id),
  FOREIGN KEY(project_id) REFERENCES cc_projects(project_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS cc_jobs (
  project_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  operation_name TEXT NOT NULL CHECK(length(operation_name)>0),
  idempotency_key TEXT COLLATE BINARY NOT NULL CHECK(length(idempotency_key)>0),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256)=64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,job_id),
  UNIQUE(project_id,idempotency_key),
  FOREIGN KEY(project_id,task_id) REFERENCES cc_tasks(project_id,task_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS cc_job_task ON cc_jobs(project_id,task_id);

CREATE TABLE IF NOT EXISTS cc_connections (
  project_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  provider_namespace TEXT NOT NULL CHECK(length(provider_namespace)>0),
  transport TEXT NOT NULL CHECK(transport IN
    ('PLUGIN','HTTPS_MCP','STDIO_MCP','SECURE_MCP_TUNNEL','OPENAI_API','OLLAMA','CODEX_STDIO')),
  endpoint_ref TEXT NOT NULL CHECK(length(endpoint_ref)>0
    AND instr(endpoint_ref,'@')=0 AND instr(endpoint_ref,'?')=0 AND instr(endpoint_ref,'#')=0),
  secret_store_ref TEXT CHECK(secret_store_ref IS NULL OR
    (secret_store_ref GLOB 'os-secret://?*' AND instr(secret_store_ref,'?')=0
      AND instr(secret_store_ref,'#')=0 AND instr(secret_store_ref,'@')=0)),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  PRIMARY KEY(project_id,connection_id),
  FOREIGN KEY(project_id) REFERENCES cc_projects(project_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS cc_operation_receipts (
  project_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  subject_source_id TEXT,
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('READ','SEARCH','WRITE','DRAFT','SEND','SUBMIT')),
  operation_status TEXT NOT NULL CHECK(operation_status IN ('ATTEMPTED','ACKNOWLEDGED','SUCCEEDED','FAILED')),
  receipt_origin TEXT NOT NULL CHECK(receipt_origin IN ('LOCAL','NATIVE_CONNECTOR')),
  native_receipt_ref TEXT,
  receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256)=64 AND receipt_sha256 NOT GLOB '*[^0-9a-f]*'),
  observed_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,receipt_id),
  UNIQUE(project_id,receipt_id,job_id,connection_id),
  FOREIGN KEY(project_id,job_id) REFERENCES cc_jobs(project_id,job_id),
  FOREIGN KEY(project_id,connection_id) REFERENCES cc_connections(project_id,connection_id),
  FOREIGN KEY(project_id,subject_source_id) REFERENCES cc_sources(project_id,source_id),
  CHECK(receipt_origin<>'NATIVE_CONNECTOR' OR
    (native_receipt_ref IS NOT NULL AND length(native_receipt_ref)>0))
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS cc_operation_job ON cc_operation_receipts(project_id,job_id);
CREATE INDEX IF NOT EXISTS cc_operation_connection ON cc_operation_receipts(project_id,connection_id);
CREATE INDEX IF NOT EXISTS cc_operation_subject ON cc_operation_receipts(project_id,subject_source_id);
CREATE UNIQUE INDEX IF NOT EXISTS cc_native_receipt_dedupe ON cc_operation_receipts
  (project_id,connection_id,native_receipt_ref,receipt_sha256) WHERE receipt_origin='NATIVE_CONNECTOR';

CREATE TABLE IF NOT EXISTS cc_job_receipt_events (
  project_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  event_sequence INTEGER NOT NULL CHECK(event_sequence>0),
  job_state TEXT NOT NULL CHECK(job_state IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','BLOCKED','CANCELLED')),
  fact_summary TEXT NOT NULL,
  operation_receipt_id TEXT,
  observed_at_utc TEXT NOT NULL,
  PRIMARY KEY(project_id,event_id),
  UNIQUE(project_id,job_id,event_sequence),
  FOREIGN KEY(project_id,job_id) REFERENCES cc_jobs(project_id,job_id),
  FOREIGN KEY(project_id,operation_receipt_id) REFERENCES cc_operation_receipts(project_id,receipt_id)
) STRICT, WITHOUT ROWID;

-- A job has QUEUED state until an explicit event is recorded. A local job's
-- SUCCEEDED event is not an external send/write receipt.
CREATE VIEW IF NOT EXISTS cc_job_state AS
SELECT j.*,coalesce((SELECT e.job_state FROM cc_job_receipt_events e
  WHERE e.project_id=j.project_id AND e.job_id=j.job_id
  ORDER BY e.event_sequence DESC LIMIT 1),'QUEUED') AS job_state
FROM cc_jobs j;

CREATE TABLE IF NOT EXISTS cc_reports (
  project_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artifact_ref TEXT NOT NULL CHECK(length(artifact_ref)>0),
  artifact_sha256 TEXT NOT NULL CHECK(length(artifact_sha256)=64 AND artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  artifact_kind TEXT NOT NULL DEFAULT 'REPORT' CHECK(artifact_kind IN ('REPORT','SCRIPT_DRAFT','NOTEBOOK','DATA_EXPORT')),
  report_state TEXT NOT NULL DEFAULT 'DRAFT' CHECK(report_state IN ('DRAFT','READY')),
  PRIMARY KEY(project_id,report_id),
  FOREIGN KEY(project_id,job_id) REFERENCES cc_jobs(project_id,job_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS cc_report_job ON cc_reports(project_id,job_id);

CREATE TABLE IF NOT EXISTS cc_outbox (
  project_id TEXT NOT NULL,
  outbox_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  -- SENT records successful completion of this exact native action. A WRITE
  -- upload receipt makes no claim that a message or bounty report was submitted.
  delivery_kind TEXT NOT NULL CHECK(delivery_kind IN ('SEND','SUBMIT','WRITE')),
  outbox_state TEXT NOT NULL DEFAULT 'QUEUED' CHECK(outbox_state IN
    ('DRAFT','QUEUED','IN_FLIGHT','UNKNOWN_DELIVERY','SENT','FAILED','CANCELLED')),
  operation_receipt_id TEXT,
  sent_at_utc TEXT,
  PRIMARY KEY(project_id,outbox_id),
  UNIQUE(project_id,job_id),
  FOREIGN KEY(project_id,report_id) REFERENCES cc_reports(project_id,report_id),
  FOREIGN KEY(project_id,job_id) REFERENCES cc_jobs(project_id,job_id),
  FOREIGN KEY(project_id,connection_id) REFERENCES cc_connections(project_id,connection_id),
  FOREIGN KEY(project_id,operation_receipt_id,job_id,connection_id)
    REFERENCES cc_operation_receipts(project_id,receipt_id,job_id,connection_id),
  CHECK((outbox_state='SENT' AND operation_receipt_id IS NOT NULL AND sent_at_utc IS NOT NULL) OR
        (outbox_state<>'SENT' AND sent_at_utc IS NULL))
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS cc_outbox_report ON cc_outbox(project_id,report_id);
CREATE INDEX IF NOT EXISTS cc_outbox_connection ON cc_outbox(project_id,connection_id);
CREATE INDEX IF NOT EXISTS cc_outbox_receipt ON cc_outbox(project_id,operation_receipt_id,job_id,connection_id);

-- Insert content only after an explicit retention decision. Other tables
-- retain pointers/hashes. Deletion of retained text remains possible.
CREATE TABLE IF NOT EXISTS cc_retained_documents (
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  retention_authorization_ref TEXT NOT NULL CHECK(length(retention_authorization_ref)>0),
  retained_text TEXT NOT NULL,
  text_sha256 TEXT NOT NULL CHECK(length(text_sha256)=64 AND text_sha256 NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(project_id,document_id),
  FOREIGN KEY(project_id,source_id) REFERENCES cc_sources(project_id,source_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS cc_document_source ON cc_retained_documents(project_id,source_id);

-- "Attached folders" is a host-scoped index/snapshot registration, not a
-- filesystem mount command. These tables never move, scan or delete originals.
-- Root locators are exact host paths. The file locator uses normalized relative
-- '/' separators; the scanner must separately resolve/reject symlink escapes.
-- A synced folder is LOCAL_FILESYSTEM evidence until a source-bound successful
-- native READ receipt supports its optional native-source alias fields.
CREATE TABLE IF NOT EXISTS cc_attached_folders (
  project_id TEXT NOT NULL,
  mount_id TEXT NOT NULL,
  host_id TEXT COLLATE BINARY NOT NULL CHECK(length(host_id)>0),
  root_locator TEXT COLLATE BINARY NOT NULL CHECK(length(root_locator)>0 AND instr(root_locator,char(0))=0),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('LOCAL_FOLDER','SYNCED_FOLDER','REMOVABLE','NETWORK_SHARE')),
  attachment_mode TEXT NOT NULL CHECK(attachment_mode IN ('INDEX_IN_PLACE','SNAPSHOT')),
  include_subfolders INTEGER NOT NULL DEFAULT 1 CHECK(include_subfolders IN (0,1)),
  connection_state TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK(connection_state IN ('UNVERIFIED','ONLINE','OFFLINE','DETACHED')),
  index_state TEXT NOT NULL DEFAULT 'NOT_INDEXED' CHECK(index_state IN ('NOT_INDEXED','INDEXING','CURRENT','STALE','ERROR','DETACHED')),
  detach_index_policy TEXT NOT NULL DEFAULT 'KEEP_HISTORY' CHECK(detach_index_policy IN ('KEEP_HISTORY','PURGE_INDEX')),
  detached_at_utc TEXT,
  PRIMARY KEY(project_id,mount_id),
  FOREIGN KEY(project_id) REFERENCES cc_projects(project_id),
  CHECK((connection_state='DETACHED' AND index_state='DETACHED' AND detached_at_utc IS NOT NULL)
     OR (connection_state<>'DETACHED' AND index_state<>'DETACHED' AND detached_at_utc IS NULL))
) STRICT, WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS cc_attached_files (
  project_id TEXT NOT NULL,
  mount_id TEXT NOT NULL,
  relative_locator TEXT COLLATE BINARY NOT NULL CHECK(length(relative_locator)>0
    AND substr(relative_locator,1,1)<>'/' AND instr(relative_locator,char(92))=0
    AND instr(relative_locator,':')=0 AND instr(relative_locator,char(0))=0
    AND instr('/'||relative_locator||'/','/../')=0
    AND instr('/'||relative_locator||'/','/./')=0
    AND instr('/'||relative_locator||'/','//')=0),
  file_version TEXT COLLATE BINARY NOT NULL CHECK(length(file_version)>0),
  source_id TEXT NOT NULL,
  file_state TEXT NOT NULL DEFAULT 'PRESENT' CHECK(file_state IN ('PRESENT','MISSING','UNREADABLE')),
  observed_at_utc TEXT NOT NULL,
  mapped_native_source_id TEXT,
  native_mapping_receipt_id TEXT,
  PRIMARY KEY(project_id,mount_id,relative_locator,file_version),
  FOREIGN KEY(project_id,mount_id) REFERENCES cc_attached_folders(project_id,mount_id),
  FOREIGN KEY(project_id,source_id) REFERENCES cc_sources(project_id,source_id),
  FOREIGN KEY(project_id,mapped_native_source_id) REFERENCES cc_sources(project_id,source_id),
  FOREIGN KEY(project_id,native_mapping_receipt_id) REFERENCES cc_operation_receipts(project_id,receipt_id),
  CHECK((mapped_native_source_id IS NULL AND native_mapping_receipt_id IS NULL)
     OR (mapped_native_source_id IS NOT NULL AND native_mapping_receipt_id IS NOT NULL))
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS cc_attached_file_source ON cc_attached_files(project_id,source_id);
CREATE INDEX IF NOT EXISTS cc_attached_file_native ON cc_attached_files(project_id,mapped_native_source_id);
CREATE INDEX IF NOT EXISTS cc_attached_file_receipt ON cc_attached_files(project_id,native_mapping_receipt_id);

CREATE TRIGGER IF NOT EXISTS cc_schema_no_update BEFORE UPDATE ON cc_schema
BEGIN SELECT RAISE(ABORT,'CC_SCHEMA_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS cc_schema_no_delete BEFORE DELETE ON cc_schema
BEGIN SELECT RAISE(ABORT,'CC_SCHEMA_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS cc_schema_no_replace BEFORE INSERT ON cc_schema
WHEN EXISTS (SELECT 1 FROM cc_schema)
BEGIN SELECT RAISE(ABORT,'CC_SCHEMA_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS cc_source_acquired_no_update BEFORE UPDATE ON cc_sources
WHEN OLD.acquisition_state='ACQUIRED'
BEGIN SELECT RAISE(ABORT,'CC_ACQUIRED_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS cc_source_no_replace BEFORE INSERT ON cc_sources
WHEN EXISTS (SELECT 1 FROM cc_sources WHERE project_id=NEW.project_id AND source_id=NEW.source_id)
BEGIN SELECT RAISE(ABORT,'CC_SOURCE_ID_CONFLICT'); END;

CREATE TRIGGER IF NOT EXISTS cc_job_no_update BEFORE UPDATE ON cc_jobs
BEGIN SELECT RAISE(ABORT,'CC_JOB_REQUEST_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS cc_job_no_delete BEFORE DELETE ON cc_jobs
BEGIN SELECT RAISE(ABORT,'CC_JOB_REQUEST_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS cc_job_no_replace BEFORE INSERT ON cc_jobs
WHEN EXISTS (SELECT 1 FROM cc_jobs WHERE project_id=NEW.project_id
  AND (job_id=NEW.job_id OR idempotency_key=NEW.idempotency_key))
BEGIN SELECT RAISE(ABORT,'CC_JOB_IDEMPOTENCY_CONFLICT'); END;

-- Referenced configuration/report snapshots retain their original meaning.
-- Editing a used configuration or report creates a new ID/version in the app.
CREATE TRIGGER IF NOT EXISTS cc_connection_used_no_update BEFORE UPDATE ON cc_connections
WHEN EXISTS (SELECT 1 FROM cc_operation_receipts WHERE project_id=OLD.project_id AND connection_id=OLD.connection_id)
  OR EXISTS (SELECT 1 FROM cc_outbox WHERE project_id=OLD.project_id AND connection_id=OLD.connection_id)
BEGIN SELECT RAISE(ABORT,'CC_USED_CONNECTION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS cc_connection_used_no_replace BEFORE INSERT ON cc_connections
WHEN EXISTS (SELECT 1 FROM cc_operation_receipts WHERE project_id=NEW.project_id AND connection_id=NEW.connection_id)
  OR EXISTS (SELECT 1 FROM cc_outbox WHERE project_id=NEW.project_id AND connection_id=NEW.connection_id)
BEGIN SELECT RAISE(ABORT,'CC_USED_CONNECTION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS cc_report_used_no_update BEFORE UPDATE ON cc_reports
WHEN EXISTS (SELECT 1 FROM cc_outbox WHERE project_id=OLD.project_id AND report_id=OLD.report_id)
BEGIN SELECT RAISE(ABORT,'CC_USED_REPORT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS cc_report_used_no_replace BEFORE INSERT ON cc_reports
WHEN EXISTS (SELECT 1 FROM cc_outbox WHERE project_id=NEW.project_id AND report_id=NEW.report_id)
BEGIN SELECT RAISE(ABORT,'CC_USED_REPORT_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS cc_operation_no_update BEFORE UPDATE ON cc_operation_receipts
BEGIN SELECT RAISE(ABORT,'CC_RECEIPT_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS cc_operation_no_delete BEFORE DELETE ON cc_operation_receipts
BEGIN SELECT RAISE(ABORT,'CC_RECEIPT_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS cc_operation_no_replace BEFORE INSERT ON cc_operation_receipts
WHEN EXISTS (SELECT 1 FROM cc_operation_receipts WHERE project_id=NEW.project_id AND receipt_id=NEW.receipt_id)
  OR EXISTS (SELECT 1 FROM cc_operation_receipts WHERE receipt_origin='NATIVE_CONNECTOR'
    AND NEW.receipt_origin='NATIVE_CONNECTOR' AND project_id=NEW.project_id
    AND connection_id=NEW.connection_id AND native_receipt_ref=NEW.native_receipt_ref
    AND receipt_sha256=NEW.receipt_sha256)
BEGIN SELECT RAISE(ABORT,'CC_RECEIPT_APPEND_ONLY'); END;

CREATE TRIGGER IF NOT EXISTS cc_event_no_update BEFORE UPDATE ON cc_job_receipt_events
BEGIN SELECT RAISE(ABORT,'CC_EVENT_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS cc_event_no_delete BEFORE DELETE ON cc_job_receipt_events
BEGIN SELECT RAISE(ABORT,'CC_EVENT_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS cc_event_insert BEFORE INSERT ON cc_job_receipt_events
BEGIN
  SELECT CASE WHEN EXISTS (SELECT 1 FROM cc_job_receipt_events
    WHERE project_id=NEW.project_id AND event_id=NEW.event_id)
    OR NEW.event_sequence<>coalesce((SELECT max(event_sequence) FROM cc_job_receipt_events
      WHERE project_id=NEW.project_id AND job_id=NEW.job_id),0)+1
    THEN RAISE(ABORT,'CC_EVENT_SEQUENCE_OR_ID_CONFLICT') END;
  SELECT CASE WHEN NEW.operation_receipt_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cc_operation_receipts WHERE project_id=NEW.project_id
      AND receipt_id=NEW.operation_receipt_id AND job_id=NEW.job_id
  ) THEN RAISE(ABORT,'CC_EVENT_RECEIPT_JOB_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS cc_outbox_sent_insert BEFORE INSERT ON cc_outbox
WHEN NEW.outbox_state='SENT'
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM cc_operation_receipts r
    WHERE r.project_id=NEW.project_id AND r.receipt_id=NEW.operation_receipt_id
      AND r.job_id=NEW.job_id AND r.connection_id=NEW.connection_id
      AND r.operation_kind=NEW.delivery_kind AND r.operation_status='SUCCEEDED'
      AND r.receipt_origin='NATIVE_CONNECTOR' AND length(r.native_receipt_ref)>0)
    THEN RAISE(ABORT,'CC_SENT_REQUIRES_MATCHING_NATIVE_RECEIPT') END;
END;
CREATE TRIGGER IF NOT EXISTS cc_outbox_sent_update BEFORE UPDATE ON cc_outbox
WHEN NEW.outbox_state='SENT'
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM cc_operation_receipts r
    WHERE r.project_id=NEW.project_id AND r.receipt_id=NEW.operation_receipt_id
      AND r.job_id=NEW.job_id AND r.connection_id=NEW.connection_id
      AND r.operation_kind=NEW.delivery_kind AND r.operation_status='SUCCEEDED'
      AND r.receipt_origin='NATIVE_CONNECTOR' AND length(r.native_receipt_ref)>0)
    THEN RAISE(ABORT,'CC_SENT_REQUIRES_MATCHING_NATIVE_RECEIPT') END;
END;
CREATE TRIGGER IF NOT EXISTS cc_outbox_sent_no_update BEFORE UPDATE ON cc_outbox
WHEN OLD.outbox_state='SENT'
BEGIN SELECT RAISE(ABORT,'CC_SENT_RECORD_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS cc_outbox_sent_no_delete BEFORE DELETE ON cc_outbox
WHEN OLD.outbox_state='SENT'
BEGIN SELECT RAISE(ABORT,'CC_SENT_RECORD_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS cc_outbox_unknown_no_retry BEFORE UPDATE ON cc_outbox
WHEN OLD.outbox_state='UNKNOWN_DELIVERY' AND NEW.outbox_state IN ('DRAFT','QUEUED','IN_FLIGHT')
BEGIN SELECT RAISE(ABORT,'CC_UNKNOWN_DELIVERY_REQUIRES_RECONCILIATION'); END;
CREATE TRIGGER IF NOT EXISTS cc_outbox_no_replace BEFORE INSERT ON cc_outbox
WHEN EXISTS (SELECT 1 FROM cc_outbox WHERE project_id=NEW.project_id
  AND (outbox_id=NEW.outbox_id OR job_id=NEW.job_id))
BEGIN SELECT RAISE(ABORT,'CC_OUTBOX_IDEMPOTENCY_CONFLICT'); END;

CREATE TRIGGER IF NOT EXISTS cc_folder_identity_no_update BEFORE UPDATE ON cc_attached_folders
WHEN OLD.project_id<>NEW.project_id OR OLD.mount_id<>NEW.mount_id OR OLD.host_id<>NEW.host_id
  OR OLD.root_locator<>NEW.root_locator OR OLD.source_kind<>NEW.source_kind
  OR OLD.attachment_mode<>NEW.attachment_mode
BEGIN SELECT RAISE(ABORT,'CC_FOLDER_IDENTITY_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS cc_folder_no_replace BEFORE INSERT ON cc_attached_folders
WHEN EXISTS (SELECT 1 FROM cc_attached_folders WHERE project_id=NEW.project_id AND mount_id=NEW.mount_id)
BEGIN SELECT RAISE(ABORT,'CC_FOLDER_ID_CONFLICT'); END;
CREATE TRIGGER IF NOT EXISTS cc_folder_detach_before_delete BEFORE DELETE ON cc_attached_folders
BEGIN SELECT RAISE(ABORT,'CC_FOLDER_USE_DETACH'); END;
CREATE TRIGGER IF NOT EXISTS cc_folder_detach_index AFTER UPDATE ON cc_attached_folders
WHEN NEW.connection_state='DETACHED' AND NEW.detach_index_policy='PURGE_INDEX'
BEGIN
  DELETE FROM cc_attached_files WHERE project_id=NEW.project_id AND mount_id=NEW.mount_id;
END;
-- PURGE_INDEX removes index associations only. Approved retained documents
-- require a separate explicit retention/deletion action; originals are external.

CREATE TRIGGER IF NOT EXISTS cc_attached_file_admit_insert BEFORE INSERT ON cc_attached_files
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM cc_sources s JOIN cc_attached_folders f
    ON f.project_id=s.project_id AND f.mount_id=NEW.mount_id
    WHERE s.project_id=NEW.project_id AND s.source_id=NEW.source_id
      AND s.source_namespace='LOCAL_FILESYSTEM' AND s.source_owner=f.host_id
      AND s.acquisition_state='ACQUIRED' AND f.connection_state<>'DETACHED'
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
CREATE TRIGGER IF NOT EXISTS cc_attached_file_admit_update BEFORE UPDATE ON cc_attached_files
BEGIN
  SELECT CASE WHEN OLD.project_id<>NEW.project_id OR OLD.mount_id<>NEW.mount_id
    OR OLD.relative_locator<>NEW.relative_locator OR OLD.file_version<>NEW.file_version
    OR OLD.source_id<>NEW.source_id
    THEN RAISE(ABORT,'CC_ATTACHED_FILE_VERSION_IMMUTABLE') END;
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
CREATE TRIGGER IF NOT EXISTS cc_attached_file_no_replace BEFORE INSERT ON cc_attached_files
WHEN EXISTS (SELECT 1 FROM cc_attached_files WHERE project_id=NEW.project_id AND mount_id=NEW.mount_id
  AND relative_locator=NEW.relative_locator AND file_version=NEW.file_version)
BEGIN SELECT RAISE(ABORT,'CC_ATTACHED_FILE_VERSION_CONFLICT'); END;

PRAGMA application_id=0x4d504343;
PRAGMA user_version=1;
DROP TRIGGER cc_migration_metadata;
DROP TRIGGER cc_migration_preflight;
DROP TABLE cc_migration_guard;
COMMIT;
