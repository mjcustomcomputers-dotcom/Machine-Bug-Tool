import json,sys
from pathlib import Path
sys.path.insert(0,'/workspace/scratch/392df9768f5e/repaired-candidate/mpc-machine-legal/skills/machine-legal-prototype/scripts')
import prototype as p
fixtures=[]
def add(name,args):
 try: expected={'value':p.FUNCTIONS[name](**args)}
 except Exception as e:expected={'error':str(e)}
 fixtures.append({'name':name,'args':args,**expected})
for ids in [[],[1],[31,32],[1,64,128,256],[31,31]]:add('get_registry',{'ids':ids})
base={'dependencies':{'source':[],'atom':['source'],'proof':['atom'],'unrelated':[]},'changed':['source'],'previous_fingerprint':'a'*64,'current_fingerprint':'b'*64}
for batch in [1,2,3]:add('delta_plan',{**base,'batch_size':batch})
add('delta_plan',{**base,'current_fingerprint':'a'*64})
add('delta_plan',{**base,'dependencies':{'a':['b'],'b':['a']},'changed':['a']})
add('delta_plan',{**base,'dependencies':{'__proto__':['constructor'],'constructor':[]},'changed':['constructor']})
add('delta_plan',{**base,'changed':[]})
add('delta_plan',{**base,'current_fingerprint':'z'*64})
target={k:'synthetic '+k for k in ['question','expected_record','custodian','stop_condition','reopen_trigger']}
for state in ['PASS','FAIL','UNKNOWN']:
 add('refine_counterexample',{'namespace':'prototype:test','path_id':'route1','input_fingerprint':'a'*64,'checks':[{'predicate':'identity','state':state,'source_ref':'synthetic:1','reason':'synthetic check','target':target if state=='UNKNOWN' else None}]})
Path('tests/parity-fixtures.json').write_text(json.dumps(fixtures))
