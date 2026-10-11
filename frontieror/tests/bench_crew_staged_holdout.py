"""Precommitted, untrained 2CPU Crew algorithm-selection holdout."""
import importlib.util,time,json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def load(n,p):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
crew=load("holdout_s",R/"solvers"/"hoffman1993"/"solve.py")
cases=load("holdout_g",R/"tests"/"test_crew_coupled_cycle_rescue.py")
truth=load("holdout_t",R/"tests"/"test_crew_five_level_parity.py")
# These seeds and their ABBA order are fixed before seeing any native result.
precommitted=((71,("plain","staged")),(83,("staged","plain")),(97,("plain","staged")))
results=[]
for seed,modes in precommitted:
 raw=cases.cycle_case(groups=60,q=20,seed=seed)
 p=crew.parse(raw)
 experiments=[]
 for mode in modes:
  st=time.monotonic();info={}
  try:
   out=crew.solve(raw,25,experimental_dual_portfolio=(mode=="staged"),
      experimental_portfolio_schedule="staged",experimental_telemetry=info)
   answer=out["selected_rotations"]
   valid=truth.independent_cover_truth(p,answer)
   if valid!=crew.verify(p,answer):raise AssertionError("INDEPENDENT_ORIGINAL_TRUTH_MISMATCH")
  except RuntimeError as exc:
   if "No verified exact crew cover" not in str(exc):raise
   valid=False;answer=None
  experiments.append({"mode":mode,"valid":bool(valid),
    "objective":crew.objective(p,answer) if valid else None,
    "seconds":round(time.monotonic()-st,5),
    "staged_winner":info.get("staged_winner"),
    "staged_cycle_wall":info.get("staged_cycle_wall"),
    "staged_mip_wall":info.get("staged_mip_wall")})
 item={"rows":240,"side":20,"seed":seed,"budget_s":25,
   "methods":experiments}
 print("STAGED_HOLDOUT_ABBA="+json.dumps(item),flush=True)
 results.append(item)
dest=R/"artifacts"/"crew-staged-holdout.json";dest.parent.mkdir(parents=True,exist_ok=True)
dest.write_text(json.dumps({"score":None,"precommitted":True,
                            "observations":results},indent=2)+"\n")
