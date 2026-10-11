"""Same-source ABBA: pair-only conservation vs full exact MILP."""
import importlib.util,json,statistics,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"solvers"/"hoffman1993"/"solve.py"
spec=importlib.util.spec_from_file_location("crew_pair_bench",SRC)
crew=importlib.util.module_from_spec(spec);spec.loader.exec_module(crew)

def fixture(blocks=55,q=65,perturbed=False):
    m=4*blocks
    cols=[]
    costs=[]
    for b in range(blocks):
        a=4*b
        cols += [[a,a+1],[a+2,a+3],[a,a+3],[a+1,a+2]]
        costs += [7.,8.,2.,3.]
    d=[];lo=[];hi=[]
    for k in range(q):
        u=[float((7*r+13*k)%17-8) for r in range(m)]
        row=[sum(u[r] for r in col) for col in cols]
        if perturbed:
            row[0]+=1.
        d.append(row)
        lo.append(float(sum(u)))
        hi.append(float(sum(u)))
    return {"dimensions":{"num_rows":m,"num_cols":len(cols)},
       "cost_vector":costs,"constraint_matrix_A":{"columns":cols},
       "has_base_constraints":True,
       "base_constraints":{"D_matrix":{"rows":d},
          "lower_bounds_d1":lo,"upper_bounds_d2":hi}}

def compare(perturbed=False):
    p=crew.parse(fixture(perturbed=perturbed))
    red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    direct=crew.pair_conserved_side_rows(p,red)
    baseline=crew.pair_conserved_side_rows
    sample=[]
    crew.sparse_milp(p,time.monotonic()+5,reduction=red)
    try:
        for mode in ("old","new","new","old"):
            crew.pair_conserved_side_rows=(baseline if mode=="new" else lambda *args: [])
            start=time.monotonic()
            ans,proof=crew.sparse_milp(p,start+6,reduction=red,return_certificate=True)
            elapsed=time.monotonic()-start
            if not crew.verify(p,ans):raise AssertionError("invalid "+mode)
            sample.append({"mode":mode,"seconds":round(elapsed,5),
                           "objective":crew.objective(p,ans),"proof":bool(proof)})
    finally:crew.pair_conserved_side_rows=baseline
    cost={x["objective"] for x in sample}
    if len(cost)!=1:raise AssertionError("objective changed")
    a=statistics.median(x["seconds"] for x in sample if x["mode"]=="old")
    b=statistics.median(x["seconds"] for x in sample if x["mode"]=="new")
    return {"kind":"one_corrupted_pair" if perturbed else "exact_pair_potentials",
      "rows":p[0],"cols":p[1],"side_rows":len(p[5]),
      "side_certificates":len(direct),
      "old_s":a,"new_s":b,"speed_ratio":round(a/max(b,1e-9),3),
      "objective":sample[0]["objective"],"samples":sample}

if __name__=="__main__":
    report={"type":"focused_pair_potential_ABBA","official_score":None,
            "results":[compare(),compare(True)]}
    print(json.dumps(report))
    dest=ROOT/"artifacts"/"crew-pair-potential-abba.json"
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(report,indent=2)+"\n")
