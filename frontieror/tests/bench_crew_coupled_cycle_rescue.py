"""Objective-first score-floor probe: same Crew instance, equal time, two MILPs.

The original full model and the exact cycle-choice replacement receive equal
time limits. Generated witness is feasible, but neither solver is promised an
incumbent; UNKNOWN is measured rather than converted into a feasibility claim.
"""
import importlib.util
import json
import time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
src=ROOT/"solvers"/"hoffman1993"/"solve.py"
s=importlib.util.spec_from_file_location("crew_compare",src)
crew=importlib.util.module_from_spec(s);s.loader.exec_module(crew)
test=importlib.util.spec_from_file_location("rescue_fixtures",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
fixtures=importlib.util.module_from_spec(test);test.loader.exec_module(fixtures)

def one(groups,q,seed,budget,method):
    raw=fixtures.cycle_case(groups=groups,q=q,seed=seed,empty=True)
    p=crew.parse(raw)
    reduced=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    if reduced is None:
        raise AssertionError("known feasible fixture reduced to infeasible")
    start=time.monotonic()
    if method=="full":
        result=crew.sparse_milp(p,start+budget,reduction=reduced,
            return_certificate=True)
    else:
        result=crew.coupled_cycle_choice_milp(p,start+budget,
            reduction=reduced,return_certificate=True)
    elapsed=time.monotonic()-start
    candidate,certified=result
    valid=crew.verify(p,candidate)
    return {"method":method,"time_budget_s":budget,"wall_s":round(elapsed,5),
        "verified_incumbent":bool(valid),
        "certified":bool(certified),
        "objective":crew.objective(p,candidate) if valid else None}

def main():
    # Avoid cherry-picked one fixture: both small/mid/high coupling and
    # two separate identical budgeted optimizer invocations per condition.
    configs=[(40,8,7,0.35),(120,14,11,0.5),
             (250,24,23,0.8),(400,30,17,1.5)]
    out=[]
    for groups,q,seed,budget in configs:
        trials=[one(groups,q,seed,budget,method)
                for method in ("full","cycles","cycles","full")]
        full=[x for x in trials if x["method"]=="full"]
        cycles=[x for x in trials if x["method"]=="cycles"]
        winners=[x for x in trials if x["verified_incumbent"]]
        out.append({"groups":groups,"original_rows":4*groups,
            "original_columns":4*groups+1,
            "cycle_variables":groups+1,
            "side_rows":q,"budget_s":budget,"seed":seed,
            "full_feasible_rate":sum(x["verified_incumbent"] for x in full)/2,
            "compressed_feasible_rate":sum(x["verified_incumbent"] for x in cycles)/2,
            "best_original_feasible_cost":min(
                [x["objective"] for x in full if x["verified_incumbent"]],
                default=None),
            "best_compressed_feasible_cost":min(
                [x["objective"] for x in cycles if x["verified_incumbent"]],
                default=None),"runs":trials})
    report={"scope":"generated coupled Crew score-floor search",
      "primary_verifier":"unchanged original exact-cover and side constraints",
      "official_score":None,"results":out}
    print("COUPLED_CYCLE_RESCUE="+json.dumps(report),flush=True)
    target=ROOT/"artifacts"/"crew-coupled-cycle-rescue.json"
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(report,indent=2)+"\n")

if __name__=="__main__":main()
