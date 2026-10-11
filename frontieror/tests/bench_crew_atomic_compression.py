"""ABBA wall-clock test of original vs atom-compressed side constraints.

Nonredundant cloned/inverted rows make compression useful. Also measure
unique-row control for pathological compression overhead.
"""
import importlib.util
import json
import statistics
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
PATH=ROOT/"solvers"/"hoffman1993"/"solve.py"
spec=importlib.util.spec_from_file_location("crew_atoms_bench",PATH)
crew=importlib.util.module_from_spec(spec)
spec.loader.exec_module(crew)

def make(groups=240,rows=100,unique=False):
    m=2*groups
    columns=[[i] for i in range(m)]+[[2*i,2*i+1] for i in range(groups)]
    n=len(columns)
    costs=[8.]*m+[3.]*groups
    side=[];lower=[];upper=[]
    pattern=[0.]*m+[1.]*groups
    for k in range(rows):
        if unique:
            coefficients=pattern.copy()
            coefficients[m+(k%groups)]=1.0+(k+1)*0.01
            lo,hi=70.,195.
        elif k%2:
            coefficients=[-v for v in pattern]
            lo,hi=-170.,-120.
        else:
            coefficients=pattern[:]
            lo,hi=120.,170.
        side.append(coefficients)
        lower.append(lo);upper.append(hi)
    return {"dimensions":{"num_rows":m,"num_cols":n},
      "cost_vector":costs,"constraint_matrix_A":{"columns":columns},
      "has_base_constraints":True,
      "base_constraints":{"D_matrix":{"rows":side},
            "lower_bounds_d1":lower,"upper_bounds_d2":upper}}

def compare(unique=False):
    p=crew.parse(make(unique=unique))
    red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    exclude=crew.redundant_side_rows(p,red)
    compressed=crew.compact_side_atoms(p,red,exclude)
    original_count=len(p[5])-len(exclude)
    original_fn=crew.compact_side_atoms
    def plain(p,reduction,exclude=()):
        omitted=set(exclude)
        forced,_,_=reduction
        return [(k,p[6][k]-sum(p[5][k][j] for j in forced),
                   p[7][k]-sum(p[5][k][j] for j in forced))
                for k in range(len(p[5])) if k not in omitted]
    crew.sparse_milp(p,time.monotonic()+8,reduction=red)
    samples=[]
    try:
        for mode in ("full","compressed","compressed","full"):
            crew.compact_side_atoms=plain if mode=="full" else original_fn
            t=time.monotonic()
            ans=crew.sparse_milp(p,time.monotonic()+8,reduction=red,
                                return_certificate=True)
            elapsed=time.monotonic()-t
            solution,cert=ans
            if not crew.verify(p,solution):raise AssertionError(mode+" invalid")
            samples.append({"mode":mode,"time_s":round(elapsed,5),
                  "objective":crew.objective(p,solution),
                  "proven":bool(cert)})
    finally:
        crew.compact_side_atoms=original_fn
    costs={r["objective"] for r in samples}
    if len(costs)!=1:raise AssertionError("A/B objective changed")
    before=statistics.median(r["time_s"] for r in samples if r["mode"]=="full")
    after=statistics.median(r["time_s"] for r in samples if r["mode"]=="compressed")
    return {"scenario":"all_unique" if unique else "cloned_and_sign_inverted",
      "original_side_rows":original_count,
      "compressed_side_atoms":len(compressed),
      "time_full_s":before,"time_compressed_s":after,
      "speed_ratio":round(before/max(after,1e-9),3),
      "objective":samples[0]["objective"],
      "samples":samples}

def main():
    results=[compare(False),compare(True)]
    report={"scope":"controlled ABBA synthetic Crew MILP, not official score",
      "results":results,"official_score":None}
    target=ROOT/"artifacts"/"atomic-compression-abba.json"
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report))

if __name__=="__main__":
    main()
