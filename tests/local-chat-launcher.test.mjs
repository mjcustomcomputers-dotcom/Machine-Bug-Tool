import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('../scripts/start-mpc-local-chat.mjs', import.meta.url));
async function environment(t) {
  const directory = await mkdtemp(join(tmpdir(), 'mpc-launcher-'));
  const children = new Set();
  t.after(async () => {for (const child of children) {child.kill('SIGTERM'); await child.finished;} await rm(directory, {recursive: true, force: true});});
  function launch() {
    const child = spawn(process.execPath, [script, '--no-open', '--data-dir', directory], {stdio: ['ignore', 'pipe', 'pipe']});
    child.output = ''; child.stdout.on('data', bytes => {child.output += bytes;}); child.stderr.on('data', bytes => {child.output += bytes;});
    child.finished = new Promise((done, reject) => {child.once('error', reject); child.once('exit', (code, signal) => {children.delete(child); done({code, signal});});});
    children.add(child); return child;
  }
  async function ready(child) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const match = child.output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) return match[0];
      if (child.exitCode !== null) throw new Error(child.output);
      await new Promise(done => setTimeout(done, 20));
    }
    throw new Error('Launcher did not become ready: ' + child.output);
  }
  return {directory, launch, ready, lock: join(directory, 'local-chat-instance.json')};
}

test('actual CLI opens a loopback service, reuses its single instance, and closes its owned lock cleanly', async t => {
  const e = await environment(t), first = e.launch(), url = await e.ready(first);
  const response = await fetch(url); assert.equal(response.status, 200); assert.match(await response.text(), /MPC Workspace/);
  const record = JSON.parse(await readFile(e.lock, 'utf8')); assert.equal(record.url, url); assert.equal(record.pid, first.pid);
  const second = e.launch(); const stopped = await second.finished;
  assert.equal(stopped.code, 0, second.output); assert.match(second.output, /already running/); assert.ok(second.output.includes(url));
  assert.equal(JSON.parse(await readFile(e.lock, 'utf8')).owner, record.owner);
  first.kill('SIGTERM'); assert.equal((await first.finished).code, 0);
  await assert.rejects(access(e.lock), {code: 'ENOENT'});
  await access(join(e.directory, 'mpc-local-chat.sqlite'));
});

test('known stale lock is recovered without discarding the saved database', async t => {
  const e = await environment(t), child = e.launch(), url = await e.ready(child);
  const token = (await (await fetch(url + '/api/local/session')).json()).token;
  const response = await fetch(url + '/api/local/projects', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-MPC-Token': token}, body: JSON.stringify({name: 'Resume this project', retain_history: true})});
  assert.equal(response.status, 201);
  const record = JSON.parse(await readFile(e.lock, 'utf8')); child.kill('SIGTERM'); await child.finished;
  await writeFile(e.lock, JSON.stringify(record));
  const reopened = e.launch(), newUrl = await e.ready(reopened);
  const projects = await (await fetch(newUrl + '/api/local/projects')).json();
  assert.equal(projects.projects[0].name, 'Resume this project');
  assert.notEqual(JSON.parse(await readFile(e.lock, 'utf8')).owner, record.owner);
});

test('unknown instance file is preserved and reported rather than overwritten', async t => {
  const e = await environment(t), original = '{"belongs_to":"another application"}';
  await writeFile(e.lock, original); const child = e.launch(); assert.equal((await child.finished).code, 1);
  assert.match(child.output, /unknown identity/); assert.equal(await readFile(e.lock, 'utf8'), original);
  await assert.rejects(access(join(e.directory, 'mpc-local-chat.sqlite')), {code: 'ENOENT'});
});
