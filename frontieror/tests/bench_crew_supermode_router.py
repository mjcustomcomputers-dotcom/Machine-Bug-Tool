"""Rank/density classifier test on hard generated Crew score-floor cases.

Each CP variant gets same wall time and independent original verifier.
Test order is alternated. Source-known feasible witness is NOT fed to solver.
"""
import importlib.util,json,time
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
crew=load("rank_density_solver",ROOT/"solvers"/"hoffman1993"/"solve.py")
gen=load("rank_density_generated",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
oracle=load("rank_density_original_oracle",ROOT/"tests"/"test_crew_five_level_parity.py")

def side_profile(problem,groups):
    p=crew.parse(problem)
    q=len(p[5])
    n=groups+1
    matrix=np.zeros((q,n),dtype=float)
    lhs=[]
    rhs=[]
    for k,row in enumerate(p[5]):
        first=sum(row[4*c]+row[4*c+1] for c in range(groups))
        for c in range(groups):
            matrix[k,c]=row[4*c+2]+row[4*c+3]-row[4*c]-row[4*c+1]
        matrix[k,-1]=row[-1]
        lhs.append(p[6][k]-first)
        rhs.append(p[7][k]-first)
    margins=[1e-6*max(1.,abs(p[6][k]),abs(p[7][k]))
             for k in range(q)]
    summary=crew.parity_rank_density_profile(
        matrix,np.asarray(lhs),np.asarray(rhs),margins)
    return {key:summary[key] for key in
            ("n","q","rank","rank_fraction","density","use_parity")}

def run(groups,q,seed,budget,mode):
    data=gen.cycle_case(groups=groups,q=q,seed=seed,empty=True)
    p=crew.parse(data)
    reduced=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    t=time.monotonic()
    answer,cert=crew.coupled_cycle_choice_milp(
        p,t+budget,reduction=reduced,return_certificate=True,
        prefer_cp_feasibility=True,cp_parity=mode)
    valid=oracle.independent_cover_truth(p,answer)
    if crew.verify(p,answer)!=valid:
        raise AssertionError("ORACLE_DIFFERENCE")
    return {"mode":mode if isinstance(mode,str) else ("xor_on" if mode else "plain"),
        "budget_s":budget,"elapsed_s":round(time.monotonic()-t,5),
        "original_verified":bool(valid),
        "objective":crew.objective(p,answer) if valid else None,
        "claimed_optimal":bool(cert)}

def main():
    specs=[(60,20,31,10),(60,20,23,10),(120,25,17,16)]
    result=[]
    for index,(groups,q,seed,budget) in enumerate(specs):
        data=gen.cycle_case(groups=groups,q=q,seed=seed,empty=True)
        mode_order=(False,"auto",True) if index%2==0 else (True,"auto",False)
        attempts=[]
        for mode in mode_order:
            record=run(groups,q,seed,budget,mode)
            attempts.append(record)
            print("SUPERMODE_SAMPLE="+json.dumps({
                "rows":groups*4,"side":q,"seed":seed,**record}),flush=True)
        result.append({"rows":groups*4,"side":q,"seed":seed,
          "profile":side_profile(data,groups),"attempts":attempts})
    report={"kind":"JOHNNY5_RANK_DENSITY_SUPERMODE",
       "source":"generated identical known-feasible Crew input",
       "private_score":None,"cases":result}
    path=ROOT/"artifacts"/"crew-supermode-rank-density.json"
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,indent=2)+"\n")
    print("SUPERMODE_RESULT="+json.dumps(report),flush=True)

if __name__=="__main__":main()
