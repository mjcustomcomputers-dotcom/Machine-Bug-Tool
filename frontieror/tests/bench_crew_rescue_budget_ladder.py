"""Longer-horizon score-floor falsifier (generated only; no ZIP).

Carry exactly the same hard instances through 4 and 12 seconds on two
engines with independently verified original source constraints. A failed
short-budget result is UNKNOWN, never a proof of original infeasibility.
"""
import importlib.util, json, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
crew=load("crew_budget_solver",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixtures=load("crew_budget_fixture",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")

def evaluate(p, reduction, method, seconds):
    t=time.monotonic()
    if method=="full":
        out=crew.sparse_milp(p,t+seconds,reduction=reduction,
                             return_certificate=True)
    else:
        out=crew.coupled_cycle_choice_milp(
          p,t+seconds,reduction=reduction,return_certificate=True,
          prefer_cp_feasibility=method=="cp_feasible")
    if out is None:out=(None,False)
    result,cert=out
    passed=crew.verify(p,result)
    return {"method":method,"budget_s":seconds,"wall_s":round(time.monotonic()-t,4),
       "verified":bool(passed),"certificate":bool(cert),
       "objective":crew.objective(p,result) if passed else None}

def main():
    cases=[(60,20,23),(120,25,17)]
    results=[]
    for groups,q,seed in cases:
        problem=fixtures.cycle_case(groups=groups,q=q,seed=seed,empty=True)
        p=crew.parse(problem)
        reduction=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        if reduction is None:raise AssertionError("reduction rejected generated feasible problem")
        rec={"groups":groups,"rows":4*groups,"side_rows":q,
             "cycle_binary_variables":groups+1,
             "generated_known_feasible":True,"probes":[]}
        for seconds in (4,12):
            for method in ("cp_feasible","cycles","full"):
                probe=evaluate(p,reduction,method,seconds)
                rec["probes"].append(probe)
                print("BUDGET_LADDER_CASE="+json.dumps({
                    "rows":4*groups,"side_rows":q,**probe}),flush=True)
        results.append(rec)
    report={"scope":"generated score-floor bound; solve-phase without input parsing",
            "private_organizer_score":None,"cases":results}
    out=ROOT/"artifacts"/"crew-rescue-budget-ladder.json"
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2)+"\n")
    print("BUDGET_LADDER_END="+json.dumps({
       "models":len(cases),"total_probes":sum(len(x["probes"]) for x in results),
       "successful_original_verifications":sum(z["verified"]
         for x in results for z in x["probes"])}),flush=True)

if __name__=="__main__":main()
