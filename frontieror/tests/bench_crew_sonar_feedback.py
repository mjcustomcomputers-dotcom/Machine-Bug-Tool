"""Synthetic paired time-budget test: method->classifier->method sonar feedback.

All methods receive the same original instance, solver source, total absolute
budget, and independent original feasibility oracle. No planted witness is
passed to any method, no ZIP and no official instance claim.
"""
import importlib.util
import json
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

crew=load("sonar_bench_solver",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixture=load("sonar_bench_fixtures",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
independent=load("sonar_bench_oracle",ROOT/"tests"/"test_crew_five_level_parity.py")


def compare(groups,q,seed,budget):
    raw=fixture.cycle_case(groups=groups,q=q,seed=seed,empty=True)
    p=crew.parse(raw)
    reduction=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    entries=[]
    # Vary the control order across source seeds; all routes still start from
    # the same immutable problem rather than sharing solver search state.
    order=("plain","auto","sonar") if seed%2 else ("sonar","auto","plain")
    for label in order:
        receipt={}
        t=time.monotonic()
        if label=="sonar":
            selected=crew.sonar_feedback_cycle_rescue(
                p,t+budget,reduction=reduction,receipt=receipt)
        else:
            selected=crew.coupled_cycle_choice_milp(
                p,t+budget,reduction=reduction,
                prefer_cp_feasibility=True,
                cp_parity=(label=="auto"))
        elapsed=time.monotonic()-t
        valid=independent.independent_cover_truth(p,selected)
        if valid!=crew.verify(p,selected):
            raise AssertionError("ORIGINAL_ORACLE_DISAGREEMENT")
        entries.append({"method":label,"time_s":round(elapsed,5),
             "original_verified":bool(valid),
             "objective":crew.objective(p,selected) if valid else None,
             "echo":receipt})
    return {"rows":4*groups,"side_constraints":q,"seed":seed,
            "budget_s":budget,"entries":entries}


def main():
    configs=((60,20,31,8.),(60,20,7,8.),
             (60,20,43,5.),(120,25,17,10.))
    all_results=[]
    for spec in configs:
        x=compare(*spec)
        all_results.append(x)
        print("SONAR_AB="+json.dumps(x),flush=True)
    report={"scope":"synthetic Crew sonar method-as-classifier A/B",
            "official_score":None,"cases":all_results}
    loc=ROOT/"artifacts"/"crew-sonar-feedback-ab.json"
    loc.parent.mkdir(parents=True,exist_ok=True)
    loc.write_text(json.dumps(report,indent=2)+"\n")

if __name__=="__main__":main()
