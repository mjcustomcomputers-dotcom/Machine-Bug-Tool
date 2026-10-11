"""Equal-budget generated hard-case A/B for LP-guided bounded neighborhoods."""
import importlib.util,json,time
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def load(n,p):
    s=importlib.util.spec_from_file_location(n,p)
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
solver=load("fixrelax_bench_solver",R/"solvers"/"hoffman1993"/"solve.py")
cases=load("fixrelax_bench_cases",R/"tests"/"test_crew_coupled_cycle_rescue.py")
truth=load("fixrelax_bench_truth",R/"tests"/"test_crew_five_level_parity.py")
specs=[(60,20,7,10),(60,20,31,10),(120,25,17,30)]
out=[]
for g,q,seed,budget in specs:
    raw=cases.cycle_case(groups=g,q=q,seed=seed,empty=True)
    p=solver.parse(raw)
    red=solver.reduce_forced_rotations(p,solver.dominated_rotations(p))
    variants=("fixed_relax","plain") if seed%2==0 else ("plain","fixed_relax")
    record={"rows":4*g,"side_rows":q,"seed":seed,"budget_s":budget,"runs":[]}
    for mode in variants:
        t=time.monotonic()
        info={}
        ans=solver.coupled_cycle_choice_milp(
            p,t+budget,reduction=red,prefer_cp_feasibility=True,
            lp_neighborhood=(mode=="fixed_relax"),telemetry=info)
        valid=truth.independent_cover_truth(p,ans)
        if valid!=solver.verify(p,ans):
            raise AssertionError("ORACLE_DISAGREEMENT")
        record["runs"].append({"mode":mode,"wall_s":round(time.monotonic()-t,5),
            "verified":bool(valid),"objective":solver.objective(p,ans) if valid else None,
            "waves":info.get("repair_waves",[]),
            "repair_verified":info.get("repair_original_verified",False)})
    print("FIXRELAX_AB="+json.dumps(record),flush=True)
    out.append(record)
path=R/"artifacts"/"crew-fix-relax-ab.json"
path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps({"scope":"synthetic exact-cover bounded neighbor reconstruction","official_score":None,"cases":out},indent=2)+"\n")
