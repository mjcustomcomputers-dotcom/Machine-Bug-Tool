"""MPC controlled forward/reverse Crew tests against original feasibility and objective.

All fixtures are generated. The 15k-row test is a public-shape stress
scenario, not any organizer private instance or inferred confidential data.
"""
import importlib.util
import subprocess
import sys
import tempfile
import json
import math
import random
import time
import unittest
from pathlib import Path

P=Path(__file__).resolve().parents[1]/'solvers'/'hoffman1993'/'solve.py'
spec=importlib.util.spec_from_file_location('crew_new',P)
crew=importlib.util.module_from_spec(spec)
spec.loader.exec_module(crew)


def quota_case(target=150,m=300):
    assert m%2==0
    cols=[[i] for i in range(m)]+[[2*i,2*i+1] for i in range(m//2)]
    n=len(cols)
    return {'dimensions':{'num_rows':m,'num_cols':n},
            'cost_vector':[1.]*m+[4.]*(m//2),
            'constraint_matrix_A':{'columns':cols},
            'has_base_constraints':True,
            'base_constraints':{'D_matrix':{'rows':[[0.]*m+[1.]*(m//2)]},
                'lower_bounds_d1':[float(target)],
                'upper_bounds_d2':[float(target)]}}


def large_case(m=15000,n=15000,q=100,seed=3):
    r=random.Random(seed)
    cols=[[2*i,2*i+1] for i in range(m//2)]
    while len(cols)<n:
        cols.append(sorted(r.sample(range(m),r.randint(1,4))))
    costs=[float(r.randint(2,30)) for _ in cols]
    effects=[];lo=[];hi=[]
    for k in range(q):
        row=[float(int(r.random()<0.01)) for _ in cols]
        effects.append(row)
        val=sum(row[j] for j in range(m//2))
        lo.append(max(0.,val-10.))
        hi.append(val+10.)
    return {'dimensions':{'num_rows':m,'num_cols':len(cols)},
            'cost_vector':costs,
            'constraint_matrix_A':{'columns':cols},
            'has_base_constraints':bool(q),
            'base_constraints':{'D_matrix':{'rows':effects},
                 'lower_bounds_d1':lo,'upper_bounds_d2':hi}}


def run_cli(data,seconds):
    """A sterile interpreter matches FrontierOR's per-problem process boundary."""
    with tempfile.TemporaryDirectory(prefix="frontieror-crew-") as td:
        root=Path(td)
        inp=root/"instance.json"
        out=root/"solution.json"
        inp.write_text(json.dumps(data,separators=(",",":")),encoding="utf-8")
        result=subprocess.run([sys.executable,str(P),"--problem","hoffman1993",
                              "--instance",str(inp),"--output",str(out),
                              "--time-limit",str(seconds)],
                              stdin=subprocess.DEVNULL,capture_output=True,text=True,
                              timeout=seconds+4,check=False)
        if result.returncode:
            raise AssertionError(f"Crew CLI failed: exit={result.returncode}: {result.stderr[-1300:]}")
        return json.loads(out.read_text(encoding="utf-8"))


class CrewReverseTests(unittest.TestCase):
    def test_reverse_side_envelope_recovers_tight_quota(self):
        p=crew.parse(quota_case())
        t=time.monotonic()
        solution=crew.large_sparse_cover(p,t+1.0,reverse_bounds=True)
        self.assertTrue(crew.verify(p,solution))
        self.assertEqual(crew.objective(p,solution),600.0)
        self.assertEqual(len(solution),150)

    def test_one_control_on_off_comparator(self):
        p=crew.parse(quota_case(75))
        before=crew.large_sparse_cover(p,time.monotonic()+0.22,
                                       reverse_bounds=False)
        after=crew.large_sparse_cover(p,time.monotonic()+0.8,
                                      reverse_bounds=True)
        self.assertTrue(crew.verify(p,after))
        self.assertEqual(crew.objective(p,after),450.0)
        if crew.verify(p,before):
            self.assertLessEqual(crew.objective(p,after),crew.objective(p,before)+1e-8)

    def test_proven_milp_exits_without_later_solver_phases(self):
        # Avoid native library import/fork-order artifacts in a shared unittest
        # interpreter; test the full controller in a clean Python child.
        runner=r"""
import importlib.util,json,sys
spec=importlib.util.spec_from_file_location("crew_stress_child",sys.argv[1])
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
seen=[];old=mod._bounded_native
def record(*args,**kwargs):
    seen.append(args[1]);return old(*args,**kwargs)
mod._bounded_native=record
answer=mod.solve(json.load(sys.stdin),18)
print(json.dumps({"value":answer["objective_value"],"methods":seen}))
"""
        result=subprocess.run([sys.executable,"-c",runner,str(P)],
                              input=json.dumps(quota_case()),
                              capture_output=True,text=True,timeout=22)
        self.assertEqual(result.returncode,0,result.stderr[-1200:])
        receipt=json.loads(result.stdout)
        self.assertEqual(receipt["value"],600.0)
        self.assertIn("mip",receipt["methods"])
        self.assertNotIn("stream",receipt["methods"])
        self.assertNotIn("cp_feasible",receipt["methods"])
        self.assertNotIn("cp_objective",receipt["methods"])

    def test_duplicate_flight_rotation_cannot_dominate_valid_column(self):
        p=crew.parse({'dimensions':{'num_rows':1,'num_cols':2},
                      'cost_vector':[-100.,1.],
                      'constraint_matrix_A':{'columns':[[0,0],[0]]},
                      'has_base_constraints':False})
        eliminated=crew.dominated_rotations(p)
        self.assertIn(0,eliminated)
        self.assertNotIn(1,eliminated)
        red=crew.reduce_forced_rotations(p,eliminated)
        self.assertEqual(red[0],[1])
        self.assertTrue(crew.verify(p,red[0]))

    def test_negative_cost_empty_column_not_discarded_at_completion(self):
        data={'dimensions':{'num_rows':1,'num_cols':2},
              'cost_vector':[2.,-3.],
              'constraint_matrix_A':{'columns':[[0],[]]},
              'has_base_constraints':False}
        got=run_cli(data,8)
        self.assertEqual(got['selected_rotations'],[0,1])
        self.assertEqual(got['objective_value'],-1.0)

    def test_large_original_small_residual_shape(self):
        data=large_case()
        p=crew.parse(data)
        reduced=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertIsNotNone(reduced)
        forced,uncovered,active=reduced
        self.assertGreater(len(forced),7000)
        self.assertLess(len(uncovered),600)
        self.assertLess(len(active),750)
        t=time.monotonic()
        result=run_cli(data,14)
        self.assertLess(time.monotonic()-t,10.0)
        self.assertTrue(crew.verify(p,result['selected_rotations']))
        self.assertAlmostEqual(crew.objective(p,result['selected_rotations']),
                               result['objective_value'],places=5)

if __name__=='__main__':
    unittest.main(verbosity=2)
