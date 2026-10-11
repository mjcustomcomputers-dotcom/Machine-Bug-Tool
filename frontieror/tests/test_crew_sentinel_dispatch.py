"""Opt-in dispatch cannot bypass the unchanged original verifier."""
import importlib.util,time,unittest
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def get(n,p):
    s=importlib.util.spec_from_file_location(n,p)
    o=importlib.util.module_from_spec(s);s.loader.exec_module(o);return o
crew=get("dispatch_s",R/"solvers"/"hoffman1993"/"solve.py")
gen=get("dispatch_c",R/"tests"/"test_crew_coupled_cycle_rescue.py")
oracle=get("dispatch_truth",R/"tests"/"test_crew_five_level_parity.py")
class Dispatch(unittest.TestCase):
    def test_end_to_end_original_contract(self):
        for seed in (2,5):
            raw=gen.cycle_case(groups=3,q=5,seed=seed)
            trace={}
            answer=crew.solve(raw,9,experimental_cycle_rescue=True,
                              experimental_telemetry=trace)
            p=crew.parse(raw)
            self.assertTrue(oracle.independent_cover_truth(
                p,answer["selected_rotations"]))
            self.assertAlmostEqual(
                answer["objective_value"],
                crew.objective(p,answer["selected_rotations"]))
            self.assertEqual(len(answer["variable_values"]),p[1])
    def test_original_default_signature_remains(self):
        raw=gen.cycle_case(groups=3,q=5,seed=19)
        answer=crew.solve(raw,9)
        self.assertTrue(oracle.independent_cover_truth(
            crew.parse(raw),answer["selected_rotations"]))
if __name__=="__main__":unittest.main()
