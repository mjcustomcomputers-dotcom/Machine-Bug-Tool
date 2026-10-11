"""Identical-budget baseline/sentinel A/B on generated Crew cases."""
import importlib.util,json,time
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def load(n,path):
    s=importlib.util.spec_from_file_location(n,path)
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
crew=load("sentinel_b_crew",R/"solvers"/"hoffman1993"/"solve.py")
cases=load("sentinel_b_cases",R/"tests"/"test_crew_coupled_cycle_rescue.py")
oracle=load("sentinel_b_oracle",R/"tests"/"test_crew_five_level_parity.py")
all_results=[]
for groups,side,seed,budget in [(60,20,7,10),(60,20,31,10),(120,25,17,30)]:
    p=crew.parse(cases.cycle_case(groups=groups,q=side,seed=seed))
    reduction=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    rows=[]
    for mode in ("plain","sentinel"):
        t=time.monotonic();receipt={}
        choice=crew.coupled_cycle_choice_milp(
            p,t+budget,reduction=reduction,prefer_cp_feasibility=True,
            lp_core="sentinel" if mode=="sentinel" else False,
            telemetry=receipt)
        valid=oracle.independent_cover_truth(p,choice)
        if bool(valid)!=bool(crew.verify(p,choice)):
            raise AssertionError("ORIGINAL_SOURCE_ORACLE_MISMATCH")
        rows.append({"mode":mode,"seconds":round(time.monotonic()-t,5),
            "verified":bool(valid),
            "objective":crew.objective(p,choice) if valid else None,
            "core_route":receipt.get("core_route"),
            "core_verified":receipt.get("core_original_verified",False),
            "pulses":receipt.get("core_pulses",[])})
    item={"rows":groups*4,"side":side,"seed":seed,"budget":budget,
          "experiments":rows}
    print("SENTINEL_AB="+json.dumps(item),flush=True)
    all_results.append(item)
target=R/"artifacts"/"crew-pulse-sentinel-ab.json"
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps({"official_score":None,"tests":all_results},
                             indent=2)+"\n")
