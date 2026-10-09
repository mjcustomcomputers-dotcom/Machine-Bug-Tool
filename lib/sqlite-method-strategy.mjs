// SQLite strategy and bounded inverse-graph checks over derived Method Atlas.
 // No live source reads, database migration, optimizer mutation, or target actions.
const METHOD=/^MHA-[0-9]{4}$/u;
const dim=/^[A-Z][A-Z0-9_]{1,39}$/u;
const fail=x=>{throw Error(x)};
const safeRows=(xs,max,label)=>{
 if(!Array.isArray(xs)||xs.length>max)fail(label);
 return xs;
};
const queries=Object.freeze({
 TRIGGER:'SELECT method_id,trigger_strength FROM atlas_triggers WHERE dimension=? ORDER BY trigger_strength DESC,method_id LIMIT 12',
 REVERSE:'SELECT method_id,relation_type FROM atlas_method_relations WHERE related_method_id=? ORDER BY method_id LIMIT 12',
 ACTIONABLE:"SELECT method_id,subject_id,atom_id FROM atlas_variation_ledger WHERE decision='TRIGGERED_INPUT_REVIEW_REQUIRED' AND method_id=? ORDER BY recorded_at DESC LIMIT 12",
 TAXONOMY:"SELECT method_id,class_key FROM atlas_method_taxonomy WHERE axis='PURPOSE' AND class_key=? ORDER BY method_id LIMIT 12"
});
export function inspectAtlasSQLite(db,{dimension='GRAPH',method_id='MHA-0224',purpose='ROUTE',check_integrity=true}={}){
 if(!db||typeof db.prepare!=='function')fail('SQLITE_ADAPTER_REQUIRED');
 if(!dim.test(dimension)||!METHOD.test(method_id)||!dim.test(purpose)||typeof check_integrity!=='boolean')fail('INVALID_SQLITE_DIAGNOSTIC_INPUT');
 const args={TRIGGER:[dimension],REVERSE:[method_id],ACTIONABLE:[method_id],TAXONOMY:[purpose]};
 const plans=Object.entries(queries).map(([query_id,sql])=>{
  const r=safeRows(db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args[query_id]),64,'EXPLAIN_ROWS_OVER_BUDGET');
  return {query_id,plan_entries:r.map(x=>({id:x.id,parent:x.parent,detail:x.detail})),
   estimated_speedup:null,explain_diagnostic_only:true};
 });
 let quick=null,foreign=null;
 if(check_integrity){
  const r=safeRows(db.prepare('PRAGMA quick_check').all(),16,'QUICK_CHECK_ROWS_OVER_BUDGET');
  quick={result:r.map(x=>x.quick_check),ok:r.length===1&&r[0].quick_check==='ok'};
  const fk=safeRows(db.prepare('PRAGMA foreign_key_check').all(),32,'FOREIGN_KEY_ROWS_OVER_BUDGET');
  foreign={violations:fk.length,ok:fk.length===0,details:fk.map(x=>({table:x.table,parent:x.parent,fkid:x.fkid}))};
 }
 return {status:(!quick||quick.ok)&&(!foreign||foreign.ok)?'SQLITE_DIAGNOSTIC_RECEIPT':'BLOCKED_SQLITE_INTEGRITY',
  version:'MPC_SQLITE_STRATEGY_V11',plans,quick_check:quick,foreign_key_check:foreign,
  source_authentication:false,performance_gain_measured:false,optimizer_command_run:false,
  writes_performed:false,external_target_actions:false,canonical_promotion:false,
  next_step:'Compare this plan and p50/p95 latency against baseline on the same SQLite host and exact fixture before adopting index changes.'};
}

export function traceInverseMethodEdges(db,{root_method_id,max_depth=3,max_rows=64}={}){
 if(!db||typeof db.prepare!=='function')fail('SQLITE_ADAPTER_REQUIRED');
 if(!METHOD.test(root_method_id)||!Number.isInteger(max_depth)||max_depth<0||max_depth>3||!Number.isInteger(max_rows)||max_rows<1||max_rows>64)fail('INVALID_INVERSE_GRAPH_BUDGET');
 // Cycle prevention via delimited method IDs and an explicit depth bound.
 // Only proposed link metadata is traversed; method implementations never run.
 const sql=`WITH RECURSIVE walk(method_id,depth,trail) AS (
   SELECT ? AS method_id,0 AS depth,',' || ? || ',' AS trail
   UNION ALL
   SELECT e.method_id, walk.depth+1, walk.trail || e.method_id || ','
   FROM atlas_method_relations e JOIN walk ON e.related_method_id=walk.method_id
   WHERE walk.depth < ? AND instr(walk.trail, ',' || e.method_id || ',')=0
   LIMIT 512
 )
 SELECT method_id,MIN(depth) AS depth FROM walk
 GROUP BY method_id ORDER BY depth, method_id LIMIT ?`;
 const result=safeRows(db.prepare(sql).all(root_method_id,root_method_id,max_depth,max_rows),max_rows,'INVERSE_GRAPH_ROWS');
 return {status:'BOUNDED_REVERSE_DEPENDENCY_CANDIDATES',root_method_id,max_depth,max_rows,
  nodes:result.map(row=>({method_id:row.method_id,depth:row.depth})),internal_recursion_row_cap:512,not_exhaustive_if_capped:result.length===max_rows,completeness_not_proven:true,independent_corrob_proven:false,
  methods_executed:false,source_authenticated:false,target_traffic:false,canonical_promotion:false};
}
