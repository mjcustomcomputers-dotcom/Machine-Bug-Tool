"""Sonar method/classifier fused into one CP build: original truth A/B.

No full solver suite, no private instances, no ZIP. Compare plain, existing
rank-density auto, and new pressure+rank 'echo' on identical source input.
"""
import importlib.util,json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    return mod
crew=load("inline_sonar_crew",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixture=load("inline_sonar_cases",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
oracle=load("inline_sonar_verifier",ROOT/"tests"/"test_crew_five_level_parity.py")

def one(seed,groups,q,budget):
    raw=fixture.cycle_case(groups=groups,q=q,seed=seed,empty=True)
    p=crew.parse(raw)
    red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    samples=[]
    order=("plain","auto","echo") if seed%2 else ("echo","auto","plain")
    for method in order:
        t=time.monotonic()
        echo={}
        result=crew.coupled_cycle_choice_milp(
            p,t+budget,reduction=red,
            prefer_cp_feasibility=True,cp_parity=(False if method=="plain" else method),
            telemetry=echo)
        elapsed=time.monotonic()-t
        valid=oracle.independent_cover_truth(p,result)
        if valid!=crew.verify(p,result):
            raise AssertionError("ORIGINAL_CHECKER_MISMATCH")
        samples.append({"method":method,"time_s":round(elapsed,5),
                        "valid":bool(valid),
                        "objective":crew.objective(p,result) if valid else None,
                        "telemetry":{k:echo.get(k) for k in
                          ("parity_rank","parity_fraction","density","use_parity_prior",
                           "parity_atoms_added","method")}})
    return {"seed":seed,"rows":groups*4,"q":q,"budget":budget,"samples":samples}

def main():
    specs=[(7,60,20,8.),(31,60,20,8.),(43,60,20,4.),
           (3,60,20,4.),(18,60,20,4.),(17,120,25,5.)]
    results=[]
    for args in specs:
        rec=one(*args)
        results.append(rec)
        print("INLINE_SONAR_AB="+json.dumps(rec),flush=True)
    report={"scope":"original-verifier, synthetic, same-budget CP",
            "official_score":None,"results":results}
    out=ROOT/"artifacts"/"crew-inline-sonar-ab.json"
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2)+"\n")
if __name__=="__main__":main()
