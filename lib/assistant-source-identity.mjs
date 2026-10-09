import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {isPathWithin} from './local-path-boundary.mjs';

export const assistantHash = value => createHash('sha256').update(Buffer.isBuffer(value) || typeof value === 'string' ? value : assistantCanonical(value)).digest('hex');
// Native library objects may deliberately omit optional fields with undefined.
// Match their JSON object representation without hiding invalid numeric values,
// sparse arrays, getters, special objects or cycles behind JSON.stringify.
export function assistantJsonData(value, depth=0, active=new WeakSet(), budget={nodes:0}) {
 if(++budget.nodes>100000||depth>48)throw Error('JSON_DATA_COMPLEXITY_LIMIT');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('NONFINITE_NATIVE_RESULT');return value;}
 if(!value||typeof value!=='object'||active.has(value))throw Error('NATIVE_RESULT_MUST_BE_JSON_DATA');
 const array=Array.isArray(value),proto=Object.getPrototypeOf(value);
 if(array?proto!==Array.prototype:!([Object.prototype,null].includes(proto)))throw Error('NATIVE_RESULT_MUST_BE_PLAIN_DATA');
 active.add(value);const output=array?[]:{};
 if(array&&Object.keys(value).length!==value.length)throw Error('NATIVE_RESULT_ARRAY_MUST_BE_DENSE');
 for(const key of Reflect.ownKeys(value)){
  if(array&&key==='length')continue;
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(typeof key!=='string'||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw Error('NATIVE_RESULT_ACCESSOR_OR_SYMBOL');
  if(descriptor.value===undefined&&!array)continue;
  const child=assistantJsonData(descriptor.value,depth+1,active,budget);
  Object.defineProperty(output,key,{value:child,writable:true,enumerable:true,configurable:true});
 }
 active.delete(value);return output;
}
export function assistantCanonical(value) {
 if (value === null || typeof value !== 'object') return JSON.stringify(value);
 if (Array.isArray(value)) return '[' + value.map(assistantCanonical).join(',') + ']';
 return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + assistantCanonical(value[key])).join(',') + '}';
}

// Resolve every component before opening. This is a local application boundary,
// not protection against an administrator replacing files during execution.
export function regularFileWithin(root, relativePath, maximumBytes = 2_000_000) {
 if (typeof relativePath !== 'string' || !relativePath.length || relativePath.includes('\\') ||
     /[\u0000-\u001f<>:"|?*]/u.test(relativePath) || path.posix.isAbsolute(relativePath) ||
     relativePath.split('/').some(part => !part || part === '.' || part === '..' || /[ .]$/u.test(part))) throw Error('WORKSPACE_RELATIVE_PATH_REQUIRED');
 const resolvedRoot = realpathSync(root), fullPath = path.resolve(resolvedRoot,relativePath);
 if (!isPathWithin(resolvedRoot,fullPath)) throw Error('PATH_OUTSIDE_WORKSPACE');
 let current = resolvedRoot;
 for (const [index,part] of relativePath.split('/').entries()) {
  current = path.join(current,part);
  const stat = lstatSync(current);
  if (stat.isSymbolicLink() || (index < relativePath.split('/').length-1 && !stat.isDirectory())) throw Error('SYMLINK_OR_NON_DIRECTORY_COMPONENT');
  if (index === relativePath.split('/').length-1 && (!stat.isFile() || stat.size > maximumBytes)) throw Error('BOUNDED_REGULAR_FILE_REQUIRED');
 }
 if (!isPathWithin(resolvedRoot,realpathSync(fullPath))) throw Error('RESOLVED_PATH_OUTSIDE_WORKSPACE');
 return fullPath;
}

// Static relative imports and literal dynamic imports form the dependency
// closure. JSON imports are included. Built-ins have no repository bytes.
export function captureSourceIdentity(root, entrypoints) {
 const queue = [...entrypoints], files = new Map();
 while (queue.length) {
  const relativePath = queue.shift();
  if (files.has(relativePath)) continue;
  if (files.size >= 160) throw Error('SOURCE_CLOSURE_LIMIT');
  const full = regularFileWithin(root,relativePath,8_000_000), bytes = readFileSync(full);
  files.set(relativePath,{path:relativePath,bytes:bytes.length,sha256:assistantHash(bytes)});
  if (!/\.(?:mjs|js)$/u.test(relativePath)) continue;
  const source = bytes.toString('utf8');
  const imports = /(?:\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\))/gu;
  for (const match of source.matchAll(imports)) {
   const specifier = match[1] ?? match[2];
   if (specifier.startsWith('node:')) continue;
   if (!specifier.startsWith('.')) throw Error('UNPINNED_EXTERNAL_RUNTIME_IMPORT:'+specifier);
   const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(relativePath),specifier));
   if (dependency.startsWith('../') || dependency === '..') throw Error('RUNTIME_IMPORT_OUTSIDE_SOURCE');
   queue.push(dependency);
  }
 }
 const list = [...files.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 return {fingerprint:assistantHash(list),files:list,scope:'LOCAL_RUNTIME_AND_DECLARED_DATA_BYTES;NOT_REMOTE_AUTHENTICITY'};
}

export function assertSourceUnchanged(root, identity) {
 for (const row of identity.files) {
  let bytes;
  try { bytes = readFileSync(regularFileWithin(root,row.path,8_000_000)); }
  catch { throw Error('RESTART_REQUIRED:SOURCE_UNAVAILABLE:'+row.path); }
  if (bytes.length !== row.bytes || assistantHash(bytes) !== row.sha256) throw Error('RESTART_REQUIRED:SOURCE_CHANGED:'+row.path);
 }
}
