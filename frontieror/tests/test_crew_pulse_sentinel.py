"""Bounded source-replay tests: observation is advisory, not a proof."""
import importlib.util, time, unittest
from pathlib import Path
R=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    return mod
crew=load("sentinel_crew",R/"solvers"/"hoffman1993"/"solve.py")
cases=load("sentinel_cases",R/"tests"/"test_crew_coupled_cycle_rescue.py")
truth=load("sentinel_truth",R/"tests"/"test_crew_five_level_parity.py")
class Sentinel(unittest.TestCase):
    def test_assumption_core_is_advisory(self):
        from ortools.sat.python import cp_model
        model=cp_model.CpModel()
        x=[model.new_bool_var("x"+str(i)) for i in range(16)]
        model.add(x[14]+x[15]==1)
        telemetry={}
        bits=crew.unsat_core_cycle_pulse(model,[0.]*16,
            time.monotonic()+4,cp_model,telemetry,
            max_probes=2,time_fraction=0.6,probe_seconds=0.3,
            stop_core_fraction=0.45)
        # A broad core can cause an early exit. Either way, its failure
        # must never be interpreted as original infeasibility.
        self.assertTrue(bits is None or bits[14]+bits[15]==1)
        self.assertIn("core_witness",telemetry)
        self.assertLessEqual(len(telemetry["core_pulses"]),2)
    def test_synthetic_original_witness(self):
        for seed in range(8):
            p=crew.parse(cases.cycle_case(groups=8,q=12,seed=seed))
            out=crew.coupled_cycle_choice_milp(
                p,time.monotonic()+3,prefer_cp_feasibility=True,
                lp_core="sentinel")
            self.assertTrue(truth.independent_cover_truth(p,out))
    def test_corrupt_source_is_not_rescued(self):
        raw=cases.cycle_case(groups=8,q=12,seed=13)
        b=raw["base_constraints"]
        b["D_matrix"]["rows"][0]=[0.]*raw["dimensions"]["num_cols"]
        b["lower_bounds_d1"][0]=1.;b["upper_bounds_d2"][0]=1.
        p=crew.parse(raw)
        result,certificate=crew.coupled_cycle_choice_milp(
            p,time.monotonic()+3,prefer_cp_feasibility=True,
            lp_core="sentinel",return_certificate=True)
        self.assertIsNone(result)
        self.assertFalse(certificate)
if __name__=="__main__":unittest.main()
