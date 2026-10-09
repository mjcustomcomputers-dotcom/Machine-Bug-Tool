// Synthetic fast-pass microbenchmark; no target IO, no native writes.
import {performance} from 'node:perf_hooks';
import {selectMaterialDeltas} from '../lib/source-bound-fast-pass.mjs';
const make=i=>({native_source:'GOOGLE_DRIVE',native_id:'synthetic-'+i,version:'v1',digest:i.toString(16).padStart(64,'0')});
const cache=Array.from({length:64},(_,i)=>make(i));
const same=cache.map(x=>({...x}));const changed=same.map((x,i)=>i===0?{...x,digest:'f'.repeat(64)}:x);
const measure=input=>{
 const times=[];
 for(let i=0;i<1000;i++){const t=performance.now();const r=selectMaterialDeltas({incoming:input,cache});if(r.changed.length!==(input===same?0:1))throw Error('INCORRECT_DELTA');times.push(performance.now()-t);}
 times.sort((a,b)=>a-b);return {samples:times.length,p50_ms:times[499],p95_ms:times[949]};
};
console.log(JSON.stringify({kind:'SYNTHETIC_SOURCE_PREFLIGHT_ONLY',unchanged:measure(same),single_changed:measure(changed),method_execution:false,sql_execution:false,network_actions:false,host:process.platform,node:process.version},null,2));
