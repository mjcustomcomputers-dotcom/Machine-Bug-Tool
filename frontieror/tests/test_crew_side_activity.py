"""Side-activity certificate tests for Crew MILP projection.

Check the original 0/1 model and objective, not merely that a solver exited.
"""
import importlib.util
import itertools
import time
import unittest
from pathlib import Path

P=Path(__file__).resolve().parents[1]/"solvers"/"hoffman1993"/"solve.py"
spec=importlib.util.spec_from_file_location("crew_side_activity",P)
crew=importlib.util.module_from_spec(spec)
spec.loader.exec_module(crew)


def fixture(q=100,tight_at=None):
    m=6
    cols=[[i] for i in range(m)]+[[2*i,2*i+1] for i in range(m//2)]+[[]]
    costs=[8.]*m+[3.]*(m//2)+[-2.]
    effects=[]
    lower=[]
    upper=[]
    for k in range(q):
        if k==tight_at:
            row=[0.]*m+[1.]*(m//2)+[0.]
            lower.append(1.)
            upper.append(1.)
        else:
            # Mixed signs and negative optional empty effects: very wide but
            # truly redundant side bounds after exact-cover reduction.
            row=[(float(((j+3*k)%7)-3.))/10 for j in range(len(cols))]
            lower.append(-100.)
            upper.append(100.)
        effects.append(row)
    return {
        "dimensions":{"num_rows":m,"num_cols":len(cols)},
        "cost_vector":costs,
        "constraint_matrix_A":{"columns":cols},
        "has_base_constraints":True,
        "base_constraints":{"D_matrix":{"rows":effects},
                            "lower_bounds_d1":lower,
                            "upper_bounds_d2":upper}
    }


class CrewSideActivityTests(unittest.TestCase):
    def test_hundred_loose_constraints_are_provably_redundant(self):
        p=crew.parse(fixture())
        r=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(len(crew.redundant_side_rows(p,r)),100)
        answer,proof=crew.sparse_milp(p,time.monotonic()+5,
                                     reduction=r,return_certificate=True)
        self.assertTrue(crew.verify(p,answer))
        self.assertTrue(proof)
        self.assertEqual(crew.objective(p,answer),7.)

    def test_one_tight_constraint_is_not_projected_away(self):
        data=fixture(tight_at=37)
        p=crew.parse(data)
        r=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(set(crew.redundant_side_rows(p,r)),
                         set(range(100))-{37})
        answer,proof=crew.sparse_milp(p,time.monotonic()+5,
                                     reduction=r,return_certificate=True)
        self.assertTrue(crew.verify(p,answer))
        self.assertTrue(proof)
        exact=min(crew.objective(p,[j for j,flag in enumerate(bits) if flag])
                  for bits in itertools.product((False,True),repeat=p[1])
                  if crew.verify(p,[j for j,flag in enumerate(bits) if flag]))
        self.assertAlmostEqual(crew.objective(p,answer),exact)

    def test_zero_side_rows_are_removed_at_equal_zero(self):
        data=fixture(q=4)
        for k in range(4):
            data["base_constraints"]["D_matrix"]["rows"][k]=[0.]*10
            data["base_constraints"]["lower_bounds_d1"][k]=0.
            data["base_constraints"]["upper_bounds_d2"][k]=0.
        p=crew.parse(data)
        r=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.redundant_side_rows(p,r),[0,1,2,3])

    def test_negative_empty_column_and_strict_side_guard(self):
        data=fixture(q=2,tight_at=1)
        p=crew.parse(data)
        r=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.redundant_side_rows(p,r),[0])
        got=crew.sparse_milp(p,time.monotonic()+5,reduction=r)
        self.assertTrue(crew.verify(p,got))
        self.assertIn(9,got)  # negative-cost optional empty rotation


if __name__=="__main__":
    unittest.main()
