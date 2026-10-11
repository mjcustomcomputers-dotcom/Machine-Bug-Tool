"""Exact MPC-inspired residual component factorization with original-cost oracle."""
import importlib.util
import itertools
import math
import time
import unittest
from pathlib import Path

PATH=Path(__file__).resolve().parents[1]/"solvers"/"hoffman1993"/"solve.py"
spec=importlib.util.spec_from_file_location("crew_components",PATH)
crew=importlib.util.module_from_spec(spec)
spec.loader.exec_module(crew)

def pair_groups(groups=40,side_count=0,linked=False,empty_cost=-1.):
    m=2*groups
    columns=[[r] for r in range(m)]+[[2*i,2*i+1] for i in range(groups)]+[[]]
    costs=[8.]*m+[3.]*groups+[empty_cost]
    n=len(columns)
    data={"dimensions":{"num_rows":m,"num_cols":n},
      "cost_vector":costs,"constraint_matrix_A":{"columns":columns},
      "has_base_constraints":side_count>0}
    if side_count:
        side=[]
        low=[];high=[]
        for k in range(side_count):
            row=[float(((11*j+7*k)%9)-4)/10 for j in range(n)]
            if linked and k==0:
                row=[0.]*n
                row[m]=1.
                row[m+1]=1.
                low.append(1.)
                high.append(1.)
            else:
                low.append(-10000.)
                high.append(10000.)
            side.append(row)
        data["base_constraints"]={
          "D_matrix":{"rows":side},
          "lower_bounds_d1":low,"upper_bounds_d2":high}
    return data

class CrewExactComponents(unittest.TestCase):
    def test_many_independent_groups_with_hundred_proven_loose_side_rows(self):
        p=crew.parse(pair_groups(600,100))
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(len(crew.redundant_side_rows(p,red)),100)
        start=time.monotonic()
        answer,proven=crew.exact_residual_components(p,start+5,red)
        self.assertTrue(proven)
        self.assertTrue(crew.verify(p,answer))
        self.assertEqual(crew.objective(p,answer),1799.)
        self.assertLess(time.monotonic()-start,5.)

    def test_nonredundant_cross_group_constraint_forces_full_fallback(self):
        p=crew.parse(pair_groups(20,1,linked=True))
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        candidate,proven=crew.exact_residual_components(p,time.monotonic()+3,red)
        self.assertIsNone(candidate)
        self.assertFalse(proven)
        full=crew.sparse_milp(p,time.monotonic()+4,reduction=red)
        self.assertTrue(crew.verify(p,full))
        self.assertEqual(crew.objective(p,full),166.)

    def test_signed_costs_and_irregular_cover_match_bruteforce(self):
        cols=[[0],[1],[2],[3],[0,1],[1,2],[2,3],[0,2],[1,3]]
        cols += [[4],[5],[4,5],[]]
        costs=[7.,5.,3.,8.,2.,1.,4.,-2.,-1.,6.,2.,3.,-5.]
        p=crew.parse({"dimensions":{"num_rows":6,"num_cols":len(cols)},
             "cost_vector":costs,
             "constraint_matrix_A":{"columns":cols},
             "has_base_constraints":False})
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        answer,proven=crew.exact_residual_components(p,time.monotonic()+4,red)
        # No forced rows, but too few active columns to trigger the shortcut
        # may return UNKNOWN. The original fallback still must be exact.
        if answer is None:
            answer=crew.sparse_milp(p,time.monotonic()+4,reduction=red)
        self.assertTrue(crew.verify(p,answer))
        brute=min(crew.objective(p,[i for i,b in enumerate(bits) if b])
          for bits in itertools.product((0,1),repeat=p[1])
          if crew.verify(p,[i for i,b in enumerate(bits) if b]))
        self.assertAlmostEqual(crew.objective(p,answer),brute)
        if proven:self.assertAlmostEqual(crew.objective(p,answer),brute)

    def test_original_solve_dispatches_component_optimality_without_mip(self):
        p=pair_groups(120,60)
        result=crew.solve(p,10)
        self.assertEqual(result["objective_value"],359.)
        self.assertTrue(crew.verify(crew.parse(p),result["selected_rotations"]))

if __name__=="__main__":
    unittest.main()
