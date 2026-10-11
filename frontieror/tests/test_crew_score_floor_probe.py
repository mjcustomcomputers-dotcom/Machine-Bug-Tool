"""Objective-first reconnaissance: can the cheap MRV rescue a 100-side-row
residual that the current dispatcher excludes? This is GENERATED only.
No private instances and no submission packaging.
"""
import importlib.util
import json
import time
import unittest
from pathlib import Path

HERE=Path(__file__).resolve().parent
SOLVER=HERE.parent/"solvers"/"hoffman1993"/"solve.py"
spec=importlib.util.spec_from_file_location("score_floor_crew",SOLVER)
crew=importlib.util.module_from_spec(spec);spec.loader.exec_module(crew)
reverse_spec=importlib.util.spec_from_file_location("reverse_case",HERE/"test_crew_reverse.py")
reverse=importlib.util.module_from_spec(reverse_spec);reverse_spec.loader.exec_module(reverse)


class CrewScoreFloorProbe(unittest.TestCase):
    def test_high_side_residual_feasibility_versus_dispatch_gate(self):
        raw=reverse.large_case(m=15000,n=15000,q=100,seed=3)
        p=crew.parse(raw)
        reduction=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertIsNotNone(reduction)
        forced,uncovered,active=reduction
        side_work=len(p[5])*len(active)
        self.assertGreater(side_work,24000)
        # The old solver skips its first inexpensive recovery because
        # side_work exceeds 24k despite a tiny residual.
        before=time.monotonic()
        result=crew.large_sparse_cover(p,before+2.0,reduction=reduction)
        elapsed=time.monotonic()-before
        receipt={"shape":"generated_15k_100_side",
                 "source_rows":p[0],"source_columns":p[1],
                 "residual_rows":len(uncovered),
                 "residual_columns":len(active),
                 "side_rows":len(p[5]),"side_work":side_work,
                 "old_gate_permits_MRV":side_work<=24000,
                 "MRV_seconds":round(elapsed,5),
                 "MRV_verified":crew.verify(p,result),
                 "MRV_objective":crew.objective(p,result) if crew.verify(p,result) else None}
        print("SCORE_FLOOR_PROBE="+json.dumps(receipt),flush=True)
        # Measure two native optimizers on the *same original objective and
        # full feasibility oracle*, not simply the cheapest method's exit.
        for decision in ("feasibility","objective"):
            started=time.monotonic()
            witness=crew.sparse_milp(
                p,time.monotonic()+3.5,reduction=reduction,
                feasibility_only=(decision=="feasibility"))
            delta=time.monotonic()-started
            print("SCORE_FLOOR_NATIVE="+json.dumps({
                "method":decision,"seconds":round(delta,5),
                "original_valid":crew.verify(p,witness),
                "objective":crew.objective(p,witness)
                     if crew.verify(p,witness) else None}),flush=True)
        # This is a diagnosis, not an assumed claim that MRV always wins.
        self.assertLess(elapsed,2.5)


if __name__=="__main__":
    unittest.main(verbosity=2)
