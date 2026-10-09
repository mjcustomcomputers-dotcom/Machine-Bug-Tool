import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, lstatSync, mkdirSync, openSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';

// This is a separate chat-history service. Never point it at a Workbench or
// controller database. Admission checks happen before existing files are opened
// for writing. The GUI should normally use <app-data>/mpc-local-chat.sqlite.
export const LOCAL_CHAT_APPLICATION_ID = 0x4d504348; // MPCH
export const LOCAL_CHAT_SCHEMA_VERSION = 1;
export const LOCAL_CHAT_DEFAULT_MODEL = 'mpc-daybreak-local';
export const LOCAL_CHAT_LIMITS = Object.freeze({
  projects: 100, messages: 1000, name: 120, instructions: 16000,
  draft: 64000, message: 256000, attachments: 8,
  attachmentName: 240, attachmentText: 32000, attachmentTotal: 64000,
  model: 200, requestId: 240,
});

const STORE_KIND = 'MPC_LOCAL_CHAT_HISTORY';
const STATUSES = new Set(['COMPLETE', 'INCOMPLETE', 'ERROR', 'CANCELLED']);
const SCHEMA_SQL = `
CREATE TABLE store_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  store_kind TEXT NOT NULL CHECK (store_kind = 'MPC_LOCAL_CHAT_HISTORY'),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  schema_sha256 TEXT NOT NULL CHECK (length(schema_sha256) = 64)
) STRICT;
CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 80),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  retain_history INTEGER NOT NULL DEFAULT 0 CHECK (retain_history IN (0, 1)),
  instructions TEXT NOT NULL DEFAULT '' CHECK (length(instructions) <= 16000),
  selected_model TEXT NOT NULL DEFAULT 'mpc-daybreak-local'
    CHECK (length(selected_model) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 1000),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK (length(content) <= 256000),
  status TEXT NOT NULL CHECK (status IN ('COMPLETE', 'INCOMPLETE', 'ERROR', 'CANCELLED')),
  model TEXT CHECK (model IS NULL OR length(model) BETWEEN 1 AND 200),
  request_id TEXT CHECK (request_id IS NULL OR length(request_id) BETWEEN 1 AND 240),
  attachments_json TEXT NOT NULL CHECK (json_valid(attachments_json)
    AND json_type(attachments_json) = 'array'
    AND json_array_length(attachments_json) <= 8),
  created_at TEXT NOT NULL,
  UNIQUE (project_id, position),
  UNIQUE (project_id, request_id, role)
) STRICT;
CREATE TABLE drafts (
  project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) <= 64000),
  updated_at TEXT NOT NULL
) STRICT;
CREATE TRIGGER retain_messages_insert
BEFORE INSERT ON messages
WHEN COALESCE((SELECT retain_history FROM projects WHERE id = NEW.project_id), 0) != 1
BEGIN SELECT RAISE(ABORT, 'LOCAL_CHAT_RETENTION_REQUIRED'); END;
CREATE TRIGGER retain_messages_update
BEFORE UPDATE ON messages
WHEN COALESCE((SELECT retain_history FROM projects WHERE id = NEW.project_id), 0) != 1
BEGIN SELECT RAISE(ABORT, 'LOCAL_CHAT_RETENTION_REQUIRED'); END;
CREATE TRIGGER retain_drafts_insert
BEFORE INSERT ON drafts
WHEN COALESCE((SELECT retain_history FROM projects WHERE id = NEW.project_id), 0) != 1
BEGIN SELECT RAISE(ABORT, 'LOCAL_CHAT_RETENTION_REQUIRED'); END;
CREATE TRIGGER retain_drafts_update
BEFORE UPDATE ON drafts
WHEN COALESCE((SELECT retain_history FROM projects WHERE id = NEW.project_id), 0) != 1
BEGIN SELECT RAISE(ABORT, 'LOCAL_CHAT_RETENTION_REQUIRED'); END;
CREATE TRIGGER disable_retention_after_cleanup
BEFORE UPDATE OF retain_history ON projects
WHEN NEW.retain_history = 0 AND (
  EXISTS (SELECT 1 FROM messages WHERE project_id = OLD.id) OR
  EXISTS (SELECT 1 FROM drafts WHERE project_id = OLD.id)
)
BEGIN SELECT RAISE(ABORT, 'LOCAL_CHAT_DELETE_HISTORY_FIRST'); END;
`;

function fail(code, message) {
  const error = new Error(message);
  error.code = `LOCAL_CHAT_${code}`;
  throw error;
}

function plainObject(value, label, allowedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail('INVALID_INPUT', `${label} must be an object.`);
  }
  if (Object.keys(value).some(key => !allowedKeys.includes(key))) {
    fail('INVALID_INPUT', `${label} contains an unsupported field.`);
  }
}

function string(value, label, limit, { nonempty = false } = {}) {
  if (typeof value !== 'string' || value.length > limit || (nonempty && value.length === 0)) {
    fail('INVALID_INPUT', `${label} must be ${nonempty ? 'a nonempty' : 'a'} string of at most ${limit} characters.`);
  }
  return value;
}

function projectId(value) {
  const result = string(value, 'Project ID', 80, { nonempty: true });
  if (result.includes('\0')) fail('INVALID_INPUT', 'Project ID contains a null character.');
  return result;
}

function projectName(value) {
  const original = string(value, 'Project name', LOCAL_CHAT_LIMITS.name, { nonempty: true });
  const result = original.trim();
  if (!result || /[\u0000-\u001f\u007f]/u.test(original)) {
    fail('INVALID_INPUT', 'Project name must contain visible text without control characters.');
  }
  return result;
}

function modelName(value, label = 'Model') {
  const result = string(value, label, LOCAL_CHAT_LIMITS.model, { nonempty: true });
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(result)) {
    fail('INVALID_INPUT', `${label} must be an exact model name or tag without whitespace.`);
  }
  return result;
}

function bool(value, label) {
  if (typeof value !== 'boolean') fail('INVALID_INPUT', `${label} must be true or false.`);
  return value;
}

function attachments(value = []) {
  if (!Array.isArray(value) || value.length > LOCAL_CHAT_LIMITS.attachments) {
    fail('INVALID_INPUT', 'Attachments must be an array of at most 8 text attachments.');
  }
  let total = 0;
  const result = [];
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) fail('INVALID_INPUT', 'Attachment arrays must not contain missing entries.');
    const item = value[index];
    plainObject(item, 'Attachment', ['name', 'text']);
    const name = string(item.name, 'Attachment name', LOCAL_CHAT_LIMITS.attachmentName, { nonempty: true });
    const text = string(item.text, 'Attachment text', LOCAL_CHAT_LIMITS.attachmentText);
    total += text.length;
    result.push({ name, text });
  }
  if (total > LOCAL_CHAT_LIMITS.attachmentTotal) {
    fail('INVALID_INPUT', 'Combined attachment text exceeds 64000 characters.');
  }
  return result;
}

function messageInput(input) {
  plainObject(input, 'Message', ['role', 'content', 'status', 'model', 'request_id', 'attachments']);
  if (!['user', 'assistant'].includes(input.role)) fail('INVALID_INPUT', 'Message role must be user or assistant.');
  if (!STATUSES.has(input.status)) fail('INVALID_INPUT', 'Message status must be COMPLETE, INCOMPLETE, ERROR, or CANCELLED.');
  const requestId = input.request_id == null ? null :
    string(input.request_id, 'Request ID', LOCAL_CHAT_LIMITS.requestId, { nonempty: true });
  if (requestId?.includes('\0')) fail('INVALID_INPUT', 'Request ID contains a null character.');
  return {
    role: input.role,
    content: string(input.content, 'Message content', LOCAL_CHAT_LIMITS.message),
    status: input.status,
    model: input.model == null ? null : modelName(input.model),
    request_id: requestId,
    attachments: attachments(input.attachments),
  };
}

function messageComparable(message) {
  return JSON.stringify({
    role: message.role, content: message.content, status: message.status,
    model: message.model, request_id: message.request_id, attachments: message.attachments,
  });
}

function schemaHash(db) {
  const rows = db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name, tbl_name`).all();
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

let expectedSchemaHash;
function expectedHash() {
  if (!expectedSchemaHash) {
    const db = new DatabaseSync(':memory:');
    try { db.exec(SCHEMA_SQL); expectedSchemaHash = schemaHash(db); }
    finally { db.close(); }
  }
  return expectedSchemaHash;
}

function checkedTimestamp(value) {
  if (!(value instanceof Date) && typeof value !== 'string') {
    fail('INVALID_CLOCK', 'The clock must return a Date or an ISO timestamp.');
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail('INVALID_CLOCK', 'The clock returned an invalid timestamp.');
  return date.toISOString();
}

function checkPathComponents(filePath, { createParent = false } = {}) {
  const root = parse(filePath).root;
  let current = root;
  const parts = filePath.slice(root.length).split(sep).filter(Boolean);
  if (!parts.length) fail('UNSAFE_PATH', 'Chat storage must identify a file rather than a filesystem root.');
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index]);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink()) fail('UNSAFE_PATH', 'Chat storage cannot use a symbolic-link path.');
    if (index < parts.length - 1 && !stat.isDirectory()) {
      fail('UNSAFE_PATH', 'A chat storage parent is not a directory.');
    }
    if (index === parts.length - 1 && (!stat.isFile() || stat.nlink > 1)) {
      fail('UNSAFE_PATH', 'Chat storage must be an ordinary file without extra hard links.');
    }
  }
  if (createParent) {
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    checkPathComponents(filePath);
  }
}

function normalizePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') ||
      value === ':memory:' || /^file:/iu.test(value)) {
    fail('UNSAFE_PATH', 'Provide a local path for the separate mpc-local-chat.sqlite database.');
  }
  const filePath = isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value);
  checkPathComponents(filePath, { createParent: true });
  return filePath;
}

function admit(db) {
  const applicationId = db.prepare('PRAGMA application_id').get().application_id;
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (applicationId !== LOCAL_CHAT_APPLICATION_ID || version !== LOCAL_CHAT_SCHEMA_VERSION) {
    fail('STORE_IDENTITY_MISMATCH', 'This file is not the supported MPC local chat-history database. Use a separate mpc-local-chat.sqlite file.');
  }
  if (schemaHash(db) !== expectedHash()) {
    fail('SCHEMA_IDENTITY_MISMATCH', 'The chat-history schema differs from its declared version. No migration or overwrite was attempted.');
  }
  const metadata = db.prepare('SELECT * FROM store_metadata').all();
  if (metadata.length !== 1 || metadata[0].id !== 1 ||
      metadata[0].store_kind !== STORE_KIND || metadata[0].schema_version !== LOCAL_CHAT_SCHEMA_VERSION ||
      metadata[0].schema_sha256 !== expectedHash()) {
    fail('SCHEMA_IDENTITY_MISMATCH', 'The chat-history schema receipt does not match this implementation.');
  }
  const integrity = db.prepare('PRAGMA quick_check').all();
  if (integrity.length !== 1 || integrity[0].quick_check !== 'ok' ||
      db.prepare('PRAGMA foreign_key_check').all().length) {
    fail('STORE_INTEGRITY_MISMATCH', 'The chat-history database failed its integrity check.');
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM projects').get().n > LOCAL_CHAT_LIMITS.projects ||
      db.prepare('SELECT project_id FROM messages GROUP BY project_id HAVING COUNT(*) > ?')
        .all(LOCAL_CHAT_LIMITS.messages).length ||
      db.prepare(`SELECT project_id FROM messages GROUP BY project_id
        HAVING MIN(position) != 1 OR MAX(position) != COUNT(*)`).all().length ||
      db.prepare(`SELECT p.id FROM projects p WHERE p.retain_history = 0 AND (
        EXISTS (SELECT 1 FROM messages m WHERE m.project_id = p.id) OR
        EXISTS (SELECT 1 FROM drafts d WHERE d.project_id = p.id))`).all().length) {
    fail('STORE_INTEGRITY_MISMATCH', 'Stored history violates project limits or the retention setting.');
  }
  try {
    for (const row of db.prepare('SELECT * FROM projects').all()) {
      projectId(row.id); projectName(row.name);
      string(row.instructions, 'Instructions', LOCAL_CHAT_LIMITS.instructions);
      modelName(row.selected_model); checkedTimestamp(row.created_at); checkedTimestamp(row.updated_at);
    }
    for (const row of db.prepare('SELECT * FROM messages').iterate()) {
      const { id, created_at, ...input } = rowToMessage(row);
      string(id, 'Message ID', 80, { nonempty: true });
      checkedTimestamp(created_at);
      messageInput(input);
    }
    for (const row of db.prepare('SELECT content, updated_at FROM drafts').iterate()) {
      string(row.content, 'Draft', LOCAL_CHAT_LIMITS.draft); checkedTimestamp(row.updated_at);
    }
  } catch (error) {
    fail('STORE_INTEGRITY_MISMATCH', `Stored chat data is malformed (${error.code || 'invalid data'}).`);
  }
}

function rowToProject(row) {
  return { ...row, retain_history: row.retain_history === 1 };
}

function rowToMessage(row) {
  return {
    id: row.id, role: row.role, content: row.content, status: row.status,
    model: row.model, request_id: row.request_id,
    attachments: JSON.parse(row.attachments_json), created_at: row.created_at,
  };
}

/**
 * Synchronous, single-application-instance history service. Project settings are
 * explicit saved preferences; conversation/draft text is session-only until the
 * user enables retain_history. Turning retention off deletes saved rows using
 * secure_delete and keeps the current session history in memory. Filesystem or
 * system backups are outside this service's deletion scope.
 */
export function createLocalChatStore({ filePath, now = () => new Date() } = {}) {
  if (typeof now !== 'function') fail('INVALID_INPUT', 'now must be a clock function.');
  const path = normalizePath(filePath);
  let created = false;
  let identity;
  try {
    identity = lstatSync(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try { const fd = openSync(path, 'wx', 0o600); closeSync(fd); created = true; }
    catch (creationError) { if (creationError.code !== 'EEXIST') throw creationError; }
    checkPathComponents(path);
    identity = lstatSync(path);
  }

  const options = { enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false, allowExtension: false };
  let db;
  try {
    if (!created) {
      const reader = new DatabaseSync(path, { ...options, readOnly: true });
      try { admit(reader); } finally { reader.close(); }
    }
    checkPathComponents(path);
    const current = lstatSync(path);
    if (identity.dev !== current.dev || identity.ino !== current.ino) {
      fail('UNSAFE_PATH', 'The chat storage file changed during admission.');
    }
    db = new DatabaseSync(path, options);
    if (!created) admit(db);
    db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = DELETE; PRAGMA secure_delete = ON;');
    if (created) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(SCHEMA_SQL);
        db.prepare('INSERT INTO store_metadata VALUES (1, ?, ?, ?)')
          .run(STORE_KIND, LOCAL_CHAT_SCHEMA_VERSION, expectedHash());
        db.exec(`PRAGMA application_id = ${LOCAL_CHAT_APPLICATION_ID}; PRAGMA user_version = ${LOCAL_CHAT_SCHEMA_VERSION}; COMMIT;`);
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      admit(db);
    }
  } catch (error) {
    if (db) { try { db.close(); } catch {} }
    if (created) {
      try {
        const current = lstatSync(path);
        if (!current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino) unlinkSync(path);
      } catch {}
    }
    throw error;
  }

  let closed = false;
  const memory = new Map();
  const copy = value => structuredClone(value);
  const ensureOpen = () => { if (closed) fail('CLOSED', 'The chat-history store is closed.'); };
  const timestamp = () => checkedTimestamp(now());

  function transaction(fn) {
    ensureOpen();
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  }

  function project(id) {
    ensureOpen();
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId(id));
    if (!row) fail('PROJECT_NOT_FOUND', 'That exact project ID does not exist.');
    return rowToProject(row);
  }

  function conversation(currentProject) {
    if (!currentProject.retain_history) return copy(memory.get(currentProject.id) || { messages: [], draft: '' });
    return {
      messages: db.prepare('SELECT * FROM messages WHERE project_id = ? ORDER BY position')
        .all(currentProject.id).map(rowToMessage),
      draft: db.prepare('SELECT content FROM drafts WHERE project_id = ?').get(currentProject.id)?.content || '',
    };
  }

  function writeMessage(id, message, position) {
    db.prepare(`INSERT INTO messages
      (id, project_id, position, role, content, status, model, request_id, attachments_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(message.id, id, position, message.role, message.content, message.status,
        message.model, message.request_id, JSON.stringify(message.attachments), message.created_at);
  }

  function writeDraft(id, draft, at) {
    if (!draft) db.prepare('DELETE FROM drafts WHERE project_id = ?').run(id);
    else db.prepare(`INSERT INTO drafts (project_id, content, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`)
      .run(id, draft, at);
  }

  return Object.freeze({
    listProjects() {
      ensureOpen();
      return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC, id').all().map(rowToProject);
    },

    createProject(input) {
      ensureOpen();
      plainObject(input, 'Project', ['name', 'retain_history']);
      const name = projectName(input.name);
      const retain = input.retain_history === undefined ? false : bool(input.retain_history, 'retain_history');
      return transaction(() => {
        if (db.prepare('SELECT COUNT(*) AS n FROM projects').get().n >= LOCAL_CHAT_LIMITS.projects) {
          fail('PROJECT_LIMIT', 'This store has reached its explicit limit of 100 projects.');
        }
        const id = randomUUID(), at = timestamp();
        db.prepare(`INSERT INTO projects (id, name, retain_history, instructions, selected_model, created_at, updated_at)
          VALUES (?, ?, ?, '', ?, ?, ?)`).run(id, name, retain ? 1 : 0, LOCAL_CHAT_DEFAULT_MODEL, at, at);
        return project(id);
      });
    },

    getProject(id) { return copy(project(id)); },

    updateProject(id, input) {
      ensureOpen(); projectId(id);
      plainObject(input, 'Project update', ['name', 'retain_history', 'instructions', 'selected_model']);
      const patch = {};
      if (Object.hasOwn(input, 'name')) patch.name = projectName(input.name);
      if (Object.hasOwn(input, 'retain_history')) patch.retain_history = bool(input.retain_history, 'retain_history');
      if (Object.hasOwn(input, 'instructions')) patch.instructions = string(input.instructions, 'Instructions', LOCAL_CHAT_LIMITS.instructions);
      if (Object.hasOwn(input, 'selected_model')) patch.selected_model = modelName(input.selected_model, 'Selected model');
      let session;
      const result = transaction(() => {
        const before = project(id), after = { ...before, ...patch };
        session = conversation(before);
        if (!Object.keys(patch).length) return before;
        const at = timestamp();
        if (before.retain_history && !after.retain_history) {
          db.prepare('DELETE FROM messages WHERE project_id = ?').run(id);
          db.prepare('DELETE FROM drafts WHERE project_id = ?').run(id);
        }
        db.prepare('UPDATE projects SET name = ?, retain_history = ?, instructions = ?, selected_model = ?, updated_at = ? WHERE id = ?')
          .run(after.name, after.retain_history ? 1 : 0, after.instructions, after.selected_model, at, id);
        if (!before.retain_history && after.retain_history) {
          session.messages.forEach((message, index) => writeMessage(id, message, index + 1));
          writeDraft(id, session.draft, at);
        }
        return project(id);
      });
      memory.set(id, session);
      return copy(result);
    },

    getConversation(id) {
      const currentProject = project(id);
      const session = conversation(currentProject);
      memory.set(id, copy(session));
      return copy({ project: currentProject, ...session, settings: {
        retain_history: currentProject.retain_history,
        instructions: currentProject.instructions,
        selected_model: currentProject.selected_model,
      } });
    },

    saveDraft(id, text) {
      ensureOpen(); projectId(id);
      const draft = string(text, 'Draft', LOCAL_CHAT_LIMITS.draft);
      let session;
      const result = transaction(() => {
        const currentProject = project(id), at = timestamp();
        session = conversation(currentProject);
        if (currentProject.retain_history) writeDraft(id, draft, at);
        db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(at, id);
        session.draft = draft;
        return { project_id: id, draft, updated_at: at };
      });
      memory.set(id, session);
      return copy(result);
    },

    appendMessage(id, input) {
      ensureOpen(); projectId(id);
      const validated = messageInput(input);
      let session;
      const result = transaction(() => {
        const currentProject = project(id);
        session = conversation(currentProject);
        if (validated.request_id !== null) {
          const existing = session.messages.find(message =>
            message.request_id === validated.request_id && message.role === validated.role);
          if (existing) {
            if (messageComparable(existing) !== messageComparable(validated)) {
              fail('REQUEST_CONFLICT', 'This project already has a different message for that request ID and role.');
            }
            return existing;
          }
        }
        if (session.messages.length >= LOCAL_CHAT_LIMITS.messages) {
          fail('MESSAGE_LIMIT', 'This conversation has reached its explicit limit of 1000 messages. Create another project to continue.');
        }
        const at = timestamp();
        const message = { id: randomUUID(), ...validated, created_at: at };
        if (currentProject.retain_history) writeMessage(id, message, session.messages.length + 1);
        db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(at, id);
        session.messages.push(message);
        return message;
      });
      memory.set(id, session);
      return copy(result);
    },

    close() {
      if (closed) return;
      db.close(); memory.clear(); closed = true;
    },
  });
}
