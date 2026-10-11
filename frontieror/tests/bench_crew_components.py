"""Objective-matched ABBA comparison of exact residual DP and full MILP."""
import importlib.util
import json
import statistics
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/"solvers"/"hoffman1993"/"solve.py"
SPEC=importlib.util.spec_from_file_location("crew_components_bench",PATH)
crew=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(crew)

def data(groups=600,side_count=100):
    m=2*groups
    columns=[[i] for i in range(m)]+[[2*k,2*k+1] for k in range(groups)]+[[]]
    n=len(columns)
    side=[[float(((11*j+7*k)%9)-4)/10 for j in range(n)]
          for k in range(side_count)]
    return {"dimensions":{"num_rows":m,"num_cols":n},
      "cost_vector":[8.]*m+[3.]*groups+[-1.],
      "constraint_matrix_A":{"columns":columns},"has_base_constraints":True,
      "base_constraints":{"D_matrix":{"rows":side},
        "lower_bounds_d1":[-10000.]*side_count,
        "upper_bounds_d2":[10000.]*side_count}}

def main():
    p=crew.parse(data())
    red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    assert len(crew.redundant_side_rows(p,red))==100
    records=[]
    # Warm the heavy SciPy imports before timing, giving the full MILP every
    # advantage. Compare equal mathematical objective, not just feasibility.
    warm=crew.sparse_milp(p,time.monotonic()+6,reduction=red)
    assert crew.verify(p,warm)
    for mode in ("full","components","components","full"):
        start=time.monotonic()
        if mode=="full":
            ans=crew.sparse_milp(p,start+7,reduction=red)
            proven=None
        else:
            ans,proven=crew.exact_residual_components(p,start+7,red)
        elapsed=time.monotonic()-start
        assert crew.verify(p,ans),mode
        assert abs(crew.objective(p,ans)-1799.)<1e-7,mode
        if mode=="components":assert proven
        records.append({"mode":mode,"time_s":round(elapsed,5),
                        "objective":crew.objective(p,ans),
                        "certificate":proven})
    direct=statistics.median(x["time_s"] for x in records if x["mode"]=="full")
    split=statistics.median(x["time_s"] for x in records if x["mode"]=="components")
    report={"scope":"synthetic original objective and isolated solve-phase",
      "rows":p[0],"columns":p[1],"side_rows":len(p[5]),
      "original_verified_cost":1799.,"samples":records,
      "full_median_s":direct,"components_median_s":split,
      "full_over_components":round(direct/max(1e-8,split),3),
      "official_score":None}
    target=ROOT/"artifacts"/"component-abba.json"
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report))

if __name__=="__main__":
    main()
