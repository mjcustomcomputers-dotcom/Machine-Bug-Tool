// Exact unilateral-regret evaluation for one finite simultaneous-move game.
// The supplied mixed strategies are integer weights, so profile utilities and
// every pure best response can be enumerated with BigInt arithmetic. Native
// Nash and Harsanyi calls are retained as cross-checks; this is not CFR.
import {createHash} from 'node:crypto';
import {canonical} from './universal.mjs';
import {evaluateMethod} from './methods.mjs';

const VERSION='MPC_FINITE_IMPERFECT_INFORMATION_REGRET_V1';
const ID=/^[A-Za-z0-9_:.-]{1,200}$/u;
const MAX_ACTIONS=8,MAX_WEIGHT=1_000_000,MAX_PAYOFF=1_000_000;
const fail=(code,detail='')=>{throw Error(code+(detail?':'+detail:''));};
const copy=value=>structuredClone(value);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const fraction=(numerator,denominator)=>({numerator:String(numerator),denominator:String(denominator)});
const project=(numerator,denominator)=>Number(numerator)/Number(denominator);

export const imperfectInformationRegretContract=Object.freeze({
 version:VERSION,model_scope:'FINITE_TWO_PLAYER_SIMULTANEOUS_MOVE_GAME_WITH_SUPPLIED_INTEGER_STRATEGY_WEIGHTS',
 min_actions_per_player:2,max_actions_per_player:MAX_ACTIONS,max_strategy_weight:MAX_WEIGHT,
 integer_payoff_bound:MAX_PAYOFF,native_methods_used:['nash','harsanyi'],native_evaluator_added:false,
 exact_oracle:'ENUMERATE_EVERY_PURE_UNILATERAL_RESPONSE_USING_BIGINT_WEIGHTED_PAYOFFS',
 cfr_performed:false,sequential_game_solved:false,source_authentication:false,target_actions:false,
 canonical_registry_mutation:false
});

function object(value,fields,name){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('INVALID_'+name);
 const descriptors=Object.getOwnPropertyDescriptors(value),allowed=new Set(fields);
 for(const key of Reflect.ownKeys(descriptors)){
  const descriptor=descriptors[key];
  if(typeof key!=='string'||!allowed.has(key)||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('INVALID_'+name+'_FIELD');
 }
 if(fields.some(key=>!Object.hasOwn(descriptors,key)))fail('MISSING_'+name+'_FIELD');
}

function array(value,min,max,name){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length<min||value.length>max)fail('INVALID_'+name+'_BOUNDS');
 for(const key of Reflect.ownKeys(value)){
  if(key==='length')continue;
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  if(typeof key!=='string'||!/^(0|[1-9][0-9]*)$/u.test(key)||Number(key)>=value.length||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('INVALID_'+name+'_FIELD');
 }
 for(let index=0;index<value.length;index++)if(!Object.hasOwn(value,index))fail('SPARSE_'+name);
 return value;
}

function integer(value,min,max,name){
 if(!Number.isSafeInteger(value)||value<min||value>max)fail('INVALID_'+name);
 return value;
}

function matrix(value,name){
 const rows=array(value,2,MAX_ACTIONS,name+'_ROWS');
 const columns=array(rows[0],2,MAX_ACTIONS,name+'_ROW').length;
 return rows.map((row,rowIndex)=>{
  const values=array(row,columns,columns,name+'_ROW');
  return values.map((entry,columnIndex)=>integer(entry,-MAX_PAYOFF,MAX_PAYOFF,`${name}_${rowIndex}_${columnIndex}`));
 });
}

function weights(value,length,name){
 const result=array(value,length,length,name).map((entry,index)=>integer(entry,0,MAX_WEIGHT,`${name}_${index}`));
 if(!result.some(Boolean))fail('ZERO_MASS_'+name);
 return result;
}

function exactProfile(payoffs,rowWeights,columnWeights){
 let numerator=0n;
 for(let row=0;row<rowWeights.length;row++)for(let column=0;column<columnWeights.length;column++)
  numerator+=BigInt(rowWeights[row])*BigInt(columnWeights[column])*BigInt(payoffs[row][column]);
 return numerator;
}

function rowResponses(payoffs,rowTotal,columnWeights){
 return payoffs.map(row=>BigInt(rowTotal)*row.reduce((sum,payoff,column)=>sum+BigInt(columnWeights[column])*BigInt(payoff),0n));
}

function columnResponses(payoffs,columnTotal,rowWeights){
 return payoffs[0].map((_,column)=>BigInt(columnTotal)*payoffs.reduce((sum,row,rowIndex)=>sum+BigInt(rowWeights[rowIndex])*BigInt(row[column]),0n));
}

/** Evaluate exploitability of one supplied strategy profile. The exact oracle
 * enumerates all pure unilateral responses. For a finite normal-form game this
 * is sufficient because expected utility is linear in a deviating strategy.
 */
export async function evaluateFiniteImperfectInformationRegret(input){
 object(input,['game_id','row_payoffs','column_payoffs','row_strategy_weights','column_strategy_weights'],'REGRET_REQUEST');
 if(typeof input.game_id!=='string'||!ID.test(input.game_id))fail('INVALID_GAME_ID');
 const rowPayoffs=matrix(input.row_payoffs,'ROW_PAYOFFS'),columnPayoffs=matrix(input.column_payoffs,'COLUMN_PAYOFFS');
 if(rowPayoffs.length!==columnPayoffs.length||rowPayoffs[0].length!==columnPayoffs[0].length)fail('PAYOFF_MATRIX_DIMENSION_MISMATCH');
 const rowWeights=weights(input.row_strategy_weights,rowPayoffs.length,'ROW_STRATEGY_WEIGHTS');
 const columnWeights=weights(input.column_strategy_weights,rowPayoffs[0].length,'COLUMN_STRATEGY_WEIGHTS');
 const rowTotal=rowWeights.reduce((sum,value)=>sum+value,0),columnTotal=columnWeights.reduce((sum,value)=>sum+value,0);
 const denominator=BigInt(rowTotal)*BigInt(columnTotal);
 const rowProfile=exactProfile(rowPayoffs,rowWeights,columnWeights),columnProfile=exactProfile(columnPayoffs,rowWeights,columnWeights);
 const rowPure=rowResponses(rowPayoffs,rowTotal,columnWeights),columnPure=columnResponses(columnPayoffs,columnTotal,rowWeights);
 const rowBest=rowPure.reduce((best,value)=>value>best?value:best),columnBest=columnPure.reduce((best,value)=>value>best?value:best);
 const rowRegret=rowBest-rowProfile,columnRegret=columnBest-columnProfile;
 if(rowRegret<0n||columnRegret<0n)fail('NEGATIVE_EXACT_REGRET_INTERNAL');
 const normalizedRows=rowWeights.map(value=>value/rowTotal),normalizedColumns=columnWeights.map(value=>value/columnTotal);
 const [nash,rowHarsanyi,columnHarsanyi]=await Promise.all([
  evaluateMethod({method:'nash',input:{row_payoffs:copy(rowPayoffs),column_payoffs:copy(columnPayoffs)}}),
  evaluateMethod({method:'harsanyi',input:{states:normalizedColumns.map((probability,column)=>({id:'column'+column,probability})),actions:rowPayoffs.map((payoffs,row)=>({id:'row'+row,payoffs:copy(payoffs)}))}}),
  evaluateMethod({method:'harsanyi',input:{states:normalizedRows.map((probability,row)=>({id:'row'+row,probability})),actions:columnPayoffs[0].map((_,column)=>({id:'column'+column,payoffs:columnPayoffs.map(row=>row[column])}))}})
 ]);
 const nativeRowBest=Math.max(...rowHarsanyi.result.values.map(row=>row.expected_utility));
 const nativeColumnBest=Math.max(...columnHarsanyi.result.values.map(row=>row.expected_utility));
 const exactRowBest=project(rowBest,denominator),exactColumnBest=project(columnBest,denominator);
 if(Math.abs(nativeRowBest-exactRowBest)>1e-9*Math.max(1,Math.abs(exactRowBest))||Math.abs(nativeColumnBest-exactColumnBest)>1e-9*Math.max(1,Math.abs(exactColumnBest)))fail('NATIVE_BEST_RESPONSE_CROSSCHECK_MISMATCH');
 const maxRegret=rowRegret>columnRegret?rowRegret:columnRegret;
 const normalized={game_id:input.game_id,row_payoffs:rowPayoffs,column_payoffs:columnPayoffs,row_strategy_weights:rowWeights,column_strategy_weights:columnWeights};
 return {version:VERSION,status:'FINITE_IMPERFECT_INFORMATION_REGRET_EVALUATED',request_fingerprint:hash(normalized),supplied_game:normalized,
  strategy_probabilities:{row:normalizedRows,column:normalizedColumns},
  exact_profile_utility:{row:fraction(rowProfile,denominator),column:fraction(columnProfile,denominator)},
  exact_best_response_utility:{row:fraction(rowBest,denominator),column:fraction(columnBest,denominator)},
  exact_regret:{row:fraction(rowRegret,denominator),column:fraction(columnRegret,denominator)},
  profile_utility:{row:project(rowProfile,denominator),column:project(columnProfile,denominator)},
  best_response_utility:{row:exactRowBest,column:exactColumnBest},
  unilateral_regret:{row:project(rowRegret,denominator),column:project(columnRegret,denominator)},
  max_unilateral_regret:project(maxRegret,denominator),equilibrium_consistent:rowRegret===0n&&columnRegret===0n,
  best_response_actions:{row:rowPure.flatMap((value,index)=>value===rowBest?['row'+index]:[]),column:columnPure.flatMap((value,index)=>value===columnBest?['column'+index]:[])},
  enumerated_response_counts:{row:rowPure.length,column:columnPure.length},
  native_receipts:{nash,row_best_response:rowHarsanyi,column_best_response:columnHarsanyi},
  oracle:'Every pure unilateral response enumerated exactly from supplied integer payoffs and strategy weights; linearity makes the best pure response sufficient in this finite normal-form contract.',
  boundaries:{cfr_performed:false,sequential_game_solved:false,bayesian_beliefs_inferred:false,native_evaluator_added:false,source_authentication:false,target_actions_performed:false,canonical_promotion:false,registry_mutation:false,persisted:false},
  limitations:['One supplied finite simultaneous-move game only; no game-tree traversal, information-set learning, CFR, opponent modeling or general poker solving.','Zero exact unilateral regret is equilibrium-consistent for this supplied finite profile; it does not authenticate the model, prove uniqueness or establish real-world play.']};
}
