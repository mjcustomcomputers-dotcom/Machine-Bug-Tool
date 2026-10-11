"""Same-instance measured inverse cycle factorization vs full SciPy MILP.

Covers beneficial equal-side cycles AND corrupted/unequal side faults.
No submission ZIP. No multi-problem tests.
"""
import importlib.util,json,statistics,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"solvers"/"hoffman1993"/"solve.py"
sp=importlib.util.spec_from_file_location("cycle_runtime",SRC)
crew=importlib.util.module_from_spec(sp);sp.loader.exec_module(crew)
from test_crew_inverse_cycle import graph_case


def compare(blocks,q,corrupt=False):
    p=crew.parse(graph_case(blocks=blocks,q=q,seed=313,corruption=corrupt))
    reduced=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    # Prewarm SciPy to give the baseline full benefits of compiled imports.
    warm=crew.sparse_milp(p,time.monotonic()+4,reduction=reduced)
    if not crew.verify(p,warm):raise AssertionError("baseline not feasible")
    entries=[]
    for method in ("milp","cycles","cycles","milp"):
        t=time.monotonic()
        if method=="cycles":
            candidate,proof=crew.exact_cycle_cover(
                p,time.monotonic()+4,reduced)
            if candidate is None:
                candidate,proof=crew.sparse_milp(
                    p,time.monotonic()+4,reduction=reduced,return_certificate=True)
            else:
                proof=bool(proof)
        else:
            candidate,proof=crew.sparse_milp(
                p,time.monotonic()+4,reduction=reduced,return_certificate=True)
        duration=time.monotonic()-t
        if not crew.verify(p,candidate):raise AssertionError("invalid "+method)
        entries.append({"method":method,"s":round(duration,6),
                        "cost":crew.objective(p,candidate),"cert":bool(proof)})
    if len(set(v["cost"] for v in entries))!=1:raise AssertionError("cost changed")
    a=statistics.median(v["s"] for v in entries if v["method"]=="milp")
    b=statistics.median(v["s"] for v in entries if v["method"]=="cycles")
    return {"rows":p[0],"columns":p[1],"side_rows":len(p[5]),
      "fault":"single_edge_corrupt" if corrupt else "every_cycle_side_invariant",
      "objective":entries[0]["cost"],
      "MILP_median_s":a,"cycle_or_fallback_median_s":b,
      "speedup":round(a/max(1e-9,b),3),
      "samples":entries}

def main():
    configs=((15,8),(55,65),(150,65),(150,120))
    results=[compare(blocks,q,corrupt)
            for blocks,q in configs for corrupt in (False,True)]
    report={"scope":"isolated warmed synthetic Crew objective proof, no official score",
       "results":results,"official_score":None}
    print(json.dumps(report))
    out=ROOT/"artifacts"/"crew-inverse-cycle-abba.json"
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2)+"\n")

if __name__=="__main__":main()
