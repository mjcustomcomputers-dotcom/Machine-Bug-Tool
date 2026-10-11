"""Out-of-development sonar echoes on previously unused generated Crew seeds.

Sealed input choices: seeds 3 and 18 are in the 0.75..0.86 structural
indifference band; the SONAR method must use measured CP echo feedback.
No private data, no ZIP. Fair same-instance shared-budget comparison.
"""
import importlib.util
import json
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    return m
crew=load("sonar_holdout_solver",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixture=load("sonar_holdout_fixture",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
checker=load("sonar_holdout_checker",ROOT/"tests"/"test_crew_five_level_parity.py")

result=[]
for seed in (3,18):
    raw=fixture.cycle_case(groups=60,q=20,seed=seed,empty=True)
    p=crew.parse(raw)
    reduction=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    data=[]
    for mode in (("sonar","plain","auto") if seed%2 else
                 ("auto","plain","sonar")):
        t=time.monotonic()
        echo={}
        if mode=="sonar":
            ans=crew.sonar_feedback_cycle_rescue(
                p,t+6.0,reduction=reduction,receipt=echo)
        else:
            ans=crew.coupled_cycle_choice_milp(
                p,t+6.0,reduction=reduction,prefer_cp_feasibility=True,
                cp_parity=mode=="auto")
        passed=checker.independent_cover_truth(p,ans)
        if passed!=crew.verify(p,ans):
            raise AssertionError("INDEPENDENT_ORIGINAL_VERIFIER_DIFFERENCE")
        data.append({"method":mode,"time_s":round(time.monotonic()-t,5),
                     "original_verified":bool(passed),
                     "objective":crew.objective(p,ans) if passed else None,
                     "echo":echo})
    result.append({"seed":seed,"rows":240,"side_constraints":20,
                   "budget_s":6.0,"methods":data})
    print("SONAR_HOLDOUT="+json.dumps(result[-1]),flush=True)

out=ROOT/"artifacts"/"crew-sonar-holdout.json"
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps({"scope":"generated independent holdouts",
                           "score":None,"cases":result},indent=2)+"\n")
