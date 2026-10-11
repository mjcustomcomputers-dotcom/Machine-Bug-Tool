"""Dual-method portfolio: simultaneous proposals, source-bound parent oracle."""
import importlib.util,time,unittest
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def load(n,p):
 s=importlib.util.spec_from_file_location(n,p)
 m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
crew=load("dual_s",R/"solvers"/"hoffman1993"/"solve.py")
cases=load("dual_g",R/"tests"/"test_crew_coupled_cycle_rescue.py")
truth=load("dual_v",R/"tests"/"test_crew_five_level_parity.py")
class Portfolio(unittest.TestCase):
 def test_finite_two_worker_witness(self):
  for seed in (2,7):
   p=crew.parse(cases.cycle_case(groups=8,q=12,seed=seed))
   red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
   diag={}
   a=crew._bounded_dual_crew_portfolio(p,5,reduction=red,telemetry=diag)
   self.assertTrue(truth.independent_cover_truth(p,a))
   self.assertEqual(diag.get("dual_portfolio"),"VERIFIED")
 def test_conflict_never_proves_feasible(self):
  raw=cases.cycle_case(groups=8,q=12,seed=8)
  b=raw["base_constraints"];b["D_matrix"]["rows"][0]=[0.]*raw["dimensions"]["num_cols"]
  b["lower_bounds_d1"][0]=1.;b["upper_bounds_d2"][0]=1.
  p=crew.parse(raw);red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
  v=crew._bounded_dual_crew_portfolio(p,2.5,reduction=red)
  self.assertIsNone(v)
 def test_staged_feasible_and_original_verified(self):
  for seed in (3,7):
   p=crew.parse(cases.cycle_case(groups=8,q=12,seed=seed))
   red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
   info={}
   answer,proof=crew._bounded_staged_crew_portfolio(
       p,7.0,reduction=red,telemetry=info)
   self.assertTrue(truth.independent_cover_truth(p,answer))
   if proof:self.assertEqual(info.get("staged_winner"),"mip")
 def test_default_controller_unchanged(self):
  raw=cases.cycle_case(groups=3,q=5,seed=13)
  a=crew.solve(raw,9)
  self.assertTrue(truth.independent_cover_truth(crew.parse(raw),a["selected_rotations"]))
if __name__=="__main__":unittest.main()
