"""Precommitted, generated holdout seed sweep for LP pulse gating.

No private challenge data. Same budgets, independently verified source
solution and objective. Alternating order reduces one-time import bias.
"""
import importlib.util,json,statistics,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    sp=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m);return m
crew=load("pulse_sweep_crew",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixture=load("pulse_sweep_fixture",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
check=load("pulse_sweep_checker",ROOT/"tests"/"test_crew_five_level_parity.py")
SEEDS=[2,9,14,26,33,47,56,64,76,88]
results=[]
for index,seed in enumerate(SEEDS):
    data=fixture.cycle_case(groups=60,q=20,seed=seed,empty=True)
    p=crew.parse(data)
    red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    order=("plain","adaptive") if index%2 else ("adaptive","plain")
    trials=[]
    for mode in order:
        t=time.monotonic()
        info={}
        ans=crew.coupled_cycle_choice_milp(
            p,t+4.0,reduction=red,
            prefer_cp_feasibility=True,cp_parity=False,
            lp_pulse="adaptive" if mode=="adaptive" else False,
            telemetry=info)
        passed=check.independent_cover_truth(p,ans)
        if passed!=crew.verify(p,ans):
            raise AssertionError("ORIGINAL_ORACLE_DISAGREES")
        trials.append({"mode":mode,"wall_s":round(time.monotonic()-t,5),
           "verified":bool(passed),
           "original_cost":crew.objective(p,ans) if passed else None,
           "hint_selected":info.get("lp_adaptive_hint_selected"),
           "pulse_count":len(info.get("lp_pulses",[]))})
    report={"seed":seed,"original_rows":240,"side_rows":20,"budget_s":4,
            "trials":trials}
    print("PULSE_SWEEP="+json.dumps(report),flush=True)
    results.append(report)
wins=losses=neutral=rescued=lost=0
for case in results:
    p=next(x for x in case["trials"] if x["mode"]=="plain")
    a=next(x for x in case["trials"] if x["mode"]=="adaptive")
    if a["verified"] and not p["verified"]:rescued+=1
    elif p["verified"] and not a["verified"]:lost+=1
    elif a["verified"] and p["verified"]:
        if a["wall_s"]<0.75*p["wall_s"]:wins+=1
        elif a["wall_s"]>1.25*p["wall_s"]:losses+=1
        else:neutral+=1
result={"scope":"generated preselected holdout seed sweep",
        "official_score":None,"tested":len(results),
        "rescued":rescued,"lost_feasibility":lost,
        "speed_wins_over25pct":wins,"speed_losses_over25pct":losses,
        "near_neutral":neutral,"cases":results}
out=ROOT/"artifacts"/"crew-lp-pulse-independent-seeds.json"
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(result,indent=2)+"\n")
print("PULSE_SWEEP_SUMMARY="+json.dumps({k:v for k,v in result.items()
                        if k!="cases"}),flush=True)
