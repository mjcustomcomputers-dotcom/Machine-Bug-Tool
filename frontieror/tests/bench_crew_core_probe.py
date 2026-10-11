"""Source-matched binary core-repair comparison on generated Crew models."""
import importlib.util,json,time
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def use(n,p):
    s=importlib.util.spec_from_file_location(n,p)
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
crew=use("coreb_solver",R/"solvers"/"hoffman1993"/"solve.py")
cases=use("coreb_cases",R/"tests"/"test_crew_coupled_cycle_rescue.py")
truth=use("coreb_truth",R/"tests"/"test_crew_five_level_parity.py")
out=[]
for g,q,seed,budget in ((60,20,7,10),(60,20,31,10),(120,25,17,30)):
    raw=cases.cycle_case(groups=g,q=q,seed=seed,empty=True)
    p=crew.parse(raw)
    red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    rows=[]
    for method in ("plain","core"):
        t=time.monotonic()
        details={}
        ans=crew.coupled_cycle_choice_milp(
            p,t+budget,reduction=red,prefer_cp_feasibility=True,
            lp_core=method=="core",telemetry=details)
        verified=truth.independent_cover_truth(p,ans)
        if verified!=crew.verify(p,ans):
            raise AssertionError("SOURCE_CHECKER_DISAGREEMENT")
        rows.append({"method":method,"seconds":round(time.monotonic()-t,5),
          "valid":bool(verified),
          "objective":crew.objective(p,ans) if verified else None,
          "core_verified":details.get("core_original_verified",False),
          "cores":details.get("core_pulses",[])})
    record={"rows":4*g,"side":q,"seed":seed,"budget":budget,"methods":rows}
    print("CORE_PROBE_AB="+json.dumps(record),flush=True)
    out.append(record)
dest=R/"artifacts"/"crew-core-probe-ab.json"
dest.parent.mkdir(parents=True,exist_ok=True)
dest.write_text(json.dumps({"official_score":None,"results":out},indent=2)+"\n")
