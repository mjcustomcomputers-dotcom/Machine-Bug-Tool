"""A/B guarded LP-pulse filter: original source, held-out seeds, no ZIP."""
import importlib.util,json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(n,p):
    sp=importlib.util.spec_from_file_location(n,p)
    m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m);return m
crew=load("adaptive_pulse_solver",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixture=load("adaptive_pulse_fixture",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
oracle=load("adaptive_pulse_checker",ROOT/"tests"/"test_crew_five_level_parity.py")
def one(groups,q,seed,budget):
    raw=fixture.cycle_case(groups=groups,q=q,seed=seed,empty=True)
    p=crew.parse(raw)
    red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    results=[]
    order=("plain","echo","adaptive","lp_forced") if seed%2 else (
           "adaptive","echo","plain","lp_forced")
    for method in order:
        t=time.monotonic()
        telemetry={}
        answer=crew.coupled_cycle_choice_milp(
            p,t+budget,reduction=red,
            prefer_cp_feasibility=True,
            cp_parity=("echo" if method in ("echo","adaptive") else False),
            lp_pulse=(True if method=="lp_forced" else
                      "adaptive" if method=="adaptive" else False),
            telemetry=telemetry)
        passed=oracle.independent_cover_truth(p,answer)
        if passed!=crew.verify(p,answer):
            raise AssertionError("SOURCE_TRUTH_MISMATCH")
        results.append({"route":method,"time_s":round(time.monotonic()-t,5),
          "verified":bool(passed),"original_objective":
                 crew.objective(p,answer) if passed else None,
          "pulse_hint_selected":telemetry.get("lp_adaptive_hint_selected"),
          "hinted_variables":telemetry.get("lp_hint_variables",0),
          "lp_pulses":telemetry.get("lp_pulses",[])})
    return {"original_rows":groups*4,"q":q,"seed":seed,"budget":budget,
            "results":results}
def main():
    configs=[(60,20,7,8.0),(60,20,31,8.0),
             (60,20,59,5.0),(60,20,61,5.0),
             (60,20,71,5.0),(120,25,17,5.0)]
    results=[]
    for c in configs:
        x=one(*c)
        results.append(x)
        print("PULSE_FILTER_AB="+json.dumps(x),flush=True)
    report={"scope":"generated Crew LP hint route, original verification",
      "leaderboard_score":None,"instances":results}
    out=ROOT/"artifacts"/"crew-lp-pulse-filter-ab.json"
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2)+"\n")
if __name__=="__main__":main()
