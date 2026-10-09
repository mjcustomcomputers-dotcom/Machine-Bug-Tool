import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {isPathWithin} from '../lib/local-path-boundary.mjs';

test('a POSIX child is admitted and root equality requires explicit admission', () => {
 const options = {pathImpl:path.posix};
 assert.equal(isPathWithin('/repo/.sites-runtime', '/repo/.sites-runtime/controllers/state.json', options), true);
 assert.equal(isPathWithin('/repo/.sites-runtime', '/repo/.sites-runtime', options), false);
 assert.equal(isPathWithin('/repo/.sites-runtime', '/repo/.sites-runtime', {...options,allowRoot:true}), true);
});

test('parent traversal and sibling prefixes remain outside the POSIX root', () => {
 const options = {pathImpl:path.posix};
 for(const candidate of ['/repo', '/repo/.sites-runtime-other/state.json', '/repo/.sites-runtime/../state.json']) {
  assert.equal(isPathWithin('/repo/.sites-runtime', candidate, options), false, candidate);
 }
});

test('Windows same-drive children and case variants use Windows path semantics', () => {
 const options = {pathImpl:path.win32};
 assert.equal(isPathWithin('C:\\Repo\\.sites-runtime', 'c:\\repo\\.SITES-RUNTIME\\controllers\\state.json', options), true);
 assert.equal(isPathWithin('C:\\Repo\\.sites-runtime', 'c:\\REPO\\.sites-runtime', options), false);
 assert.equal(isPathWithin('C:\\Repo\\.sites-runtime', 'c:\\REPO\\.sites-runtime', {...options,allowRoot:true}), true);
 for(const candidate of ['C:\\Repo', 'C:\\Repo\\.sites-runtime-other\\state.json', 'C:\\Repo\\.sites-runtime\\..\\state.json']) {
  assert.equal(isPathWithin('C:\\Repo\\.sites-runtime', candidate, options), false, candidate);
 }
});

test('different Windows drives are rejected even when root equality is allowed', () => {
 const root = 'C:\\Repo\\.sites-runtime';
 for(const candidate of ['D:\\Repo\\.sites-runtime\\state.json', 'd:\\repo\\.sites-runtime\\state.json']) {
  assert.equal(path.win32.isAbsolute(path.win32.relative(root, candidate)), true);
  assert.equal(isPathWithin(root, candidate, {pathImpl:path.win32}), false, candidate);
  assert.equal(isPathWithin(root, candidate, {pathImpl:path.win32,allowRoot:true}), false, candidate);
 }
});

test('UNC children are admitted while a different share or server is outside', () => {
 const root = '\\\\server\\share\\repo\\.sites-runtime';
 const options = {pathImpl:path.win32};
 assert.equal(isPathWithin(root, '\\\\SERVER\\SHARE\\repo\\.sites-runtime\\state.json', options), true);
 for(const candidate of ['\\\\server\\other-share\\repo\\.sites-runtime\\state.json', '\\\\other-server\\share\\repo\\.sites-runtime\\state.json']) {
  assert.equal(isPathWithin(root, candidate, options), false, candidate);
 }
});

test('the former parent-only check admits a cross-drive escape that the guard rejects', () => {
 const root = 'C:\\Repo\\.sites-runtime', candidate = 'D:\\unrelated\\state.json';
 const relative = path.win32.relative(root, candidate);
 const admittedByFormerCheck = relative !== '' && relative !== '..' && !relative.startsWith('..' + path.win32.sep);
 assert.equal(admittedByFormerCheck, true);
 assert.equal(isPathWithin(root, candidate, {pathImpl:path.win32}), false);
});

test('the default implementation preserves the host filesystem semantics', () => {
 const root = path.resolve('local-boundary-root');
 assert.equal(isPathWithin(root, path.join(root, 'state.json')), true);
 assert.equal(isPathWithin(root, path.dirname(root)), false);
});
