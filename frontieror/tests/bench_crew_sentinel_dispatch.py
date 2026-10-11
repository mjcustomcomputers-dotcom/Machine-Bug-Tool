"""First true solve()-path A/B; generated instances, not organizer scoring."""
import importlib.util,json,time
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def get(n,p):
    spec=importlib.util.spec_from_file_location(n,p)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
crew=get("dispatch_b",R/"solvers"/"hoffman1993"/"solve.py")
gen=get("dispatch_g",R/"tests"/"test_crew_coupled_cycle_rescue.py")
truth=get("dispatch_o",R/"tests"/"test_crew_five_level_parity.py")
records=[]
for groups,side,seed,budget,modes in (
       (60,20,7,25,("plain","opt_in")),
       (60,20,31,25,("opt_in","plain")),
       (60,20,43,25,("opt_in","plain")),
       (60,20,59,25,("plain","opt_in"))):
    data=gen.cycle_case(groups=groups,q=side,seed=seed)
    p=crew.parse(data)
    batch=[]
    for mode in modes:
        obs={};st=time.monotonic()
        try:
            result=crew.solve(data,budget,experimental_cycle_rescue=mode=="opt_in",
                experimental_telemetry=obs)
            chosen=result["selected_rotations"]
            ok=truth.independent_cover_truth(p,chosen)
            if ok!=crew.verify(p,chosen):raise AssertionError("VERIFIER_MISMATCH")
            if not ok:raise AssertionError("INVALID_ORIGINAL_COVER")
            outcome={"verified":True,"objective":crew.objective(p,chosen)}
        except RuntimeError as err:
            if "No verified exact crew cover" not in str(err):raise
            outcome={"verified":False,"objective":None}
        outcome.update({"method":mode,"seconds":round(time.monotonic()-st,5),
                        "route":obs.get("cycle_dispatch"),
                        "cycle_seconds":obs.get("cycle_seconds"),
                        "cycle_verified":obs.get("cycle_original_verified")})
        batch.append(outcome)
    entry={"rows":groups*4,"side":side,"seed":seed,
           "budget_s":budget,"attempts":batch}
    records.append(entry)
    print("RESERVE_DISPATCH="+json.dumps(entry),flush=True)
path=R/"artifacts"/"crew-fallback-reserve-e2e.json"
path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps({"official_score":None,"tests":records},indent=2)+"\n")
