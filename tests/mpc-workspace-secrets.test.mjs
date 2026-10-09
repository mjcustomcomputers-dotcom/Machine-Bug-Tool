import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {createWorkspaceSecretStore} from '../lib/mpc-workspace-secrets.mjs';
function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'mpc-secrets-test-')),filePath=join(directory,'credentials.enc.json');
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  // The test substitutes a reversible cipher for OS safeStorage. Production
  // platform encryption is intentionally not claimed by this adapter test.
  const key=randomBytes(32),safeStorage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=>undefined,
    encryptString:value=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);},
    decryptString:value=>{const cipher=createDecipheriv('aes-256-gcm',key,value.subarray(0,12));cipher.setAuthTag(value.subarray(-16));return Buffer.concat([cipher.update(value.subarray(12,-16)),cipher.final()]).toString('utf8');}};
  return {filePath,safeStorage,make:()=>createWorkspaceSecretStore({filePath,safeStorage})};
}
test('session credentials are provider-scoped and neither written nor retained after close/restart',async t=>{
  const f=fixture(t),store=f.make();const saved=store.save({provider:'GITHUB',token:'github-user-entered-fixture-token'});
  assert.equal(saved.retention,'SESSION');assert.equal(existsSync(f.filePath),false);
  assert.equal(await store.resolveCredential(saved.reference,{provider:'GITHUB'}),'github-user-entered-fixture-token');
  assert.equal(await store.resolveCredential(saved.reference,{provider:'DROPBOX'}),null);
  assert.doesNotMatch(JSON.stringify(store.status()),/fixture-token/u);
  store.close();assert.equal(await store.resolveCredential(saved.reference,{provider:'GITHUB'}),null);
  assert.equal(await f.make().resolveCredential(saved.reference,{provider:'GITHUB'}),null);
});
test('remembered credentials use only ciphertext and can be removed from later sessions',async t=>{
  const f=fixture(t),token='drive-user-entered-secret-fixture',saved=f.make().save({provider:'GOOGLE_DRIVE',token,remember:true});
  assert.doesNotMatch(readFileSync(f.filePath,'utf8'),/drive-user-entered-secret-fixture/u);
  const reopened=f.make();assert.equal(await reopened.resolveCredential(saved.reference,{provider:'GOOGLE_DRIVE'}),token);
  reopened.remove(saved.reference);assert.equal(await f.make().resolveCredential(saved.reference,{provider:'GOOGLE_DRIVE'}),null);
});
test('unsupported OS encryption and basic-text backends require explicit session retention',t=>{
  const f=fixture(t);
  for(const backend of [{isEncryptionAvailable:()=>false},{isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=>'basic_text'}]){
    const store=createWorkspaceSecretStore({filePath:f.filePath,safeStorage:backend});
    assert.throws(()=>store.save({provider:'GMAIL',token:'fixture-user-token',remember:true}),/UNAVAILABLE_USE_SESSION/u);
    assert.equal(store.save({provider:'GMAIL',token:'fixture-user-token'}).retention,'SESSION');
  }
  assert.equal(existsSync(f.filePath),false);
});
test('a corrupt or symlinked secret store is rejected without replacing the existing file',t=>{
  const f=fixture(t);writeFileSync(f.filePath,'existing corrupt ciphertext');
  assert.throws(f.make,/UNREADABLE/u);assert.equal(readFileSync(f.filePath,'utf8'),'existing corrupt ciphertext');
  rmSync(f.filePath);const target=join(f.filePath,'..','private-target');writeFileSync(target,'private content');
  symlinkSync(target,f.filePath);assert.throws(f.make,/FILE_INVALID/u);assert.equal(readFileSync(target,'utf8'),'private content');
});
test('credential inputs reject provider confusion and header-injection values',t=>{
  const store=fixture(t).make();
  assert.throws(()=>store.save({provider:'CUSTOM_MCP',token:'fixture-token'}),/PROVIDER_UNSUPPORTED/u);
  for(const token of ['short','fixture\nInjected: true',' fixture-token','fixture-token\0'])assert.throws(()=>store.save({provider:'GITHUB',token}),/TOKEN_INVALID/u);
});
