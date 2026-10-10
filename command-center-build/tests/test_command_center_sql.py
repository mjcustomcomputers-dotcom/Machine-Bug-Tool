"""Isolated SQL contract tests; stdlib only, no network or native DB access.

Run from the build-pack root: python -B tests/test_command_center_sql.py -v
All databases are newly created inside TemporaryDirectory. FTS5 is optional;
the one opt-in test skips if the existing SQLite runtime lacks that module.
These tests exercise storage invariants, not connector authenticity, deployment,
Windows operation, encryption, comprehensive schema admission or GUI wiring.
"""

import hashlib
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest


SCHEMA_PATH = Path(__file__).resolve().parents[1] / "sql" / "001-command-center.sql"
SCHEMA_SQL = SCHEMA_PATH.read_text(encoding="utf-8")
APPLICATION_ID = int.from_bytes(b"MPCC", "big")
STAMP = "2026-10-09T16:00:00Z"  # Synthetic fixture time, not an execution receipt.


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class CommandCenterSqlTests(unittest.TestCase):
    def setUp(self):
        if sqlite3.sqlite_version_info < (3, 37, 0):
            self.skipTest("Schema requires an existing SQLite >= 3.37 runtime")
        self.directory = tempfile.TemporaryDirectory(prefix="mpc-command-center-sql-")
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "new-command-center.sqlite3"
        self.db = sqlite3.connect(self.path, isolation_level=None)
        self.addCleanup(self.db.close)
        try:
            self.db.execute("SELECT json_valid('{}')").fetchone()
        except sqlite3.OperationalError:
            self.skipTest("Existing SQLite runtime lacks built-in JSON functions")
        self.db.executescript(SCHEMA_SQL)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.project("p1")
        self.project("p2")

    def insert(self, table, **values):
        # Table/column names are fixed test code, never caller-controlled input.
        columns = ",".join(values)
        placeholders = ",".join("?" for _ in values)
        return self.db.execute(
            f"INSERT INTO {table}({columns}) VALUES({placeholders})", tuple(values.values())
        )

    def project(self, project):
        self.insert("cc_projects", project_id=project, display_name=project, created_at_utc=STAMP)

    def source(self, source="s1", project="p1", **overrides):
        values = dict(
            project_id=project, source_id=source, source_owner="owner-A",
            source_namespace="GOOGLE_DRIVE", native_id_type="file_id", native_id="0007",
            native_version="revision-01", content_sha256=digest("native fixture"),
            acquisition_state="ACQUIRED", acquired_at_utc=STAMP,
        )
        values.update(overrides)
        return self.insert("cc_sources", **values)

    def alias(self, alias="alias1", source="s1", project="p1", **overrides):
        values = dict(
            project_id=project, alias_id=alias, source_id=source, alias_owner="dash-account-A",
            alias_namespace="DROPBOX_DASH", alias_native_id_type="index_record_id",
            alias_native_id=alias, alias_kind="SEARCH_INDEX",
        )
        values.update(overrides)
        return self.insert("cc_source_aliases", **values)

    def atom(self, atom="a1", source="s1", project="p1", **overrides):
        values = dict(
            project_id=project, atom_id=atom, source_id=source, source_locator="page 1, paragraph 2",
            atom_type_namespace="fixture", atom_type_id_type="string", atom_type_id="native-id-observation",
            value_type="STRING", value_json='"0007"',
            evidence_state_namespace="fixture.hosted.universal.evidence_state", evidence_state="OBSERVED",
        )
        values.update(overrides)
        return self.insert("cc_atoms", **values)

    def task(self, task="t1", project="p1"):
        self.insert("cc_tasks", project_id=project, task_id=task, title="Synthetic review",
                    work_phase_namespace="fixture.v16.evidence_workflow.work_phase", work_phase="ANALYSIS")

    def job(self, job="j1", task="t1", project="p1", key=None):
        self.insert("cc_jobs", project_id=project, job_id=job, task_id=task,
                    operation_name="fixture.review", idempotency_key=key or job,
                    request_sha256=digest("request:" + job), created_at_utc=STAMP)

    def connection(self, connection="c1", project="p1", **overrides):
        values = dict(
            project_id=project, connection_id=connection, display_name="Synthetic connector",
            provider_namespace="FIXTURE", transport="PLUGIN", endpoint_ref="plugin://fixture",
            secret_store_ref="os-secret://windows-credential-manager/mpc/fixture-reference",
        )
        values.update(overrides)
        self.insert("cc_connections", **values)

    def report(self, report="r1", job="j1", project="p1"):
        self.insert("cc_reports", project_id=project, report_id=report, job_id=job,
                    title="Synthetic report", artifact_ref="artifact://fixture/report-v1",
                    artifact_sha256=digest("synthetic report"), report_state="READY")

    def receipt(self, receipt="receipt1", job="send1", connection="c1", project="p1", **overrides):
        values = dict(
            project_id=project, receipt_id=receipt, job_id=job, connection_id=connection,
            operation_kind="SEND", operation_status="SUCCEEDED", receipt_origin="NATIVE_CONNECTOR",
            native_receipt_ref="fixture-receipt://" + receipt,
            receipt_sha256=digest("receipt:" + receipt), observed_at_utc=STAMP,
        )
        values.update(overrides)
        self.insert("cc_operation_receipts", **values)

    def event(self, event="e1", job="send1", sequence=1, state="QUEUED", project="p1", receipt=None):
        self.insert("cc_job_receipt_events", project_id=project, event_id=event, job_id=job,
                    event_sequence=sequence, job_state=state, fact_summary="Synthetic local result",
                    operation_receipt_id=receipt, observed_at_utc=STAMP)

    def delivery_fixture(self):
        self.task()
        self.job()
        self.job("send1")
        self.connection()
        self.report()
        self.insert("cc_outbox", project_id="p1", outbox_id="o1", report_id="r1",
                    job_id="send1", connection_id="c1", delivery_kind="SEND")

    def mark_sent(self, receipt):
        self.db.execute(
            "UPDATE cc_outbox SET outbox_state='SENT',operation_receipt_id=?,sent_at_utc=? "
            "WHERE project_id='p1' AND outbox_id='o1'", (receipt, STAMP)
        )

    def folder(self, mount="mount1", project="p1", **overrides):
        values = dict(project_id=project, mount_id=mount, host_id="host-fixture-A",
                      root_locator="C:\\MPC-Fixture\\Attached", source_kind="LOCAL_FOLDER",
                      attachment_mode="INDEX_IN_PLACE", connection_state="ONLINE", index_state="CURRENT")
        values.update(overrides)
        self.insert("cc_attached_folders", **values)

    def local_source(self, source="local1", project="p1", version="v1", **overrides):
        values = dict(source_owner="host-fixture-A", source_namespace="LOCAL_FILESYSTEM",
                      native_id_type="local_file_id", native_id="000007", native_version=version)
        values.update(overrides)
        self.source(source, project, **values)

    def attached_file(self, source="local1", project="p1", mount="mount1", version="v1", **overrides):
        values = dict(project_id=project, mount_id=mount, relative_locator="records/0007.txt",
                      file_version=version, source_id=source, observed_at_utc=STAMP)
        values.update(overrides)
        self.insert("cc_attached_files", **values)

    def test_schema_version_and_reapplication_are_idempotent(self):
        self.source()
        before = self.db.execute("SELECT type,name,sql FROM sqlite_schema ORDER BY type,name").fetchall()
        stamp = self.db.execute("SELECT applied_at_utc FROM cc_schema").fetchone()
        self.db.executescript(SCHEMA_SQL)
        self.assertEqual(before, self.db.execute(
            "SELECT type,name,sql FROM sqlite_schema ORDER BY type,name").fetchall())
        self.assertEqual(stamp, self.db.execute("SELECT applied_at_utc FROM cc_schema").fetchone())
        self.assertEqual((1,), self.db.execute("PRAGMA user_version").fetchone())
        self.assertEqual((APPLICATION_ID,), self.db.execute("PRAGMA application_id").fetchone())
        self.assertEqual(("MPC_COMMAND_CENTER", 1), self.db.execute(
            "SELECT schema_name,schema_version FROM cc_schema").fetchone())
        self.assertEqual((1,), self.db.execute("SELECT count(*) FROM cc_sources").fetchone())
        self.assertEqual([], self.db.execute("PRAGMA foreign_key_check").fetchall())
        self.assertEqual(("ok",), self.db.execute("PRAGMA integrity_check").fetchone())

    def test_occupied_workbench_shaped_database_is_rejected_without_mutation(self):
        other = sqlite3.connect(Path(self.directory.name) / "occupied-fixture.sqlite3", isolation_level=None)
        self.addCleanup(other.close)
        other.executescript("CREATE TABLE workbench_meta(key TEXT PRIMARY KEY,value TEXT);"
                            "INSERT INTO workbench_meta VALUES('bundle_identity','synthetic-sentinel');")
        before = other.execute("SELECT type,name,sql FROM sqlite_schema ORDER BY type,name").fetchall()
        with self.assertRaisesRegex(sqlite3.IntegrityError, "CC_SEPARATE_DATABASE"):
            other.executescript(SCHEMA_SQL)
        other.rollback()
        self.assertEqual(before, other.execute("SELECT type,name,sql FROM sqlite_schema ORDER BY type,name").fetchall())
        self.assertEqual(("synthetic-sentinel",), other.execute(
            "SELECT value FROM workbench_meta").fetchone())
        self.assertEqual((0,), other.execute("PRAGMA application_id").fetchone())
        self.assertEqual((0,), other.execute("PRAGMA user_version").fetchone())

    def test_future_schema_version_is_rejected_without_downgrade(self):
        self.db.execute("PRAGMA user_version=2")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "CC_SEPARATE_DATABASE"):
            self.db.executescript(SCHEMA_SQL)
        self.db.rollback()
        self.assertEqual((2,), self.db.execute("PRAGMA user_version").fetchone())

    def test_native_id_owner_namespace_type_version_and_hash_remain_distinct(self):
        self.source()
        variations = [dict(native_id="7"), dict(source_owner="owner-B"),
                      dict(source_namespace="DROPBOX"), dict(native_id_type="folder_id"),
                      dict(native_version="revision-02"), dict(content_sha256=digest("changed bytes")),
                      dict(source_owner="Owner-A")]
        for number, change in enumerate(variations, 2):
            self.source("s" + str(number), **change)
        self.assertEqual((8,), self.db.execute("SELECT count(*) FROM cc_sources").fetchone())
        self.assertEqual(("0007", "text"), self.db.execute(
            "SELECT native_id,typeof(native_id) FROM cc_sources WHERE source_id='s1'").fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            self.source("same-identity-different-local-id")
        self.source("s1", project="p2")
        self.assertEqual((9,), self.db.execute("SELECT count(*) FROM cc_sources").fetchone())

    def test_cross_project_foreign_keys_reject_mismatched_associations(self):
        for project, suffix in [("p1", "1"), ("p2", "2")]:
            self.source("s" + suffix, project)
            self.atom("a" + suffix, "s" + suffix, project)
            self.task("t" + suffix, project)
            self.job("j" + suffix, "t" + suffix, project)
            self.connection("c" + suffix, project)
            self.report("r" + suffix, "j" + suffix, project)
        attempts = [
            lambda: self.alias("bad", "s1", "p2"),
            lambda: self.atom("bad", "s1", "p2"),
            lambda: self.job("bad", "t1", "p2"),
            lambda: self.report("bad", "j1", "p2"),
            lambda: self.receipt("bad-job", "j1", "c2", "p2"),
            lambda: self.receipt("bad-connection", "j2", "c1", "p2"),
            lambda: self.insert("cc_atom_dependencies", project_id="p2", atom_id="a2",
                                depends_on_atom_id="a1", relation_namespace="fixture", relation_type="REQUIRES"),
            lambda: self.insert("cc_outbox", project_id="p2", outbox_id="bad", report_id="r1",
                                job_id="j2", connection_id="c2", delivery_kind="SEND"),
            lambda: self.insert("cc_retained_documents", project_id="p2", document_id="bad", source_id="s1",
                                retention_authorization_ref="fixture-consent", retained_text="fixture",
                                text_sha256=digest("fixture")),
        ]
        for number, attempt in enumerate(attempts):
            with self.subTest(association=number), self.assertRaises(sqlite3.IntegrityError):
                attempt()

    def test_dash_aliases_do_not_add_an_evidence_unit(self):
        self.source()
        self.alias()
        self.alias("alias2", alias_namespace="SECONDARY_INDEX")
        self.assertEqual((2,), self.db.execute("SELECT count(*) FROM cc_source_aliases").fetchone())
        self.assertEqual((1,), self.db.execute("SELECT count(*) FROM cc_evidence_units").fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            self.alias("duplicate", alias_native_id="alias1")

    def test_atoms_preserve_value_types_and_namespaced_native_evidence_states(self):
        self.source()
        self.atom()
        self.atom("number", value_type="NUMBER", value_json="7", evidence_state="INFERRED")
        self.assertEqual(('"0007"', "STRING", "OBSERVED"), self.db.execute(
            "SELECT value_json,value_type,evidence_state FROM cc_atoms WHERE atom_id='a1'").fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            self.atom("wrong-type", value_type="STRING", value_json="7")
        with self.assertRaises(sqlite3.IntegrityError):
            self.atom("missing-state-namespace", evidence_state_namespace="")
        vocabularies = {
            "fixture.hosted.universal.evidence_state": ["OBSERVED", "DERIVED", "INFERRED", "ADOPTED"],
            "fixture.hosted.atomic.epistemic_state": ["OBSERVED", "DERIVED", "INFERRED", "UNKNOWN", "SYNTHETIC"],
        }
        for namespace, states in vocabularies.items():
            for state in states:
                self.atom(namespace + ":" + state, evidence_state_namespace=namespace, evidence_state=state)
                self.assertEqual((namespace, state), self.db.execute(
                    "SELECT evidence_state_namespace,evidence_state FROM cc_atoms WHERE atom_id=?",
                    (namespace + ":" + state,)).fetchone())

    def test_classifier_id_type_and_exact_text_are_preserved(self):
        self.source()
        for atom, id_type, native_id in [("string", "string", "0007"), ("number", "integer", "7"),
                                         ("large", "integer", "123456789012345678901234567890")]:
            self.atom(atom, atom_type_id_type=id_type, atom_type_id=native_id)
            self.assertEqual((id_type, native_id, "text"), self.db.execute(
                "SELECT atom_type_id_type,atom_type_id,typeof(atom_type_id) FROM cc_atoms WHERE atom_id=?",
                (atom,)).fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            self.atom("invalid-integer", atom_type_id_type="integer", atom_type_id="classifier-seven")

    def test_native_work_phase_namespace_and_verification_value_are_preserved(self):
        self.insert("cc_tasks", project_id="p1", task_id="native-verification", title="Specific claim check",
                    work_phase_namespace="fixture.v16.evidence_workflow.work_phase", work_phase="VERIFICATION")
        self.assertEqual(("fixture.v16.evidence_workflow.work_phase", "VERIFICATION"), self.db.execute(
            "SELECT work_phase_namespace,work_phase FROM cc_tasks").fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert("cc_tasks", project_id="p1", task_id="missing-namespace", title="Specific claim check",
                        work_phase_namespace="", work_phase="VERIFICATION")

    def test_jobs_are_idempotent_and_request_snapshots_cannot_be_replaced(self):
        self.task()
        self.job(key="same-source-and-request")
        with self.assertRaises(sqlite3.IntegrityError):
            self.job("different-id", key="same-source-and-request")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT OR REPLACE INTO cc_jobs SELECT * FROM cc_jobs WHERE job_id='j1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE cc_jobs SET request_sha256=?", (digest("changed request"),))
        self.task("t2", "p2")
        self.job("j2", "t2", "p2", key="same-source-and-request")
        self.assertEqual((2,), self.db.execute("SELECT count(*) FROM cc_jobs").fetchone())

    def test_queued_and_locally_completed_are_not_sent(self):
        self.delivery_fixture()
        self.event(state="SUCCEEDED")
        self.assertEqual(("SUCCEEDED",), self.db.execute(
            "SELECT job_state FROM cc_job_state WHERE job_id='send1'").fetchone())
        self.assertEqual(("QUEUED", None), self.db.execute(
            "SELECT outbox_state,sent_at_utc FROM cc_outbox").fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            self.mark_sent(None)
        self.job("send2")
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert("cc_outbox", project_id="p1", outbox_id="o2", report_id="r1",
                        job_id="send2", connection_id="c1", delivery_kind="SEND",
                        outbox_state="SENT", sent_at_utc=STAMP)

    def test_sent_requires_native_success_for_the_same_job_connection_and_operation(self):
        self.delivery_fixture()
        self.job("send2")
        self.connection("c2")
        cases = [dict(receipt_origin="LOCAL", native_receipt_ref=None),
                 dict(operation_status="ACKNOWLEDGED"), dict(operation_status="FAILED"),
                 dict(operation_kind="DRAFT"), dict(job="send2"), dict(connection="c2")]
        for index, fields in enumerate(cases):
            receipt = "bad" + str(index)
            self.receipt(receipt, **fields)
            with self.subTest(receipt=receipt), self.assertRaises(sqlite3.IntegrityError):
                self.mark_sent(receipt)
        with self.assertRaises(sqlite3.IntegrityError):
            self.receipt("missing-ref", native_receipt_ref=None)
        self.receipt()
        self.mark_sent("receipt1")
        self.assertEqual(("SENT", "receipt1", STAMP), self.db.execute(
            "SELECT outbox_state,operation_receipt_id,sent_at_utc FROM cc_outbox").fetchone())

    def test_native_receipt_deduplication_prevents_reusing_the_same_snapshot_for_another_job(self):
        self.delivery_fixture()
        self.job("send2")
        self.receipt()
        with self.assertRaises(sqlite3.IntegrityError):
            self.receipt("receipt-copy", job="send2", native_receipt_ref="fixture-receipt://receipt1",
                         receipt_sha256=digest("receipt:receipt1"))
        self.assertEqual((1,), self.db.execute("SELECT count(*) FROM cc_operation_receipts").fetchone())

    def test_write_delivery_retains_unknown_outcome_until_its_exact_native_receipt(self):
        self.delivery_fixture()
        self.db.execute("UPDATE cc_outbox SET delivery_kind='WRITE',outbox_state='UNKNOWN_DELIVERY'")
        self.assertEqual(("WRITE", "UNKNOWN_DELIVERY", None), self.db.execute(
            "SELECT delivery_kind,outbox_state,sent_at_utc FROM cc_outbox").fetchone())
        for retry_state in ["DRAFT", "QUEUED", "IN_FLIGHT"]:
            with self.subTest(retry_state=retry_state), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute("UPDATE cc_outbox SET outbox_state=?", (retry_state,))
        self.receipt("send-receipt", operation_kind="SEND")
        with self.assertRaises(sqlite3.IntegrityError):
            self.mark_sent("send-receipt")
        self.receipt("write-receipt", operation_kind="WRITE")
        self.mark_sent("write-receipt")
        self.assertEqual(("WRITE", "SENT", "write-receipt"), self.db.execute(
            "SELECT delivery_kind,outbox_state,operation_receipt_id FROM cc_outbox").fetchone())

    def test_operation_receipts_are_append_only_including_replace(self):
        self.delivery_fixture()
        self.receipt()
        for statement in ["UPDATE cc_operation_receipts SET operation_status='FAILED'",
                          "DELETE FROM cc_operation_receipts",
                          "INSERT OR REPLACE INTO cc_operation_receipts SELECT * FROM cc_operation_receipts"]:
            with self.subTest(statement=statement), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(statement)
        self.assertEqual(("SUCCEEDED",), self.db.execute(
            "SELECT operation_status FROM cc_operation_receipts").fetchone())

    def test_receipt_events_are_sequenced_append_only_and_job_bound(self):
        self.delivery_fixture()
        self.receipt()
        self.event()
        self.event("e2", sequence=2, state="RUNNING")
        self.event("e3", sequence=3, state="SUCCEEDED", receipt="receipt1")
        for statement in ["UPDATE cc_job_receipt_events SET job_state='FAILED'",
                          "DELETE FROM cc_job_receipt_events",
                          "INSERT OR REPLACE INTO cc_job_receipt_events SELECT * FROM cc_job_receipt_events"]:
            with self.subTest(statement=statement), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(statement)
        with self.assertRaises(sqlite3.IntegrityError):
            self.event("gap", sequence=5)
        self.job("send2")
        with self.assertRaises(sqlite3.IntegrityError):
            self.event("wrong-job", job="send2", receipt="receipt1")
        self.assertEqual((3,), self.db.execute("SELECT count(*) FROM cc_job_receipt_events").fetchone())
        self.assertEqual(("SUCCEEDED",), self.db.execute(
            "SELECT job_state FROM cc_job_state WHERE job_id='send1'").fetchone())

    def test_sent_records_and_their_used_report_and_connection_are_immutable(self):
        self.delivery_fixture()
        self.receipt()
        self.mark_sent("receipt1")
        statements = ["UPDATE cc_outbox SET outbox_state='FAILED',sent_at_utc=NULL",
                      "DELETE FROM cc_outbox",
                      "INSERT OR REPLACE INTO cc_outbox SELECT * FROM cc_outbox",
                      "UPDATE cc_reports SET artifact_ref='artifact://changed'",
                      "INSERT OR REPLACE INTO cc_reports SELECT * FROM cc_reports",
                      "UPDATE cc_connections SET endpoint_ref='plugin://changed'",
                      "INSERT OR REPLACE INTO cc_connections SELECT * FROM cc_connections"]
        for statement in statements:
            with self.subTest(statement=statement), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(statement)

    def test_connection_configuration_accepts_secret_store_references_only(self):
        self.connection()
        for fields in [dict(secret_store_ref="plaintext-secret-value"),
                       dict(endpoint_ref="https://user:placeholder@example.test/mcp"),
                       dict(endpoint_ref="https://example.test/mcp?credential=placeholder")]:
            with self.subTest(fields=fields), self.assertRaises(sqlite3.IntegrityError):
                self.connection("bad", **fields)
        columns = {row[1] for row in self.db.execute("PRAGMA table_info(cc_connections)")}
        self.assertFalse(columns & {"api_key", "password", "access_token", "refresh_token", "headers", "config_json"})
        self.assertEqual((0,), self.db.execute("SELECT enabled FROM cc_connections").fetchone())

    def test_retained_text_requires_an_explicit_reference_and_can_be_removed(self):
        self.source()
        record = dict(project_id="p1", document_id="d1", source_id="s1", retained_text="retained fixture",
                      text_sha256=digest("retained fixture"))
        with self.assertRaises(sqlite3.IntegrityError):
            self.insert("cc_retained_documents", **record, retention_authorization_ref="")
        self.insert("cc_retained_documents", **record, retention_authorization_ref="fixture-consent://p1/d1")
        self.db.execute("DELETE FROM cc_retained_documents WHERE project_id='p1'")
        self.assertEqual((0,), self.db.execute("SELECT count(*) FROM cc_retained_documents").fetchone())
        self.assertEqual((1,), self.db.execute("SELECT count(*) FROM cc_sources").fetchone())

    def test_fts5_is_optional_and_opt_in_search_uses_only_project_retained_text(self):
        self.assertEqual([], self.db.execute(
            "SELECT name FROM sqlite_schema WHERE upper(sql) LIKE '%VIRTUAL TABLE%'").fetchall())
        self.source(native_id="unretainedprivatekeyword")
        self.source("s2", "p2")
        self.alias()
        for project, source, document in [("p1", "s1", "d1"), ("p2", "s2", "d2")]:
            self.insert("cc_retained_documents", project_id=project, document_id=document, source_id=source,
                        retention_authorization_ref="fixture-consent://" + document,
                        retained_text="retained compass fixture", text_sha256=digest("retained compass fixture"))
        try:
            self.db.execute("CREATE VIRTUAL TABLE temp.cc_test_search USING fts5(document_id UNINDEXED,body)")
        except sqlite3.OperationalError as error:
            if "no such module: fts5" in str(error).lower():
                self.skipTest("FTS5 unavailable; no extension loaded or installed")
            raise
        self.db.execute("INSERT INTO temp.cc_test_search SELECT document_id,retained_text "
                        "FROM cc_retained_documents WHERE project_id=?", ("p1",))
        self.assertEqual([("d1",)], self.db.execute(
            "SELECT document_id FROM temp.cc_test_search WHERE cc_test_search MATCH ?", ("compass",)).fetchall())
        self.assertEqual([], self.db.execute(
            "SELECT document_id FROM temp.cc_test_search WHERE cc_test_search MATCH ?", ("unretainedprivatekeyword",)).fetchall())
        self.db.execute("DROP TABLE temp.cc_test_search")
        self.assertEqual([], self.db.execute(
            "SELECT name FROM sqlite_schema WHERE upper(sql) LIKE '%VIRTUAL TABLE%'").fetchall())

    def test_foreign_keys_are_enabled_per_connection_and_wal_is_explicit(self):
        self.assertEqual((1,), self.db.execute("PRAGMA foreign_keys").fetchone())
        self.assertEqual(("wal",), self.db.execute("PRAGMA journal_mode").fetchone())
        other = sqlite3.connect(self.path, isolation_level=None)
        self.addCleanup(other.close)
        other.execute("PRAGMA foreign_keys=OFF")
        self.assertEqual((0,), other.execute("PRAGMA foreign_keys").fetchone())
        other.execute("PRAGMA foreign_keys=ON")
        self.assertEqual((1,), other.execute("PRAGMA foreign_keys").fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            other.execute("INSERT INTO cc_tasks(project_id,task_id,title,work_phase_namespace,work_phase) "
                          "VALUES('missing-project','t','fixture','fixture.phase','ANALYSIS')")

    def test_attached_file_versions_keep_mount_path_and_source_identity(self):
        self.folder()
        self.local_source()
        self.attached_file()
        with self.assertRaises(sqlite3.IntegrityError):
            self.attached_file()
        with self.assertRaises(sqlite3.IntegrityError):
            self.attached_file(version="unmatched-version")
        self.local_source("local2", version="v2", content_sha256=digest("new file bytes"))
        self.attached_file("local2", version="v2")
        self.assertEqual([("records/0007.txt", "v1", "local1"), ("records/0007.txt", "v2", "local2")],
                         self.db.execute("SELECT relative_locator,file_version,source_id FROM cc_attached_files "
                                         "ORDER BY file_version").fetchall())
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE cc_attached_files SET relative_locator='changed.txt'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT OR REPLACE INTO cc_attached_files SELECT * FROM cc_attached_files")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE cc_sources SET source_namespace='GOOGLE_DRIVE' WHERE source_id='local1'")

    def test_attached_folders_are_project_bound_and_reject_escaping_relative_paths(self):
        self.folder()
        self.local_source()
        self.local_source("local2", "p2")
        with self.assertRaises(sqlite3.IntegrityError):
            self.attached_file("local2", "p2", mount="mount1")
        with self.assertRaises(sqlite3.IntegrityError):
            self.attached_file("local2", "p1")
        for locator in ["../outside.txt", "records/../outside.txt", "/absolute.txt", "C:/absolute.txt",
                        "records\\file.txt", "records//file.txt", "records/./file.txt"]:
            with self.subTest(locator=locator), self.assertRaises(sqlite3.IntegrityError):
                self.attached_file(relative_locator=locator)
        self.attached_file(relative_locator="records/Space and Unicode-é.txt")
        self.assertEqual([], self.db.execute("PRAGMA foreign_key_check").fetchall())

    def test_offline_and_default_detach_keep_history_and_explicit_purge_cleans_only_the_index(self):
        self.folder(source_kind="REMOVABLE")
        self.local_source()
        self.attached_file()
        self.insert("cc_retained_documents", project_id="p1", document_id="d1", source_id="local1",
                    retention_authorization_ref="fixture-consent://retained-snapshot",
                    retained_text="approved fixture", text_sha256=digest("approved fixture"))
        self.db.execute("UPDATE cc_attached_folders SET connection_state='OFFLINE',index_state='STALE'")
        self.assertEqual((1,), self.db.execute("SELECT count(*) FROM cc_attached_files").fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE cc_attached_folders SET root_locator='D:\\Different-device'")
        self.db.execute("UPDATE cc_attached_folders SET connection_state='DETACHED',index_state='DETACHED',"
                        "detached_at_utc=?", (STAMP,))
        self.assertEqual((1,), self.db.execute("SELECT count(*) FROM cc_attached_files").fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM cc_attached_folders")
        self.db.execute("UPDATE cc_attached_folders SET detach_index_policy='PURGE_INDEX'")
        self.assertEqual((0,), self.db.execute("SELECT count(*) FROM cc_attached_files").fetchone())
        self.assertEqual((1,), self.db.execute("SELECT count(*) FROM cc_retained_documents").fetchone())
        self.assertEqual((1,), self.db.execute("SELECT count(*) FROM cc_sources").fetchone())
        self.assertEqual(("DETACHED",), self.db.execute("SELECT connection_state FROM cc_attached_folders").fetchone())

    def test_synced_folder_native_alias_requires_a_source_bound_native_read_receipt(self):
        self.folder(source_kind="SYNCED_FOLDER", root_locator="C:\\Drive-Fixture\\Project")
        self.local_source()
        self.attached_file()
        self.assertEqual((None, None), self.db.execute(
            "SELECT mapped_native_source_id,native_mapping_receipt_id FROM cc_attached_files").fetchone())
        self.source("native1")
        self.source("native2", native_id="other-native-id")
        self.task()
        self.job("acquire1")
        self.connection(provider_namespace="GOOGLE_DRIVE")
        self.receipt("wrong-subject", job="acquire1", operation_kind="READ", subject_source_id="native2")
        self.receipt("only-ack", job="acquire1", operation_kind="READ", subject_source_id="native1",
                     operation_status="ACKNOWLEDGED")
        for receipt in [None, "wrong-subject", "only-ack"]:
            with self.subTest(receipt=receipt), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute("UPDATE cc_attached_files SET mapped_native_source_id='native1',"
                                "native_mapping_receipt_id=?", (receipt,))
        self.receipt("read-native", job="acquire1", operation_kind="READ", subject_source_id="native1")
        before = self.db.execute("SELECT count(*) FROM cc_sources").fetchone()
        self.db.execute("UPDATE cc_attached_files SET mapped_native_source_id='native1',"
                        "native_mapping_receipt_id='read-native'")
        self.assertEqual(("native1", "read-native"), self.db.execute(
            "SELECT mapped_native_source_id,native_mapping_receipt_id FROM cc_attached_files").fetchone())
        self.assertEqual(before, self.db.execute("SELECT count(*) FROM cc_sources").fetchone())

    def test_script_draft_is_a_generic_artifact_without_execution_state(self):
        self.task()
        self.job()
        self.insert("cc_reports", project_id="p1", report_id="script1", job_id="j1",
                    title="Synthetic script draft", artifact_ref="artifact://fixture/prepared-script.ps1",
                    artifact_sha256=digest("synthetic script draft"), artifact_kind="SCRIPT_DRAFT")
        self.assertEqual(("SCRIPT_DRAFT", "DRAFT"), self.db.execute(
            "SELECT artifact_kind,report_state FROM cc_reports").fetchone())
        self.assertEqual(("QUEUED",), self.db.execute("SELECT job_state FROM cc_job_state").fetchone())


if __name__ == "__main__":
    print(f"Python {sys.version.split()[0]}; SQLite {sqlite3.sqlite_version}; "
          f"schema SHA-256 {digest(SCHEMA_SQL)}", flush=True)
    unittest.main()
