import {randomUUID} from 'node:crypto';
import {existsSync,lstatSync,mkdirSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

const PROVIDERS=new Set(['GITHUB','GOOGLE_DRIVE','GMAIL','DROPBOX']);
const REF=/^os-secret:\/\/mpc\/[0-9a-f-]{36}$/u;
const fail=code=>{throw Object.assign(Error(code),{code})};
/** User-entered provider tokens only; never reads another application's store. */
export function createWorkspaceSecretStore({filePath,safeStorage,id=randomUUID}={}){
  const path=resolve(filePath);const sessions=new Map();
  let stored={version:1,entries:[]};
  if(existsSync(path)){
    const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2_000_000)fail('MPC_SECRET_FILE_INVALID');
    try{stored=JSON.parse(readFileSync(path,'utf8'))}catch{fail('MPC_SECRET_STORE_UNREADABLE')}
    if(stored.version!==1||!Array.isArray(stored.entries)||stored.entries.length>64||stored.entries.some(entry=>
      !REF.test(entry.reference)||!PROVIDERS.has(entry.provider)||typeof entry.ciphertext!=='string'||entry.ciphertext.length>64_000))fail('MPC_SECRET_STORE_INVALID');
  }
  const encryptedAvailable=()=>safeStorage?.isEncryptionAvailable?.()===true&&safeStorage?.getSelectedStorageBackend?.()!=='basic_text';
  function persist(next){
    mkdirSync(dirname(path),{recursive:true,mode:0o700});
    if(existsSync(path)&&lstatSync(path).isSymbolicLink())fail('MPC_SECRET_FILE_INVALID');
    const temp=`${path}.${id()}.tmp`;
    writeFileSync(temp,JSON.stringify(next),{encoding:'utf8',flag:'wx',mode:0o600});renameSync(temp,path);stored=next;
  }
  return {
    status(){return {encrypted_storage_available:encryptedAvailable(),entries:[...stored.entries.map(({reference,provider,createdAt})=>({reference,provider,createdAt,retention:'ENCRYPTED'})),
      ...Array.from(sessions,([reference,value])=>({reference,provider:value.provider,createdAt:value.createdAt,retention:'SESSION'}))]};},
    save({provider,token,remember=false}={}){
      if(!PROVIDERS.has(provider))fail('MPC_SECRET_PROVIDER_UNSUPPORTED');
      if(typeof token!=='string'||token.length<8||token.length>16_000||/[\r\n\0]/u.test(token)||token.trim()!==token)fail('MPC_SECRET_TOKEN_INVALID');
      if(stored.entries.length+sessions.size>=64)fail('MPC_SECRET_COUNT_LIMIT');
      const reference=`os-secret://mpc/${id()}`;if(!REF.test(reference))fail('MPC_SECRET_REFERENCE_INVALID');
      const entry={reference,provider,createdAt:new Date().toISOString()};
      if(remember){
        if(!encryptedAvailable())fail('MPC_ENCRYPTED_STORAGE_UNAVAILABLE_USE_SESSION');
        persist({...stored,entries:[...stored.entries,{...entry,ciphertext:safeStorage.encryptString(token).toString('base64')}]});
      }else sessions.set(reference,{...entry,token});
      return {...entry,retention:remember?'ENCRYPTED':'SESSION'};
    },
    async resolveCredential(reference,{provider}={}){
      if(!REF.test(reference??'')||!PROVIDERS.has(provider))return null;
      const entry=sessions.get(reference)??stored.entries.find(item=>item.reference===reference);
      if(!entry||entry.provider!==provider)return null;
      if(entry.token)return entry.token;
      if(!encryptedAvailable())fail('MPC_ENCRYPTED_STORAGE_UNAVAILABLE');
      try{return safeStorage.decryptString(Buffer.from(entry.ciphertext,'base64'))}catch{fail('MPC_SECRET_DECRYPT_FAILED')}
    },
    remove(reference){
      if(!REF.test(reference??''))fail('MPC_SECRET_REFERENCE_INVALID');
      sessions.delete(reference);
      if(stored.entries.some(e=>e.reference===reference))persist({...stored,entries:stored.entries.filter(e=>e.reference!==reference)});
      return {status:'REMOVED',reference};
    },
    close(){sessions.clear()}
  };
}
