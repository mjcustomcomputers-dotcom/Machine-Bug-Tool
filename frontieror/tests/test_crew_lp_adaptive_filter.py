"""Inverted oracle for adaptive LP pulse reconstruction: verify the filter itself."""
import importlib.util,time,unittest,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def load(name,p):
    sp=importlib.util.spec_from_file_location(name,p)
    mod=importlib.util.module_from_spec(sp);sp.loader.exec_module(mod);return mod
crew=load("pulse_adaptive_crew",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixture=load("pulse_adaptive_fixture",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
oracle=load("pulse_adaptive_checker",ROOT/"tests"/"test_crew_five_level_parity.py")

class PulseFilter(unittest.TestCase):
    def test_echo_filter_positive_and_inverted_mutation(self):
        source=[{"status":0,"fractional_mass":5.7,"rounded_violation":76.0},
                {"status":0,"fractional_mass":5.2,"rounded_violation":98.0}]
        self.assertTrue(crew.filter_reconstructed_lp_echo(source,61,20))
        self.assertFalse(crew.filter_reconstructed_lp_echo(source,121,25))
        self.assertFalse(crew.filter_reconstructed_lp_echo(source,61,0))
        self.assertFalse(crew.filter_reconstructed_lp_echo(source[:1],61,20))
        for key,value in [("status",2),("fractional_mass",2.),
                          ("rounded_violation",0.)]:
            bad=[dict(x) for x in source]
            bad[0][key]=value
            self.assertFalse(crew.filter_reconstructed_lp_echo(bad,61,20)
                             if key!="rounded_violation" else
                             crew.filter_reconstructed_lp_echo(bad,61,20))

    def test_nonfinite_and_invalid_echo_do_not_create_hint(self):
        s=[{"status":0,"fractional_mass":math.nan,"rounded_violation":90.},
           {"status":0,"fractional_mass":6.,"rounded_violation":90.}]
        self.assertFalse(crew.filter_reconstructed_lp_echo(s,61,20))
        self.assertFalse(crew.filter_reconstructed_lp_echo([],61,20))

    def test_original_truth_and_mutant_on_real_source(self):
        data=fixture.cycle_case(groups=3,q=6,seed=19,empty=True)
        p=crew.parse(data)
        observation={}
        ans=crew.coupled_cycle_choice_milp(
            p,time.monotonic()+3,prefer_cp_feasibility=True,
            lp_pulse="adaptive",telemetry=observation)
        self.assertTrue(oracle.independent_cover_truth(p,ans))
        broken=next(j for j in ans if p[3][j])
        self.assertFalse(oracle.independent_cover_truth(
            p,[j for j in ans if j!=broken]))
        self.assertIn("lp_adaptive_hint_selected",observation)

if __name__=="__main__":unittest.main()
