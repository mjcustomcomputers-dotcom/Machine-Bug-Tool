"""Full-solver race versus native baseline; original independent truth."""
import json,importlib.util,time
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def load(n,p):
 s=importlib.util.spec_from_file_location(n,p)
 m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
crew=load("dual_b_s",R/"solvers"/"hoffman1993"/"solve.py")
case=load("dual_b_c",R/"tests"/"test_crew_coupled_cycle_rescue.py")
truth=load("dual_b_t",R/"tests"/"test_crew_five_level_parity.py")
out=[]
for seed,modes in ((7,("plain","dual")),(31,("dual","plain")),(43,("dual",)),(59,("dual",))):
 raw=case.cycle_case(groups=60,q=20,seed=seed)
 p=crew.parse(raw);rows=[]
 for method in modes:
  receipt={};t=time.monotonic()
  try:
   answer=crew.solve(raw,25,
     experimental_dual_portfolio=(method=="dual"),experimental_telemetry=receipt)
   selected=answer["selected_rotations"]
   good=truth.independent_cover_truth(p,selected)
   if good!=crew.verify(p,selected):raise AssertionError("SOURCE_CHECKER_MISMATCH")
  except RuntimeError as err:
   if "No verified exact crew cover" not in str(err):raise
   good=False;selected=None
  rows.append({"mode":method,"valid":bool(good),
      "seconds":round(time.monotonic()-t,5),
      "objective":crew.objective(p,selected) if good else None,
      "dual":receipt.get("dual_portfolio"),
      "winner":receipt.get("dual_winner"),
      "certified":receipt.get("dual_certified",False),
      "early_exit":receipt.get("dual_early_proof_exit",False),
      "events":receipt.get("dual_events",[])})
 item={"rows":240,"side":20,"seed":seed,"budget":25,"methods":rows}
 print("DUAL_PROOF_EXIT_AB="+json.dumps(item),flush=True);out.append(item)
dest=R/"artifacts"/"crew-dual-proof-exit-ab.json"
dest.parent.mkdir(parents=True,exist_ok=True)
dest.write_text(json.dumps({"official_score":None,"results":out},indent=2)+"\n")
