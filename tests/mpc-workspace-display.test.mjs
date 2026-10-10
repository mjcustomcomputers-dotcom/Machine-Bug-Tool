import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {
  API_PATHS,
  connectionInputGuidance,
  formatChatTranscript,
  nextInterfaceZoom,
  readSetupEvents,
  renderComposerVisibility
} from '../desktop/renderer/app.js';

test('plain text output preserves multiline code, Unicode and visible message order', () => {
  const code = '```sql\nSELECT "café", 42;\n```\nPath: C:\\Work\\evidence.txt';
  const messages = [{role: 'user', text: 'Summarize this →'}, {role: 'assistant', label: 'MPC Assistant', text: code}];
  const before = structuredClone(messages);
  assert.equal(formatChatTranscript(messages), `You\nSummarize this →\n\nMPC Assistant\n${code}`);
  assert.deepEqual(messages, before);
  assert.equal(formatChatTranscript([]), '');
  assert.throws(() => formatChatTranscript(null), /CHAT_MESSAGES_ARRAY_REQUIRED/u);
});

test('the actual chat key handler sends Enter, preserves Shift-newline and ignores IME composition', () => {
  const source = readFileSync(new URL('../desktop/renderer/app.js', import.meta.url), 'utf8');
  const start = source.indexOf("$('composer-input').addEventListener('keydown', event => {");
  const end = source.indexOf('\n  });', start) + '\n  });'.length;
  assert.ok(start >= 0 && end > start);
  let handler, sent = 0, prevented = 0, disabled = false;
  runInNewContext(source.slice(start, end), {
    $: id => id === 'composer-input' ? {addEventListener: (_name, fn) => {handler = fn;}} : {get disabled() {return disabled;}},
    runWork: () => {sent++;}
  });
  const key = extra => handler({key: 'Enter', shiftKey: false, altKey: false, isComposing: false, keyCode: 13, preventDefault: () => {prevented++;}, ...extra});
  key({}); assert.equal(sent, 1); assert.equal(prevented, 1);
  key({ctrlKey: true}); assert.equal(sent, 2);
  key({shiftKey: true}); key({isComposing: true}); key({keyCode: 229}); key({key: 'a'});
  assert.equal(sent, 2); assert.equal(prevented, 2);
  disabled = true; key({}); assert.equal(sent, 2);
});

// These fixtures exercise visibility and retained input identity. They do not
// simulate a browser's layout, native display scaling, or pointer capture.
function composerFixture() {
  const question = Object.freeze({value: 'Compare this draft with the previous snapshot.', selectionStart: 8, selectionEnd: 18});
  const material = Object.freeze({value: 'An acquired record stays selected while chat is hidden.'});
  const attachments = Object.freeze([
    Object.freeze({name: 'selected-folder', path: 'C:\\Research\\selected-folder', kind: 'FOLDER'}),
    Object.freeze({name: 'record.txt', kind: 'FILE', size: 120})
  ]);
  const conversation = Object.freeze({
    id: 'conversation', scrollTop: 96,
    children: Object.freeze([Object.freeze({role: 'assistant', textContent: 'The selected records differ in their recorded version.'})])
  });
  const children = Object.freeze([question, material, attachments, conversation]);
  const composer = {hidden: false};
  Object.defineProperty(composer, 'children', {value: children, writable: false});
  const attributes = new Map([['aria-controls', 'composer']]);
  const toggle = {textContent: '', setAttribute: (name, value) => attributes.set(name, value)};
  return {composer, toggle, attributes, children, question, material, attachments, conversation};
}

test('hiding and reopening the assistant preserves conversation, draft, selection, evidence and attachment nodes', () => {
  const fixture = composerFixture();
  const {composer, toggle, attributes, children, question, material, attachments, conversation} = fixture;
  for (const [dock, collapsed] of [['floating', true], ['floating', false], ['right', false], ['right', true], ['bottom', false]]) {
    const visible = renderComposerVisibility({composer, toggle, view: 'work', dock, collapsed});
    assert.equal(visible, !collapsed);
    assert.equal(composer.hidden, collapsed);
    assert.equal(attributes.get('aria-expanded'), String(!collapsed));
    assert.equal(attributes.get('aria-controls'), 'composer');
    assert.match(toggle.textContent, collapsed ? /Show|Open/u : /Hide|Close/u);
    assert.strictEqual(composer.children, children);
    assert.strictEqual(composer.children[0], question);
    assert.strictEqual(composer.children[1], material);
    assert.strictEqual(composer.children[2], attachments);
    assert.strictEqual(composer.children[3], conversation);
    assert.equal(question.value, 'Compare this draft with the previous snapshot.');
    assert.equal(question.selectionStart, 8);
    assert.equal(question.selectionEnd, 18);
    assert.equal(material.value, 'An acquired record stays selected while chat is hidden.');
    assert.equal(attachments.length, 2);
    assert.equal(conversation.scrollTop, 96);
    assert.equal(conversation.children[0].textContent, 'The selected records differ in their recorded version.');
  }
});

test('bottom chat hides on other views while explicitly opened side and floating assistants remain available', () => {
  const {composer, toggle, attributes} = composerFixture();
  for (const view of ['connections', 'search', 'evidence', 'methods', 'tasks', 'reports', 'assistant', 'settings']) {
    assert.equal(renderComposerVisibility({composer, toggle, view, dock: 'bottom', collapsed: false}), false, view);
    assert.equal(composer.hidden, true, view);
    assert.match(toggle.textContent, /Show|Open/u);
    assert.equal(attributes.get('aria-expanded'), 'false');
    for (const dock of ['right', 'floating']) {
      assert.equal(renderComposerVisibility({composer, toggle, view, dock, collapsed: false}), true, `${dock} on ${view}`);
      assert.equal(composer.hidden, false);
      assert.equal(attributes.get('aria-expanded'), 'true');
      assert.equal(renderComposerVisibility({composer, toggle, view, dock, collapsed: true}), false, `${dock} can close on ${view}`);
      assert.equal(composer.hidden, true);
      assert.equal(attributes.get('aria-expanded'), 'false');
    }
  }
  assert.equal(renderComposerVisibility({composer, toggle, view: 'work', collapsed: true}), false);
  assert.equal(renderComposerVisibility({composer, toggle, view: 'work', collapsed: false}), true);
});

test('interface size can shrink below 100 percent and remains bounded during repeated wheel steps', () => {
  assert.equal(nextInterfaceZoom(1, -1), 0.9);
  assert.equal(nextInterfaceZoom(0.9, -1), 0.85);
  assert.equal(nextInterfaceZoom(0.85, -1), 0.75);
  assert.equal(nextInterfaceZoom(0.75, -1), 0.6);
  assert.equal(nextInterfaceZoom(0.6, -1), 0.5);
  assert.equal(nextInterfaceZoom(0.5, -1), 0.5);
  assert.equal(nextInterfaceZoom(0.5, 1), 0.6);
  assert.equal(nextInterfaceZoom('1', 1), 1.1);
  assert.equal(nextInterfaceZoom(2, 1), 2);
  let zoom = 1;
  for (let step = 0; step < 25; step += 1) {
    const next = nextInterfaceZoom(zoom, -1);
    assert.ok(next <= zoom && next >= 0.5);
    zoom = next;
  }
  assert.equal(zoom, 0.5);
  for (let step = 0; step < 25; step += 1) {
    const next = nextInterfaceZoom(zoom, 1);
    assert.ok(next >= zoom && next <= 2);
    zoom = next;
  }
  assert.equal(zoom, 2);
  assert.equal(nextInterfaceZoom(Number.NaN, 0), 1);
  assert.equal(nextInterfaceZoom(Infinity, -1), 0.9);
  assert.equal(nextInterfaceZoom(-500, 0), 0.5);
  assert.equal(nextInterfaceZoom(500, 0), 2);
  assert.equal(nextInterfaceZoom(1.08, 1), 1.1);
  assert.equal(nextInterfaceZoom(1.08, -1), 1);
});

test('local model guidance supplies the loopback address and needs no credential reference', () => {
  const local = connectionInputGuidance('OLLAMA');
  assert.equal(local.name, 'Local Ollama');
  assert.equal(local.transport, 'loopback_http');
  assert.equal(local.endpoint, 'http://127.0.0.1:11434');
  assert.equal(local.credential, false);
  assert.equal(local.localSetup, true);
  assert.match(local.help, /Local AI setup/u);
  assert.match(local.help, /only saves connection details/u);
  assert.match(local.endpointHelp, /credential reference blank/u);
});

test('built-in REST adapters advertise exact addresses and remaining MCP forms retain their setup boundary', () => {
  const endpoints={GITHUB:'https://api.github.com',GOOGLE_DRIVE:'https://www.googleapis.com/drive/v3',
    GMAIL:'https://gmail.googleapis.com/gmail/v1',DROPBOX:'https://api.dropboxapi.com/2',LOCAL_MPC:'local-mpc://bundled'};
  for(const [provider,endpoint] of Object.entries(endpoints)){
    const guidance=connectionInputGuidance(provider);
    assert.equal(guidance.endpoint,endpoint);assert.equal(guidance.builtin,true);assert.equal(guidance.transport,'PLUGIN');
    assert.equal(guidance.credential,provider!=='LOCAL_MPC');
  }
  const transports = {
    DROPBOX_DASH: 'PLUGIN',OPENAI_API: 'OPENAI_API', HOSTED_MPC: 'streamable_http', CUSTOM_MCP: 'streamable_http'
  };
  for (const [provider, transport] of Object.entries(transports)) {
    const guidance = connectionInputGuidance(provider);
    assert.equal(guidance.transport, transport, provider);
    assert.equal(guidance.endpoint, '', provider);
    assert.equal(guidance.localSetup, false, provider);
    assert.match(guidance.help, /stock Windows app does not include this connection adapter yet/u, provider);
    assert.match(guidance.endpointHelp, /supplied by your installed host adapter/u, provider);
    assert.doesNotMatch(guidance.endpointHelp, /ghp_|github_pat_|sk-/u, provider);
  }
  assert.equal(connectionInputGuidance('UNKNOWN_PROVIDER').localSetup, false);
  assert.equal(connectionInputGuidance('UNKNOWN_PROVIDER').endpoint, '');
});

test('the actual connection handler sends a typed read instead of catalog prose or an action-like label', async () => {
  const source = readFileSync(new URL('../desktop/renderer/app.js', import.meta.url), 'utf8');
  const handler = source.match(/^async function runConnectionRead\(\)\{[\s\S]*?^\}/mu)?.[0];
  assert.ok(handler, 'the production connection handler must be present');
  for (const firstOperation of ['Read the selected repository and exact commit', 'WRITE_SELECTED_RESOURCE', undefined]) {
    const calls = [], announcements = [], errors = [];
    let refreshes = 0;
    const elements=Object.fromEntries(['connection-include-content','connection-repository','connection-ref','connection-file-path','connection-read-run','connection-read-output','connection-read-copy','connection-read-use'].map(id=>[id,{checked:true,value:id==='connection-repository'?'owner/repo':id==='connection-ref'?'main':'README.md'}]));
    await runInNewContext(`${handler}\nrunConnectionRead()`, {
      readConnection: Object.freeze({connection_id: 'CONNECTION-selected',provider_namespace:'GITHUB', first_operation: firstOperation}),
      readResult:null,$:id=>elements[id],setText:()=>{},
      API_PATHS,
      currentProjectId: () => 'PROJECT-selected',
      request: async (path, options) => {
        calls.push({path, ...structuredClone(options)});
        return {last_operation_verified: true};
      },
      announce: text => announcements.push(text),
      refreshBootstrap: async () => { refreshes += 1; },
      recordError: error => errors.push(error)
    });
    assert.deepEqual(calls, [{path: API_PATHS.connectionTest, method: 'POST', body: {
      project_id: 'PROJECT-selected', connection_id: 'CONNECTION-selected', operation: 'READ_SELECTED_RESOURCE',
      operation_input: {include_content:true,repository:'owner/repo',ref:'main',path:'README.md'}
    }}]);
    assert.equal(refreshes, 1);
    assert.equal(errors.length, 0);
    assert.equal(announcements.length, 1);
  }
});

function setupResponse(chunks, options = {}) {
  let index = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    }
  });
  return new Response(stream, {status: 200, ...options});
}

function encoded(text) {
  return new TextEncoder().encode(text);
}

test('setup progress parses split UTF-8 and NDJSON frames through the completed event', async () => {
  const expected = [
    {type: 'start', request_id: 'setup-1'},
    {type: 'progress', request_id: 'setup-1', progress: {status: 'Downloading…', completed: 42, total: 100}},
    {type: 'done', request_id: 'setup-1', status: 'installed'}
  ];
  const bytes = encoded(expected.map(event => JSON.stringify(event)).join('\r\n'));
  const chunks = Array.from(bytes, byte => Uint8Array.of(byte));
  const response = setupResponse(chunks);
  const received = [];
  await readSetupEvents(response, event => received.push(event));
  assert.deepEqual(received, expected);
  assert.equal(response.body.locked, false);
});

test('truncated, malformed or post-completion setup events cannot be accepted as success', async () => {
  const cases = [
    ['', /MODEL_SETUP_STREAM_INCOMPLETE/u],
    ['{"type":"progress","completed":42}\n', /MODEL_SETUP_STREAM_INCOMPLETE/u],
    ['{"type":"done"', /JSON|property|position|Expected/iu],
    ['{"type":"unregistered"}\n', /MODEL_SETUP_EVENT_INVALID/u],
    ['{"type":"done"}\n{"type":"progress"}\n', /MODEL_SETUP_EVENT_AFTER_COMPLETION/u],
    ['{"type":"done"}\n{"type":"done"}\n', /MODEL_SETUP_EVENT_AFTER_COMPLETION/u]
  ];
  for (const [text, expectedError] of cases) {
    const response = setupResponse([encoded(text)]);
    await assert.rejects(readSetupEvents(response, () => {}), expectedError);
    assert.equal(response.body.locked, false);
  }
});

test('an error callback aborts setup consumption and releases the reader', async () => {
  const response = setupResponse([
    encoded('{"type":"error","error":{"code":"MODEL_DOWNLOAD_FAILED"}}\n'),
    encoded('{"type":"done"}\n')
  ]);
  const seen = [];
  await assert.rejects(readSetupEvents(response, event => {
    seen.push(event.type);
    if (event.type === 'error') throw new Error(event.error.code);
  }), /MODEL_DOWNLOAD_FAILED/u);
  assert.deepEqual(seen, ['error']);
  assert.equal(response.body.locked, false);
});

test('setup frames reject excessive buffering and invalid UTF-8', async () => {
  const oversized = setupResponse([encoded(' '.repeat(262_145))]);
  await assert.rejects(readSetupEvents(oversized, () => assert.fail('oversized input must not emit an event')), /MODEL_SETUP_FRAME_TOO_LARGE/u);
  assert.equal(oversized.body.locked, false);
  const invalid = setupResponse([Uint8Array.of(0xc3, 0x28)]);
  await assert.rejects(readSetupEvents(invalid, () => assert.fail('invalid UTF-8 must not emit an event')), TypeError);
  assert.equal(invalid.body.locked, false);
});

test('setup requires a successful HTTP response with a readable body', async () => {
  await assert.rejects(readSetupEvents(new Response(null, {status: 503}), () => {}), /MODEL_SETUP_HTTP_ERROR|HTTP 503/u);
  await assert.rejects(readSetupEvents(new Response(null, {status: 200}), () => {}), /MODEL_SETUP_HTTP_ERROR|HTTP 200/u);
});
