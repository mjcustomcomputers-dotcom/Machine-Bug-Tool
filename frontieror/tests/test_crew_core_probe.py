"""Generated exact-cover test for bounded assumption relaxation."""
import importlib.util,time,unittest
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def use(n,p):
    s=importlib.util.spec_from_file_location(n,p)
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
crew=use("core_s",R/"solvers"/"hoffman1993"/"solve.py")
cases=use("core_f",R/"tests"/"test_crew_coupled_cycle_rescue.py")
truth=use("core_o",R/"tests"/"test_crew_five_level_parity.py")
class Probe(unittest.TestCase):
    def test_boolean_assumption_relaxation(self):
        from ortools.sat.python import cp_model
        model=cp_model.CpModel()
        x=[model.new_bool_var("v"+str(k)) for k in range(16)]
        model.add(x[14]+x[15]==1)
        info={}
        selected=crew.unsat_core_cycle_pulse(
            model,[0.]*16,time.monotonic()+4,cp_model,info)
        self.assertIsNotNone(selected)
        self.assertEqual(selected[14]+selected[15],1)
        self.assertTrue(any(v.get("core_size",0)>0 for v in info["core_pulses"]))
    def test_original_witness(self):
        for seed in range(6):
            p=crew.parse(cases.cycle_case(groups=8,q=12,seed=seed))
            result=crew.coupled_cycle_choice_milp(
                p,time.monotonic()+3,prefer_cp_feasibility=True,lp_core=True)
            self.assertTrue(truth.independent_cover_truth(p,result))
    def test_inconsistent_source(self):
        d=cases.cycle_case(groups=8,q=12,seed=8)
        b=d["base_constraints"]
        b["D_matrix"]["rows"][0]=[0.]*d["dimensions"]["num_cols"]
        b["lower_bounds_d1"][0]=1.;b["upper_bounds_d2"][0]=1.
        p=crew.parse(d)
        result=crew.coupled_cycle_choice_milp(
            p,time.monotonic()+2,prefer_cp_feasibility=True,lp_core=True)
        self.assertIsNone(result)
if __name__=="__main__":unittest.main()
