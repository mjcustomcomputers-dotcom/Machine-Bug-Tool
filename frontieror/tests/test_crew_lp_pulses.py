"""JOHNNY 5 — inverse-pulse reconstruction and source-isolated controls.

ELF/infrared/sonar analogies are design motifs only: actual signals here
are LP/CP numerical witnesses; no physical sensor or media processing.
"""
import importlib.util, math, random, time, unittest
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
crew=load("pulse_recon_crew",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixture=load("pulse_recon_fixtures",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
oracle=load("pulse_recon_oracle",ROOT/"tests"/"test_crew_five_level_parity.py")

class InversePulseMethods(unittest.TestCase):
    def test_identity_relaxation_reconstructs_known_binary_target(self):
        m=np.eye(5,dtype=float)
        b=np.asarray([1.,0.,1.,1.,0.])
        receipt={}
        candidates=crew.reconstruct_cycle_lp_pulses(
            m,b,b,np.asarray([3.,-2.,1.,4.,5.]),
            time.monotonic()+3,receipt)
        self.assertTrue(candidates)
        self.assertEqual(candidates[0],[1,0,1,1,0])
        self.assertGreaterEqual(len(receipt.get("lp_pulses",[])),1)

    def test_lp_pulses_are_hints_and_do_not_override_original(self):
        rng=random.Random(88)
        for seed in range(20):
            with self.subTest(seed=seed):
                raw=fixture.cycle_case(groups=2,q=3,seed=seed,empty=True)
                p=crew.parse(raw)
                receipt={}
                candidate=crew.coupled_cycle_choice_milp(
                    p,time.monotonic()+3,prefer_cp_feasibility=True,
                    cp_parity="echo",lp_pulse=True,telemetry=receipt)
                self.assertTrue(crew.verify(p,candidate))
                self.assertTrue(oracle.independent_cover_truth(p,candidate))
                removed=next(j for j in candidate if p[3][j])
                self.assertFalse(oracle.independent_cover_truth(
                    p,[j for j in candidate if j!=removed]))

    def test_inverted_contradictory_source_rejects_pulse(self):
        raw=fixture.cycle_case(groups=3,q=5,seed=21,empty=True)
        bc=raw["base_constraints"]
        bc["D_matrix"]["rows"][0]=[0.]*raw["dimensions"]["num_cols"]
        bc["lower_bounds_d1"][0]=1.
        bc["upper_bounds_d2"][0]=1.
        p=crew.parse(raw)
        solution=crew.coupled_cycle_choice_milp(
            p,time.monotonic()+2,prefer_cp_feasibility=True,
            lp_pulse=True)
        self.assertIsNone(solution)

    def test_scaling_and_variable_permutation_does_not_change_truth(self):
        for seed in range(25):
            with self.subTest(seed=seed):
                raw=fixture.cycle_case(groups=2,q=4,seed=seed)
                rng=random.Random(seed+702)
                order=list(range(raw["dimensions"]["num_cols"]))
                rng.shuffle(order)
                raw["cost_vector"]=[raw["cost_vector"][j] for j in order]
                raw["constraint_matrix_A"]["columns"]=[
                    raw["constraint_matrix_A"]["columns"][j] for j in order]
                base=raw["base_constraints"]
                base["D_matrix"]["rows"]=[
                    [v[j] for j in order] for v in base["D_matrix"]["rows"]]
                if seed%2:
                    base["D_matrix"]["rows"]=[
                        [-z for z in r] for r in base["D_matrix"]["rows"]]
                    oldlo=base["lower_bounds_d1"][:]
                    oldhi=base["upper_bounds_d2"][:]
                    base["lower_bounds_d1"]=[-v for v in oldhi]
                    base["upper_bounds_d2"]=[-v for v in oldlo]
                p=crew.parse(raw)
                candidate=crew.coupled_cycle_choice_milp(
                    p,time.monotonic()+3,
                    prefer_cp_feasibility=True,lp_pulse=True)
                self.assertTrue(oracle.independent_cover_truth(p,candidate))
                self.assertTrue(crew.verify(p,candidate))

if __name__=="__main__":unittest.main()
