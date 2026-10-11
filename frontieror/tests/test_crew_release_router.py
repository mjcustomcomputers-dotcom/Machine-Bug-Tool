"""Promotion gate for source-verified resource-aware Crew dispatch.
Tests the actual default solve() call (not an explicit experimental switch),
including generated hard and unseen easy cases. No private data.
"""
from pathlib import Path
import importlib.util, time, unittest
R=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj);return obj
crew=load("release_crew",R/"solvers"/"hoffman1993"/"solve.py")
generator=load("release_generator",R/"tests"/"test_crew_coupled_cycle_rescue.py")
oracle=load("release_oracle",R/"tests"/"test_crew_five_level_parity.py")
class ReleaseRouter(unittest.TestCase):
    def test_frozen_calibration_and_independent_holdout(self):
        for seed,expected in ((7,498),(31,619),(43,542),(59,578),
                              (71,592),(83,564),(97,551)):
            with self.subTest(seed=seed):
                raw=generator.cycle_case(groups=60,q=20,seed=seed)
                info={}
                t=time.monotonic()
                answer=crew.solve(raw,25,experimental_telemetry=info)
                original=crew.parse(raw)
                selected=answer["selected_rotations"]
                self.assertTrue(oracle.independent_cover_truth(original,selected))
                self.assertEqual(answer["objective_value"],expected)
                self.assertEqual(info.get("release_auto_portfolio"),"STAGED_2VCPU")
                self.assertEqual(info.get("staged_winner"),"cycle_pulse")
                self.assertLess(time.monotonic()-t,25.0)
    def test_original_output_and_fallback_on_small_fixture(self):
        raw=generator.cycle_case(groups=4,q=8,seed=3)
        trace={}
        ans=crew.solve(raw,8,experimental_telemetry=trace)
        self.assertTrue(oracle.independent_cover_truth(crew.parse(raw),ans["selected_rotations"]))
        self.assertNotIn("release_auto_portfolio",trace)
    def test_480_graph_veto_before_very_heavy_search(self):
        raw=generator.cycle_case(groups=120,q=25,seed=17)
        p=crew.parse(raw)
        reduced=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(len(reduced[1]),480)
        self.assertGreater(len(reduced[1]),12*len(p[5]))
if __name__=="__main__":unittest.main()
