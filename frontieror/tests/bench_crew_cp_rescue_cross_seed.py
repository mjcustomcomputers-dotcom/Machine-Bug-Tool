"""Independent-seed rescue reliability probe, derived from MPC V15 adaptive method selection.

Generated Crew cycle-coupled exact-cover instances have source-known feasible
binary witnesses. Solver never sees the chosen witness. All returned solutions
are checked by the unchanged Crew verifier. No ZIP or official-score claim.
"""
import importlib.util,json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,p):
    spec=importlib.util.spec_from_file_location(name,p)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
crew=load("crew_multi_seed",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixture=load("crew_multi_seed_fixture",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
configs=[(60,20,23,15),(60,20,31,15),(60,20,43,15),(120,25,17,30)]
result=[]
for groups,q,seed,budget in configs:
    raw=fixture.cycle_case(groups=groups,q=q,seed=seed,empty=True)
    p=crew.parse(raw)
    red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    start=time.monotonic()
    ans,proof=crew.coupled_cycle_choice_milp(p,start+budget,
         reduction=red,return_certificate=True,prefer_cp_feasibility=True)
    verified=crew.verify(p,ans)
    record={"rows":groups*4,"side_rows":q,"seed":seed,"budget_s":budget,
       "wall_s":round(time.monotonic()-start,4),
       "original_verified":bool(verified),
       "objective":crew.objective(p,ans) if verified else None,
       "optimality_proven":bool(proof)}
    print("RESCUE_CROSS_SEED="+json.dumps(record),flush=True)
    result.append(record)
receipt={"source":"generated signed coupled cycles","scope":"single CP-SAT per seed; no full MILP paired here",
    "private_score":None,"result":result}
dest=ROOT/"artifacts"/"crew-rescue-cross-seed.json"
dest.parent.mkdir(parents=True,exist_ok=True)
dest.write_text(json.dumps(receipt,indent=2)+"\n")
