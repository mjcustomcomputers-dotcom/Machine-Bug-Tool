"""Source-matched LP pulse reconstruction vs plain, XOR and inline sonar.

All modes receive identical complete generated inputs, same time limits and
an independent original checker. LP never accesses the planted witness.
"""
import importlib.util,json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    s=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
crew=load("lp_pulse_bench",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixture=load("lp_pulse_cases",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
checker=load("lp_pulse_original",ROOT/"tests"/"test_crew_five_level_parity.py")

def run_case(groups,q,seed,budget):
    source=fixture.cycle_case(groups=groups,q=q,seed=seed,empty=True)
    p=crew.parse(source)
    red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    methods=("plain","xor","lp","lp_echo") if seed%2 else (
              "lp_echo","lp","xor","plain")
    trials=[]
    for method in methods:
        t=time.monotonic()
        receipt={}
        out=crew.coupled_cycle_choice_milp(
            p,t+budget,reduction=red,
            prefer_cp_feasibility=True,
            cp_parity=(True if method=="xor" else
                       "echo" if method=="lp_echo" else False),
            lp_pulse=(method.startswith("lp")),
            telemetry=receipt)
        elapsed=time.monotonic()-t
        valid=checker.independent_cover_truth(p,out)
        if valid!=crew.verify(p,out):
            raise AssertionError("SOURCE_ORACLE_MISMATCH")
        trials.append({"mode":method,"time_s":round(elapsed,5),
             "verified":bool(valid),
             "objective":crew.objective(p,out) if valid else None,
             "lp_samples":receipt.get("lp_pulses",[]),
             "hint_count":receipt.get("lp_hint_variables",0),
             "lp_direct":receipt.get("lp_original_verified",False)})
    return {"rows":4*groups,"choices":groups+1,"side_rows":q,
            "seed":seed,"budget_s":budget,"trials":trials}

def main():
    # Three 240-row seeds with distinct baseline times + one 480-row failure
    # and one independently unseen sample. Four solver methods per model.
    configs=[(60,20,31,8.),(60,20,7,8.),(60,20,43,4.),
             (60,20,59,8.),(120,25,17,10.)]
    results=[]
    for spec in configs:
        result=run_case(*spec)
        print("LP_PULSE_AB="+json.dumps(result),flush=True)
        results.append(result)
    result={"scope":"generated Crew source-matched LP pulse vs CP",
        "official_score":None,"results":results}
    path=ROOT/"artifacts"/"crew-lp-pulse-ab.json"
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(result,indent=2)+"\n")

if __name__=="__main__":main()
