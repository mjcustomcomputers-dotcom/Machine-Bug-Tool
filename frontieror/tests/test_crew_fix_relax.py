"""Generated exact-cover witness checks for LP-guided binary neighborhoods."""
import importlib.util,time,unittest
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def load(n,p):
    spec=importlib.util.spec_from_file_location(n,p)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
solver=load("fixrelax_solver",R/"solvers"/"hoffman1993"/"solve.py")
cases=load("fixrelax_cases",R/"tests"/"test_crew_coupled_cycle_rescue.py")
oracle=load("fixrelax_checker",R/"tests"/"test_crew_five_level_parity.py")
class Tests(unittest.TestCase):
    def test_generated_small_original_truth(self):
        for seed in range(12):
            with self.subTest(seed=seed):
                p=solver.parse(cases.cycle_case(groups=8,q=12,seed=seed))
                log={}
                ans=solver.coupled_cycle_choice_milp(
                    p,time.monotonic()+3,prefer_cp_feasibility=True,
                    lp_neighborhood=True,telemetry=log)
                self.assertTrue(oracle.independent_cover_truth(p,ans))
                self.assertTrue(solver.verify(p,ans))
    def test_generated_medium_original_truth(self):
        p=solver.parse(cases.cycle_case(groups=20,q=16,seed=11))
        log={}
        ans=solver.coupled_cycle_choice_milp(
            p,time.monotonic()+5,prefer_cp_feasibility=True,
            lp_neighborhood=True,telemetry=log)
        self.assertTrue(oracle.independent_cover_truth(p,ans))
        self.assertIn("repair_waves",log)
    def test_violated_side_bound(self):
        d=cases.cycle_case(groups=20,q=16,seed=11)
        b=d["base_constraints"];b["D_matrix"]["rows"][0]=[
            0.]*d["dimensions"]["num_cols"]
        b["lower_bounds_d1"][0]=1.;b["upper_bounds_d2"][0]=1.
        p=solver.parse(d)
        answer=solver.coupled_cycle_choice_milp(
            p,time.monotonic()+2,prefer_cp_feasibility=True,
            lp_neighborhood=True)
        self.assertIsNone(answer)
    def test_mutant_checker(self):
        p=solver.parse(cases.cycle_case(groups=8,q=12,seed=3))
        ans=solver.coupled_cycle_choice_milp(
            p,time.monotonic()+3,prefer_cp_feasibility=True,
            lp_neighborhood=True)
        j=next(i for i in ans if p[3][i])
        corrupt=[i for i in ans if i!=j]
        self.assertFalse(oracle.independent_cover_truth(p,corrupt))
        self.assertFalse(solver.verify(p,corrupt))
if __name__=="__main__":unittest.main()
