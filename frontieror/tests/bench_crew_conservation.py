"""Targeted conservation-only A/B; no ZIP, no six-problem smoke suite."""
import importlib.util
import json
import statistics
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"solvers"/"hoffman1993"/"solve.py"
spec=importlib.util.spec_from_file_location("crew_cons_bench",SRC)
crew=importlib.util.module_from_spec(spec);spec.loader.exec_module(crew)
from test_crew_conservation import generated

def compare(perturb):
    data=generated(240,80,seed=42)
    if perturb:
        # One distinct side anomaly per row prevents conservation elimination;
        # all-singletons solution remains valid under tight side equality.
        for k,row in enumerate(data["base_constraints"]["D_matrix"]["rows"]):
            row[240+(k%120)]+=1.
    p=crew.parse(data)
    reduced=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
    original=crew.conserved_side_rows
    rows=original(p,reduced)
    crew.sparse_milp(p,time.monotonic()+6,reduction=reduced)
    result=[]
    labels=("old","new","old","new") if perturb else (
        "old","new","ideal","ideal","new","old")
    try:
        for label in labels:
            if label=="old":
                crew.conserved_side_rows=lambda *args: []
            elif label=="ideal":
                # Only permitted on this fixture with already independently
                # checked exact conserved rows. Removes classification costs.
                if len(rows)!=len(p[5]):
                    raise AssertionError("idealized oracle requires proof")
                crew.conserved_side_rows=lambda *args:list(range(len(p[5])))
            else:
                crew.conserved_side_rows=original
            begin=time.monotonic()
            answer,proven=crew.sparse_milp(p,time.monotonic()+7,
                reduction=reduced,return_certificate=True)
            elapsed=time.monotonic()-begin
            if not crew.verify(p,answer):raise AssertionError(label+" invalid")
            result.append({"label":label,"seconds":round(elapsed,5),
                 "objective":crew.objective(p,answer),"proven":bool(proven)})
    finally:
        crew.conserved_side_rows=original
    objectives={r["objective"] for r in result}
    if len(objectives)!=1:raise AssertionError("objective regression")
    def med(label):
        samples=[r["seconds"] for r in result if r["label"]==label]
        return statistics.median(samples) if samples else None
    a,b,z=med("old"),med("new"),med("ideal")
    return {"case":"single_corrupted_pair_per_side" if perturb else "tight_conserved_side",
        "rows":p[0],"columns":p[1],"side_rows":len(p[5]),
        "proven_conserved_rows":len(rows),"old_s":a,"new_s":b,
        "ideal_zero_detection_s":z,
        "ratio_old_over_new":round(a/max(1e-8,b),3),
        "objective":result[0]["objective"],"samples":result}

def main():
    report={"scope":"isolated same-instance warm-optimizer conservation diagnosis",
        "official_score":None,"results":[compare(False),compare(True)]}
    print(json.dumps(report))
    path=ROOT/"artifacts"/"crew-conservation-benchmark.json"
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,indent=2)+"\n")

if __name__=="__main__":main()
