"""Five-level XOR / original-cycle CP-SAT contrast, controlled budgets.

L1 full original Crew feasibility; L2 exact cycle projection; L3 GF2 atoms;
L4 same-seed source mutation; L5 test-the-test via an independent verifier.
No ZIP, no contest score.
"""
import importlib.util
import json
import time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def load(name,p):
    sp=importlib.util.spec_from_file_location(name,p)
    x=importlib.util.module_from_spec(sp);sp.loader.exec_module(x)
    return x

crew=load("parity_benchmark_crew",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixtures=load("parity_benchmark_cases",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
independent=load("parity_independent_truth",ROOT/"tests"/"test_crew_five_level_parity.py")

def one(groups,q,seed,budget,parity):
    raw=fixtures.cycle_case(groups=groups,q=q,seed=seed,empty=True)
    p=crew.parse(raw)
    r=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    started=time.monotonic()
    candidate,proof=crew.coupled_cycle_choice_milp(
        p,started+budget,reduction=r,return_certificate=True,
        prefer_cp_feasibility=True,cp_parity=parity)
    sec=time.monotonic()-started
    original=crew.verify(p,candidate)
    oracle=independent.independent_cover_truth(p,candidate)
    if original!=oracle:raise AssertionError("INDEPENDENT_ORACLE_DISAGREES")
    return {"groups":groups,"original_rows":groups*4,"side_rows":q,
       "cycle_decisions":groups+1,"seed":seed,"budget_s":budget,
       "method":"parity_basis" if parity else "literal_side_CP",
       "original_verified":bool(original),
       "objective":crew.objective(p,candidate) if original else None,
       "proof":bool(proof),"elapsed_s":round(sec,5)}

def main():
    # Order is alternated to expose cache/import and condition-order bias.
    specs=[(60,20,23,12),(60,20,31,12),(120,25,17,30)]
    results=[]
    for i,(groups,q,seed,budget) in enumerate(specs):
        order=(False,True) if i%2==0 else (True,False)
        for variant in order:
            value=one(groups,q,seed,budget,variant)
            results.append(value)
            print("GF2_RESCUE="+json.dumps(value),flush=True)
    score={"scope":"synthetic bounded feasibility / same original source",
        "test_cases":len(specs),"trials":len(results),"results":results,
        "official_score":None}
    out=ROOT/"artifacts"/"crew-five-level-parity.json"
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(score,indent=2)+"\n")

if __name__=="__main__":main()
