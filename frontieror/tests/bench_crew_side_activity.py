"""Same-instance exact objective vs side-row projection, Python 3.12."""
import importlib.util
import json
import statistics
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
src=ROOT/"solvers"/"hoffman1993"/"solve.py"
spec=importlib.util.spec_from_file_location("crew_activity_benchmark",src)
crew=importlib.util.module_from_spec(spec)
spec.loader.exec_module(crew)

def instance(m=1200,q=100):
    cols=[[i] for i in range(m)]+[[2*i,2*i+1] for i in range(m//2)]
    n=len(cols)
    side=[[float((13*j+17*k)%11-5)/10 for j in range(n)]
          for k in range(q)]
    return {"dimensions":{"num_rows":m,"num_cols":n},
            "cost_vector":[8.]*m+[3.]*(m//2),
            "constraint_matrix_A":{"columns":cols},
            "has_base_constraints":True,
            "base_constraints":{"D_matrix":{"rows":side},
              "lower_bounds_d1":[-10000.]*q,
              "upper_bounds_d2":[10000.]*q}}

def main():
    p=crew.parse(instance())
    reduction=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    number=len(crew.redundant_side_rows(p,reduction))
    if number!=100:
        raise AssertionError("all hundred deliberately wide constraints must be proven redundant")
    old=crew.redundant_side_rows
    samples=[]
    # Warm both native/linear algebra libraries outside the comparison.
    crew.sparse_milp(p,time.monotonic()+6,reduction=reduction)
    for mode in ("literal","projected","projected","literal"):
        crew.redundant_side_rows = old if mode=="projected" else lambda *args: []
        started=time.monotonic()
        answer=crew.sparse_milp(p,time.monotonic()+7,reduction=reduction)
        duration=time.monotonic()-started
        if not crew.verify(p,answer):
            raise AssertionError(mode+" failed original feasibility")
        samples.append({"mode":mode,"duration_s":round(duration,5),
                        "objective":crew.objective(p,answer)})
    crew.redundant_side_rows=old
    objectives={row["objective"] for row in samples}
    if len(objectives)!=1 or list(objectives)[0]!=1800.:
        raise AssertionError("objective changed after exact side projection")
    lit=statistics.median(x["duration_s"] for x in samples if x["mode"]=="literal")
    proj=statistics.median(x["duration_s"] for x in samples if x["mode"]=="projected")
    report={"type":"synthetic_same_instance_abba","original_rows":p[0],
      "original_columns":p[1],"side_rows":len(p[5]),
      "proven_redundant_side_rows":number,
      "objective":samples[0]["objective"],
      "literal_median_s":lit,"projected_median_s":proj,
      "ratio":round(lit/max(1e-8,proj),3),
      "samples":samples,"competition_score":None}
    path=ROOT/"artifacts"/"side-activity-benchmark.json"
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report))

if __name__=="__main__":
    main()
