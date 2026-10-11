"""Dolphin-sonar inspired finite feedback: methods are temporary classifiers.

No bioacoustics is modeled or claimed: PULSE/RETURN means bounded CP-SAT
model trials; their echoes are typed solver statistics, not animal signals.
"""
import importlib.util
import math
import random
import time
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    return mod

crew=load("sonar_crew",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixture=load("sonar_case",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
independent=load("sonar_checker",ROOT/"tests"/"test_crew_five_level_parity.py")


class SonarMethodAsClassifier(unittest.TestCase):
    def test_guarded_echo_decisions_and_inversions(self):
        self.assertEqual(crew.sonar_echo_classify(
            {"num_branches":1000,"num_conflicts":100},
            {"num_branches":250,"num_conflicts":110},False),
            (True,"xor_probe_branches"))
        self.assertEqual(crew.sonar_echo_classify(
            {"num_branches":300,"num_conflicts":60},
            {"num_branches":1000,"num_conflicts":80},True),
            (False,"plain_probe_branches"))
        self.assertEqual(crew.sonar_echo_classify(
            {"num_branches":0,"num_conflicts":0},
            {"num_branches":5,"num_conflicts":0},True),
            (True,"insufficient_search_feedback"))
        self.assertEqual(crew.sonar_echo_classify(
            {"num_branches":float("nan")},
            {"num_branches":200},False),
            (False,"invalid_counters"))

    def test_dolphin_pulse_finite_original_verification(self):
        # Neither method knows the fixture's planted choice. The original
        # solver, separate oracle, and mutation check must agree.
        for seed in range(15):
            with self.subTest(seed=seed):
                raw=fixture.cycle_case(groups=6,q=3,seed=seed,empty=True)
                p=crew.parse(raw)
                receipt={}
                selected=crew.sonar_feedback_cycle_rescue(
                    p,time.monotonic()+3,receipt=receipt)
                self.assertTrue(independent.independent_cover_truth(p,selected))
                self.assertTrue(crew.verify(p,selected))
                self.assertIn(receipt["state"],{
                    "FEASIBLE_PULSE","NO_PULSE_WITNESS",
                    "SYMBOLIC_ECHO_ROUTE"})
                invalid=next(j for j in selected if p[3][j])
                self.assertFalse(independent.independent_cover_truth(
                    p,[j for j in selected if j!=invalid]))

    def test_small_instances_bypass_feedback_instead_of_fabricating_success(self):
        raw=fixture.cycle_case(groups=2,q=3,seed=7)
        p=crew.parse(raw)
        self.assertIsNone(crew.sonar_feedback_cycle_rescue(
            p,time.monotonic()+3))

    def test_symbolic_echo_is_a_method_and_classifier(self):
        for seed,expected in ((7,"plain"),(31,"xor"),(43,"plain")):
            with self.subTest(seed=seed):
                raw=fixture.cycle_case(groups=60,q=20,seed=seed)
                p=crew.parse(raw)
                reduced=crew.reduce_forced_rotations(
                    p,crew.dominated_rotations(p))
                obs={"structural_only":True}
                noanswer=crew.coupled_cycle_choice_milp(
                    p,time.monotonic()+2,reduction=reduced,telemetry=obs)
                self.assertIsNone(noanswer)
                self.assertEqual(obs.get("status"),
                                 "STRUCTURAL_CLASSIFIER_ONLY")
                self.assertGreater(obs.get("rank",0),0)
                actual=("xor" if obs["rank_fraction"]>=0.14 and
                        obs["pressure"]<=0.75 else "plain")
                self.assertEqual(actual,expected)
        # A middle-pressure source must retain two-search probing as an
        # admissible option rather than pretending the pressure alone proves
        # which method will win.
        p=crew.parse(fixture.cycle_case(groups=60,q=20,seed=3))
        obs={"structural_only":True}
        crew.coupled_cycle_choice_milp(
            p,time.monotonic()+2,telemetry=obs)
        self.assertGreater(obs["pressure"],0.75)
        self.assertLess(obs["pressure"],0.86)

    def test_inline_sonar_runs_one_method_with_correct_counter_label(self):
        for seed in range(12):
            with self.subTest(seed=seed):
                raw=fixture.cycle_case(groups=6,q=4,seed=seed,empty=True)
                p=crew.parse(raw)
                reading={}
                answer=crew.coupled_cycle_choice_milp(
                    p,time.monotonic()+3,
                    prefer_cp_feasibility=True,cp_parity="echo",
                    telemetry=reading)
                self.assertTrue(independent.independent_cover_truth(p,answer))
                self.assertEqual(reading.get("method"),
                                 "xor" if reading.get("parity_atoms_added",0)
                                 else "plain")
                self.assertEqual(reading.get("status"),4)
                self.assertIn("parity_atoms_added",reading)

    def test_invalid_global_side_equations_never_report_witness(self):
        raw=fixture.cycle_case(groups=6,q=3,seed=5)
        p0=crew.parse(raw)
        raw["base_constraints"]["D_matrix"]["rows"][0]=[
            0.]*raw["dimensions"]["num_cols"]
        raw["base_constraints"]["lower_bounds_d1"][0]=1.
        raw["base_constraints"]["upper_bounds_d2"][0]=1.
        p=crew.parse(raw)
        candidate=crew.sonar_feedback_cycle_rescue(
            p,time.monotonic()+2.2)
        self.assertIsNone(candidate)
        self.assertFalse(crew.verify(p,candidate))

if __name__=="__main__":unittest.main()
