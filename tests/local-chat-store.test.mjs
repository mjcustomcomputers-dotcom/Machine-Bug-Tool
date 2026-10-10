import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { linkSync, lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createLocalChatStore, LOCAL_CHAT_APPLICATION_ID, LOCAL_CHAT_SCHEMA_VERSION,
  LOCAL_CHAT_DEFAULT_MODEL, LOCAL_CHAT_LIMITS,
} from '../lib/local-chat-store.mjs';

function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-local-chat-test-'));
  const filePath = join(dir, 'mpc-local-chat.sqlite');
  const stores = [];
  const open = (overrides = {}) => {
    const store = createLocalChatStore({ filePath, ...options, ...overrides });
    stores.push(store);
    return store;
  };
  t.after(() => {
    for (const store of stores) store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, filePath, open };
}

function inspect(filePath, fn, { readOnly = true } = {}) {
  const db = new DatabaseSync(filePath, { readOnly });
  try { return fn(db); } finally { db.close(); }
}

const msg = (content = 'Hello', patch = {}) => ({ role: 'user', content, status: 'COMPLETE', ...patch });
const code = suffix => error => error?.code === `LOCAL_CHAT_${suffix}`;
const hash = filePath => createHash('sha256').update(readFileSync(filePath)).digest('hex');

test('fresh database has separate application, schema receipt, and deterministic saved preferences', t => {
  const f = fixture(t, { now: () => '2026-10-09T16:00:00.000Z' });
  const store = f.open();
  assert.deepEqual(store.listProjects(), []);
  const project = store.createProject({ name: '  Research  ' });
  assert.equal(project.name, 'Research');
  assert.equal(project.retain_history, false);
  assert.equal(project.selected_model, LOCAL_CHAT_DEFAULT_MODEL);
  assert.equal(project.instructions, '');
  assert.equal(project.created_at, '2026-10-09T16:00:00.000Z');
  assert.deepEqual(store.getProject(project.id), project);
  assert.deepEqual(store.getConversation(project.id), {
    project, messages: [], draft: '', settings: {
      retain_history: false, instructions: '', selected_model: LOCAL_CHAT_DEFAULT_MODEL,
    },
  });
  inspect(f.filePath, db => {
    assert.equal(db.prepare('PRAGMA application_id').get().application_id, LOCAL_CHAT_APPLICATION_ID);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, LOCAL_CHAT_SCHEMA_VERSION);
    assert.match(db.prepare('SELECT schema_sha256 FROM store_metadata').get().schema_sha256, /^[a-f0-9]{64}$/u);
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  });
  if (process.platform !== 'win32') assert.equal(lstatSync(f.filePath).mode & 0o777, 0o600);
});

test('retention off keeps message, attachment, and draft text only in session memory', t => {
  const f = fixture(t), store = f.open();
  const project = store.createProject({ name: 'Private session' });
  const content = 'RAW_SESSION_MESSAGE_c2f764db';
  const attachment = 'RAW_SESSION_ATTACHMENT_8a2cbdea';
  const draft = 'RAW_SESSION_DRAFT_18d2c434';
  store.appendMessage(project.id, msg(content, { attachments: [{ name: 'notes.txt', text: attachment }] }));
  store.saveDraft(project.id, draft);
  assert.equal(store.getConversation(project.id).messages[0].attachments[0].text, attachment);
  assert.equal(store.getConversation(project.id).draft, draft);
  inspect(f.filePath, db => {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM drafts').get().n, 0);
  });
  const bytes = readFileSync(f.filePath);
  for (const text of [content, attachment, draft]) assert.equal(bytes.includes(Buffer.from(text)), false);
  store.close();
  const reopened = f.open();
  assert.equal(reopened.getProject(project.id).name, 'Private session');
  assert.deepEqual(reopened.getConversation(project.id).messages, []);
  assert.equal(reopened.getConversation(project.id).draft, '');
});

test('explicit instructions and selected model persist even when history is session-only', t => {
  const f = fixture(t), store = f.open();
  const p = store.createProject({ name: 'Assistant preferences' });
  const updated = store.updateProject(p.id, { instructions: 'Explain sources plainly.', selected_model: 'qwen3:4b-instruct', name: 'Configured' });
  assert.equal(updated.retain_history, false);
  store.close();
  const reopened = f.open();
  assert.equal(reopened.getProject(p.id).instructions, 'Explain sources plainly.');
  assert.equal(reopened.getConversation(p.id).settings.selected_model, 'qwen3:4b-instruct');
  assert.equal(reopened.getProject(p.id).name, 'Configured');
});

test('retained conversation, attachment, statuses, IDs, order, and draft survive restart', t => {
  const f = fixture(t), store = f.open();
  const p = store.createProject({ name: 'Retained', retain_history: true });
  const first = store.appendMessage(p.id, msg('Question', { request_id: 'request-1', attachments: [{ name: 'log.txt', text: 'line 1\nline 2' }] }));
  const second = store.appendMessage(p.id, msg('Answer', { role: 'assistant', model: 'mpc-daybreak-local', request_id: 'request-1' }));
  store.saveDraft(p.id, 'Next question');
  const before = store.getConversation(p.id);
  store.close();
  const reopened = f.open();
  assert.deepEqual(reopened.getConversation(p.id), before);
  assert.deepEqual(reopened.getConversation(p.id).messages, [first, second]);
});

test('enabling retention flushes current RAM conversation and draft transactionally', t => {
  const f = fixture(t), store = f.open();
  const p = store.createProject({ name: 'Later retained' });
  const message = store.appendMessage(p.id, msg('Keep this later', { request_id: 'turn-1' }));
  store.saveDraft(p.id, 'Unsent draft');
  assert.equal(store.updateProject(p.id, { retain_history: true }).retain_history, true);
  inspect(f.filePath, db => {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages WHERE project_id = ?').get(p.id).n, 1);
    assert.equal(db.prepare('SELECT content FROM drafts WHERE project_id = ?').get(p.id).content, 'Unsent draft');
  });
  store.close();
  const reopened = f.open();
  assert.deepEqual(reopened.getConversation(p.id).messages, [message]);
  assert.equal(reopened.getConversation(p.id).draft, 'Unsent draft');
});

test('disabling retention removes saved rows, keeps this session, and clears deleted text pages', t => {
  const f = fixture(t), store = f.open();
  const p = store.createProject({ name: 'Disable retention', retain_history: true });
  const rawMessage = 'DISABLE_MESSAGE_8500c56c_' + 'q'.repeat(10000);
  const rawAttachment = 'DISABLE_ATTACHMENT_918aa9d6';
  const rawDraft = 'DISABLE_DRAFT_84aa0a9a';
  store.appendMessage(p.id, msg(rawMessage, { attachments: [{ name: 'capture.txt', text: rawAttachment }] }));
  store.saveDraft(p.id, rawDraft);
  const before = store.getConversation(p.id);
  store.updateProject(p.id, { retain_history: false });
  const after = store.getConversation(p.id);
  assert.deepEqual(after.messages, before.messages);
  assert.equal(after.draft, rawDraft);
  inspect(f.filePath, db => {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM drafts').get().n, 0);
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'delete');
  });
  const bytes = readFileSync(f.filePath);
  for (const text of ['DISABLE_MESSAGE_8500c56c_', rawAttachment, rawDraft]) {
    assert.equal(bytes.includes(Buffer.from(text)), false);
  }
  store.close();
  const reopened = f.open();
  assert.equal(reopened.getProject(p.id).retain_history, false);
  assert.deepEqual(reopened.getConversation(p.id).messages, []);
  assert.equal(reopened.getConversation(p.id).draft, '');
});

test('retention can be toggled repeatedly without duplicate history or loss within the session', t => {
  const f = fixture(t), store = f.open();
  const p = store.createProject({ name: 'Toggle' });
  store.appendMessage(p.id, msg('first', { request_id: 'first' }));
  store.updateProject(p.id, { retain_history: true });
  store.updateProject(p.id, { retain_history: true });
  store.updateProject(p.id, { retain_history: false });
  store.appendMessage(p.id, msg('second', { request_id: 'second' }));
  store.updateProject(p.id, { retain_history: true });
  store.close();
  assert.deepEqual(f.open().getConversation(p.id).messages.map(message => message.content), ['first', 'second']);
});

test('project IDs scope history, settings, drafts, and request deduplication exactly', t => {
  const f = fixture(t), store = f.open();
  const a = store.createProject({ name: 'A', retain_history: true });
  const b = store.createProject({ name: 'B', retain_history: true });
  store.appendMessage(a.id, msg('A text', { request_id: 'same-request' }));
  store.appendMessage(b.id, msg('B text', { request_id: 'same-request' }));
  store.saveDraft(a.id, 'A draft'); store.saveDraft(b.id, 'B draft');
  store.updateProject(a.id, { instructions: 'A instructions', retain_history: false });
  assert.equal(store.getConversation(a.id).messages[0].content, 'A text');
  assert.equal(store.getConversation(b.id).messages[0].content, 'B text');
  assert.equal(store.getConversation(b.id).draft, 'B draft');
  assert.equal(store.getProject(b.id).instructions, '');
  store.close();
  const reopened = f.open();
  assert.equal(reopened.getConversation(a.id).messages.length, 0);
  assert.equal(reopened.getConversation(b.id).messages[0].content, 'B text');
});

for (const retain_history of [false, true]) {
  test(`identical request and role append is idempotent with retain_history=${retain_history}`, t => {
    const f = fixture(t), store = f.open();
    const p = store.createProject({ name: 'Deduplication', retain_history });
    const input = msg('same', { request_id: 'r1', attachments: [{ name: 'a.txt', text: 'data' }] });
    const first = store.appendMessage(p.id, input);
    const updatedAt = store.getProject(p.id).updated_at;
    assert.deepEqual(store.appendMessage(p.id, input), first);
    assert.equal(store.getProject(p.id).updated_at, updatedAt);
    assert.equal(store.getConversation(p.id).messages.length, 1);
    assert.notEqual(store.appendMessage(p.id, { ...input, role: 'assistant' }).id, first.id);
    assert.equal(store.getConversation(p.id).messages.length, 2);
  });
}

test('deduplication survives restart and conflicts preserve the original message', t => {
  const f = fixture(t), store = f.open();
  const p = store.createProject({ name: 'Conflict', retain_history: true });
  const input = msg('original', { request_id: 'turn-1', model: 'qwen3:4b-instruct' });
  const original = store.appendMessage(p.id, input);
  store.close();
  const reopened = f.open();
  assert.deepEqual(reopened.appendMessage(p.id, input), original);
  for (const patch of [
    { content: 'changed' }, { status: 'ERROR' }, { model: 'another-model' },
    { attachments: [{ name: 'new.txt', text: 'new' }] },
  ]) assert.throws(() => reopened.appendMessage(p.id, { ...input, ...patch }), code('REQUEST_CONFLICT'));
  assert.deepEqual(reopened.getConversation(p.id).messages, [original]);
});

test('null request IDs permit intentional separate messages without accidental deduplication', t => {
  const f = fixture(t), store = f.open(), p = store.createProject({ name: 'No request ID' });
  const first = store.appendMessage(p.id, msg('repeat'));
  const second = store.appendMessage(p.id, msg('repeat'));
  assert.notEqual(first.id, second.id);
  assert.equal(store.getConversation(p.id).messages.length, 2);
});

test('incomplete, error, and cancelled assistant text is preserved with explicit status', t => {
  const f = fixture(t), store = f.open(), p = store.createProject({ name: 'Interrupted', retain_history: true });
  for (const status of ['COMPLETE', 'INCOMPLETE', 'ERROR', 'CANCELLED']) {
    store.appendMessage(p.id, msg(status === 'CANCELLED' ? '' : `Text for ${status}`, { role: 'assistant', status, request_id: status }));
  }
  store.close();
  assert.deepEqual(f.open().getConversation(p.id).messages.map(message => message.status), ['COMPLETE', 'INCOMPLETE', 'ERROR', 'CANCELLED']);
});

test('stored and session return values cannot mutate history or attachment contents', t => {
  const f = fixture(t), store = f.open(), p = store.createProject({ name: 'Copies' });
  const input = msg('hello', { attachments: [{ name: 'x.txt', text: 'original' }] });
  const message = store.appendMessage(p.id, input);
  input.attachments[0].text = 'changed input';
  message.attachments[0].text = 'changed return';
  const view = store.getConversation(p.id);
  view.messages[0].content = 'changed view';
  view.messages[0].attachments[0].text = 'changed view attachment';
  view.project.name = 'changed name';
  assert.equal(store.getConversation(p.id).messages[0].attachments[0].text, 'original');
  assert.equal(store.getConversation(p.id).messages[0].content, 'hello');
  assert.equal(store.getProject(p.id).name, 'Copies');
});

test('clear draft removes the retained draft and restart returns an empty string', t => {
  const f = fixture(t), store = f.open(), p = store.createProject({ name: 'Clear draft', retain_history: true });
  store.saveDraft(p.id, 'DRAFT_TO_CLEAR_0f4af0f8');
  assert.equal(store.saveDraft(p.id, '').draft, '');
  inspect(f.filePath, db => assert.equal(db.prepare('SELECT COUNT(*) AS n FROM drafts').get().n, 0));
  store.close();
  assert.equal(f.open().getConversation(p.id).draft, '');
  assert.equal(readFileSync(f.filePath).includes(Buffer.from('DRAFT_TO_CLEAR_0f4af0f8')), false);
});

test('exact bound values are accepted, over-limit input is rejected without mutation', t => {
  const f = fixture(t), store = f.open(), p = store.createProject({ name: 'n'.repeat(120), retain_history: true });
  store.updateProject(p.id, { instructions: 'i'.repeat(16000) });
  store.saveDraft(p.id, 'd'.repeat(64000));
  const accepted = store.appendMessage(p.id, msg('m'.repeat(256000), { attachments: [
    { name: 'a'.repeat(240), text: 'a'.repeat(32000) },
    { name: 'b', text: 'b'.repeat(32000) },
  ] }));
  assert.equal(accepted.content.length, 256000);
  const before = store.getConversation(p.id);
  for (const fn of [
    () => store.createProject({ name: 'n'.repeat(121) }),
    () => store.updateProject(p.id, { instructions: 'i'.repeat(16001) }),
    () => store.saveDraft(p.id, 'd'.repeat(64001)),
    () => store.appendMessage(p.id, msg('m'.repeat(256001))),
    () => store.appendMessage(p.id, msg('x', { attachments: [{ name: 'a'.repeat(241), text: '' }] })),
    () => store.appendMessage(p.id, msg('x', { attachments: [{ name: 'a', text: 'a'.repeat(32001) }] })),
    () => store.appendMessage(p.id, msg('x', { attachments: [{ name: 'a', text: 'a'.repeat(32000) }, { name: 'b', text: 'b'.repeat(32000) }, { name: 'c', text: 'c' }] })),
    () => store.appendMessage(p.id, msg('x', { attachments: Array.from({ length: 9 }, () => ({ name: 'a', text: '' })) })),
  ]) assert.throws(fn, code('INVALID_INPUT'));
  assert.deepEqual(store.getConversation(p.id), before);
  store.close();
  assert.equal(f.open().getConversation(p.id).messages[0].content.length, 256000);
});

test('malformed API inputs cannot coerce types or add unexpected persisted fields', t => {
  const f = fixture(t), store = f.open(), p = store.createProject({ name: 'Validation' });
  for (const input of [null, [], {}, { name: '' }, { name: '  ' }, { name: 'a\n' }, { name: 1 }, { name: 'a', retain_history: 1 }, { name: 'a', raw_text: 'unspecified' }]) {
    assert.throws(() => store.createProject(input), code('INVALID_INPUT'));
  }
  for (const patch of [{ retain_history: 'false' }, { name: undefined }, { instructions: null }, { selected_model: '' }, { selected_model: 'bad model' }, { id: 'other-project' }]) {
    assert.throws(() => store.updateProject(p.id, patch), code('INVALID_INPUT'));
  }
  for (const input of [null, [], { ...msg(), role: 'system' }, { ...msg(), status: 'DONE' }, { ...msg(), content: 42 },
    { ...msg(), request_id: '' }, { ...msg(), request_id: 1 }, { ...msg(), request_id: 'bad\0id' },
    { ...msg(), model: 'qwen\n' }, { ...msg(), attachments: null }, { ...msg(), attachments: new Array(1) },
    { ...msg(), attachments: [{ name: 'x', text: 'y', extra: 'z' }] },
    { ...msg(), attachments: [{ name: 'x' }] }, { ...msg(), extra: 'raw text' },
  ]) assert.throws(() => store.appendMessage(p.id, input), code('INVALID_INPUT'));
  assert.equal(store.listProjects().length, 1);
  assert.deepEqual(store.getConversation(p.id).messages, []);
});

test('unknown, case-changed, and injection-shaped project IDs cannot read or change another project', t => {
  const f = fixture(t), store = f.open(), p = store.createProject({ name: 'Scoped' });
  store.appendMessage(p.id, msg("literal '; DROP TABLE projects; --"));
  for (const id of ['unknown', "' OR 1=1 --", p.id.toUpperCase()]) {
    assert.throws(() => store.getProject(id), code('PROJECT_NOT_FOUND'));
    assert.throws(() => store.getConversation(id), code('PROJECT_NOT_FOUND'));
    assert.throws(() => store.appendMessage(id, msg()), code('PROJECT_NOT_FOUND'));
    assert.throws(() => store.saveDraft(id, 'draft'), code('PROJECT_NOT_FOUND'));
    assert.throws(() => store.updateProject(id, { name: 'changed' }), code('PROJECT_NOT_FOUND'));
  }
  for (const id of [1, null, '', 'a\0b']) assert.throws(() => store.getProject(id), code('INVALID_INPUT'));
  assert.equal(store.listProjects().length, 1);
  assert.equal(store.getProject(p.id).name, 'Scoped');
});

test('project and conversation limits are explicit and do not silently delete history', t => {
  const f = fixture(t), store = f.open();
  const p = store.createProject({ name: 'Limits' });
  for (let index = 1; index < LOCAL_CHAT_LIMITS.projects; index++) store.createProject({ name: `Project ${index}` });
  assert.throws(() => store.createProject({ name: 'Too many' }), code('PROJECT_LIMIT'));
  assert.equal(store.listProjects().length, 100);
  for (let index = 0; index < LOCAL_CHAT_LIMITS.messages; index++) {
    store.appendMessage(p.id, msg(`Message ${index}`, { request_id: `r${index}` }));
  }
  assert.throws(() => store.appendMessage(p.id, msg('overflow')), code('MESSAGE_LIMIT'));
  assert.equal(store.getConversation(p.id).messages.length, 1000);
  assert.equal(store.getConversation(p.id).messages[0].content, 'Message 0');
  assert.equal(store.appendMessage(p.id, msg('Message 0', { request_id: 'r0' })).content, 'Message 0');
  store.updateProject(p.id, { retain_history: true });
  store.close();
  const reopened = f.open();
  assert.equal(reopened.getConversation(p.id).messages.length, 1000);
  assert.throws(() => reopened.appendMessage(p.id, msg('overflow')), code('MESSAGE_LIMIT'));
});

test('project ordering follows successful work and empty updates preserve timestamps', t => {
  let tick = 0;
  const f = fixture(t, { now: () => new Date(Date.UTC(2026, 9, 9, 0, 0, tick++)) });
  const store = f.open();
  const a = store.createProject({ name: 'A' }), b = store.createProject({ name: 'B' });
  assert.deepEqual(store.listProjects().map(item => item.id), [b.id, a.id]);
  store.saveDraft(a.id, 'Active');
  assert.deepEqual(store.listProjects().map(item => item.id), [a.id, b.id]);
  const before = store.getProject(a.id);
  assert.deepEqual(store.updateProject(a.id, {}), before);
});

test('invalid clock during a retention transition rolls back disk and preserves session history', t => {
  let clockValue = '2026-10-09T16:00:00.000Z';
  const f = fixture(t, { now: () => clockValue }), store = f.open();
  const p = store.createProject({ name: 'Clock' });
  store.appendMessage(p.id, msg('Session retained in RAM'));
  store.saveDraft(p.id, 'draft');
  const before = store.getConversation(p.id);
  clockValue = 'not a timestamp';
  assert.throws(() => store.updateProject(p.id, { retain_history: true }), code('INVALID_CLOCK'));
  assert.deepEqual(store.getConversation(p.id), before);
  inspect(f.filePath, db => assert.equal(db.prepare('SELECT COUNT(*) AS n FROM messages').get().n, 0));
  assert.throws(() => store.appendMessage(p.id, msg('must not append')), code('INVALID_CLOCK'));
  assert.deepEqual(store.getConversation(p.id), before);
});

test('unrelated Workbench-like database is rejected without changing its bytes or user_version', t => {
  const f = fixture(t);
  inspect(f.filePath, db => {
    db.exec("PRAGMA user_version = 1; CREATE TABLE workbench_queue (id TEXT, status TEXT CHECK (status = 'NOT_SENT')); INSERT INTO workbench_queue VALUES ('w1', 'NOT_SENT');");
  }, { readOnly: false });
  const before = hash(f.filePath);
  assert.throws(() => f.open(), code('STORE_IDENTITY_MISMATCH'));
  assert.equal(hash(f.filePath), before);
  inspect(f.filePath, db => {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
    assert.equal(db.prepare('SELECT status FROM workbench_queue').get().status, 'NOT_SENT');
  });
});

test('preexisting empty files and non-SQLite files are not initialized or overwritten', t => {
  const f = fixture(t);
  writeFileSync(f.filePath, '');
  assert.throws(() => f.open(), code('STORE_IDENTITY_MISMATCH'));
  assert.equal(readFileSync(f.filePath).length, 0);
  writeFileSync(f.filePath, 'ordinary user document');
  const before = hash(f.filePath);
  assert.throws(() => f.open());
  assert.equal(hash(f.filePath), before);
});

for (const mutation of [
  { name: 'user version', sql: 'PRAGMA user_version = 2', error: 'STORE_IDENTITY_MISMATCH' },
  { name: 'application identity', sql: 'PRAGMA application_id = 123', error: 'STORE_IDENTITY_MISMATCH' },
  { name: 'extra table', sql: 'CREATE TABLE surprise (id TEXT)', error: 'SCHEMA_IDENTITY_MISMATCH' },
  { name: 'extra index', sql: 'CREATE INDEX surprise_index ON projects(name)', error: 'SCHEMA_IDENTITY_MISMATCH' },
  { name: 'missing trigger', sql: 'DROP TRIGGER retain_messages_insert', error: 'SCHEMA_IDENTITY_MISMATCH' },
  { name: 'schema receipt', sql: "UPDATE store_metadata SET schema_sha256 = '0000000000000000000000000000000000000000000000000000000000000000'", error: 'SCHEMA_IDENTITY_MISMATCH' },
]) {
  test(`admission rejects changed ${mutation.name} without repair or overwrite`, t => {
    const f = fixture(t), store = f.open();
    store.createProject({ name: 'Existing' }); store.close();
    inspect(f.filePath, db => db.exec(mutation.sql), { readOnly: false });
    const before = hash(f.filePath);
    assert.throws(() => f.open(), code(mutation.error));
    assert.equal(hash(f.filePath), before);
  });
}

test('admission rejects malformed attachment data even when basic SQLite JSON checks pass', t => {
  const f = fixture(t), store = f.open();
  const p = store.createProject({ name: 'Integrity', retain_history: true });
  store.appendMessage(p.id, msg('original')); store.close();
  inspect(f.filePath, db => {
    db.prepare('UPDATE messages SET attachments_json = ? WHERE project_id = ?')
      .run(JSON.stringify([{ name: 'log.txt', text: 42 }]), p.id);
  }, { readOnly: false });
  const before = hash(f.filePath);
  assert.throws(() => f.open(), code('STORE_INTEGRITY_MISMATCH'));
  assert.equal(hash(f.filePath), before);
});

test('admission rejects broken message order instead of silently renumbering retained evidence', t => {
  const f = fixture(t), store = f.open();
  const p = store.createProject({ name: 'Order', retain_history: true });
  store.appendMessage(p.id, msg('first')); store.appendMessage(p.id, msg('second')); store.close();
  inspect(f.filePath, db => db.prepare('DELETE FROM messages WHERE project_id = ? AND position = 1').run(p.id), { readOnly: false });
  assert.throws(() => f.open(), code('STORE_INTEGRITY_MISMATCH'));
});

test('SQL retention triggers prevent direct message/draft persistence with retention disabled', t => {
  const f = fixture(t), store = f.open(), p = store.createProject({ name: 'Private' });
  inspect(f.filePath, db => {
    assert.throws(() => db.prepare(`INSERT INTO messages
      (id, project_id, position, role, content, status, model, request_id, attachments_json, created_at)
      VALUES ('m1', ?, 1, 'user', 'raw', 'COMPLETE', NULL, NULL, '[]', '2026-10-09T00:00:00.000Z')`).run(p.id), /LOCAL_CHAT_RETENTION_REQUIRED/u);
    assert.throws(() => db.prepare('INSERT INTO drafts VALUES (?, ?, ?)').run(p.id, 'raw draft', '2026-10-09T00:00:00.000Z'), /LOCAL_CHAT_RETENTION_REQUIRED/u);
  }, { readOnly: false });
  store.updateProject(p.id, { retain_history: true });
  store.appendMessage(p.id, msg('retained'));
  inspect(f.filePath, db => {
    assert.throws(() => db.prepare('UPDATE projects SET retain_history = 0 WHERE id = ?').run(p.id), /LOCAL_CHAT_DELETE_HISTORY_FIRST/u);
  }, { readOnly: false });
  assert.equal(store.getProject(p.id).retain_history, true);
});

test('path guards reject missing path, SQLite URI, symlinks, extra hard links, and directories', t => {
  const f = fixture(t), store = f.open(); store.close();
  for (const filePath of [undefined, '', ':memory:', 'file:test.sqlite?mode=memory', 'a\0b']) {
    assert.throws(() => createLocalChatStore({ filePath }), code('UNSAFE_PATH'));
  }
  assert.throws(() => createLocalChatStore({ filePath: f.dir }), code('UNSAFE_PATH'));
  const hardLink = join(f.dir, 'hard.sqlite');
  linkSync(f.filePath, hardLink);
  assert.throws(() => createLocalChatStore({ filePath: hardLink }), code('UNSAFE_PATH'));
  rmSync(hardLink);
  if (process.platform !== 'win32') {
    const symlink = join(f.dir, 'linked.sqlite');
    symlinkSync(f.filePath, symlink);
    assert.throws(() => createLocalChatStore({ filePath: symlink }), code('UNSAFE_PATH'));
    const parentLink = join(f.dir, 'linked-parent');
    symlinkSync(f.dir, parentLink, 'dir');
    assert.throws(() => createLocalChatStore({ filePath: join(parentLink, 'new.sqlite') }), code('UNSAFE_PATH'));
    const unusualLink = join(f.dir, 'literal\\backslash.sqlite');
    symlinkSync(f.filePath, unusualLink);
    assert.throws(() => createLocalChatStore({ filePath: unusualLink }), code('UNSAFE_PATH'));
  }
});

test('close is idempotent and all subsequent reads and writes reject access', t => {
  const f = fixture(t), store = f.open(), p = store.createProject({ name: 'Close' });
  store.close(); store.close();
  for (const fn of [
    () => store.listProjects(), () => store.getProject(p.id), () => store.getConversation(p.id),
    () => store.createProject({ name: 'After close' }), () => store.updateProject(p.id, { name: 'After close' }),
    () => store.saveDraft(p.id, 'draft'), () => store.appendMessage(p.id, msg()),
  ]) assert.throws(fn, code('CLOSED'));
});
