"""Adversarial exact-side-atom simulations with brute-force original-model oracle.

These are synthesized fault lines, not official FrontierOR instances.
"""
import importlib.util
import itertools
import math
import random
import time
import unittest
from pathlib import Path

PATH=Path(__file__).resolve().parents[1]/"solvers"/"hoffman1993"/"solve.py"
spec=importlib.util.spec_from_file_location("crew_atoms",PATH)
crew=importlib.util.module_from_spec(spec)
spec.loader.exec_module(crew)


def make(seed):
    rng=random.Random(seed)
    m=rng.randint(2,5)
    columns=[[i] for i in range(m)]
    possible=[list(x) for x in itertools.combinations(range(m),2)]
    rng.shuffle(possible)
    columns+=possible[:rng.randint(1,min(3,len(possible)))]
    columns.append([])
    n=len(columns)
    costs=[float(rng.randint(-5,12)) for _ in range(n)]
    chosen=list(range(m))
    if costs[-1]<0:chosen.append(n-1)
    pattern=[float(rng.randint(-4,4)) for _ in range(n)]
    center=math.fsum(pattern[i] for i in chosen)
    width=float(rng.randint(0,6))
    low=center-width
    high=center+width
    # Identical and inverted rows with narrower and wider intervals.
    side=[pattern[:],pattern[:],[-v for v in pattern]]
    lower=[low,low+width/2,-high]
    upper=[high,high-width/2,-low]
    for _ in range(rng.randint(0,4)):
        row=[float(rng.randint(-3,3)) for _ in range(n)]
        val=math.fsum(row[i] for i in chosen)
        gap=rng.randint(0,10)
        side.append(row)
        lower.append(val-gap)
        upper.append(val+gap)
    # Force or eliminate an optional empty rotation in a subset of cases.
    if seed%7==0:
        force=[0.]*n;force[-1]=1.
        side.append(force)
        lower.append(float(n-1 in chosen))
        upper.append(float(n-1 in chosen))
    return {"dimensions":{"num_rows":m,"num_cols":n},
      "cost_vector":costs,"constraint_matrix_A":{"columns":columns},
      "has_base_constraints":True,
      "base_constraints":{"D_matrix":{"rows":side},
         "lower_bounds_d1":lower,"upper_bounds_d2":upper}}


def brute(p):
    out=[]
    for bits in itertools.product((0,1),repeat=p[1]):
        selected=[i for i,v in enumerate(bits) if v]
        if crew.verify(p,selected):
            out.append((crew.objective(p,selected),selected))
    return min(out,key=lambda x:x[0]) if out else None


class AtomicFaultLineTests(unittest.TestCase):
    def test_randomized_signed_duplicates_and_optional_negative_costs(self):
        for seed in range(80):
            with self.subTest(seed=seed):
                p=crew.parse(make(seed))
                optimum=brute(p)
                self.assertIsNotNone(optimum)
                red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
                self.assertIsNotNone(red)
                before=len(p[5])-len(crew.redundant_side_rows(p,red))
                atoms=crew.compact_side_atoms(
                    p,red,crew.redundant_side_rows(p,red))
                self.assertLessEqual(len(atoms),before)
                result=crew.sparse_milp(p,time.monotonic()+3,reduction=red,
                                       return_certificate=True)
                candidate,certified=result
                self.assertTrue(crew.verify(p,candidate))
                self.assertAlmostEqual(crew.objective(p,candidate),optimum[0])
                if certified:
                    self.assertAlmostEqual(crew.objective(p,candidate),optimum[0])

    def test_contradictory_inverted_bounds_not_silently_relaxed(self):
        p=crew.parse({"dimensions":{"num_rows":2,"num_cols":2},
          "cost_vector":[1.,2.],
          "constraint_matrix_A":{"columns":[[0],[1]]},
          "has_base_constraints":True,
          "base_constraints":{"D_matrix":{"rows":[[1.,0.],[-1.,0.]]},
            "lower_bounds_d1":[1.,0.],"upper_bounds_d2":[1.,0.]}})
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        # This is infeasible: x0 must simultaneously equal 1 and 0.
        self.assertIsNone(brute(p))
        atoms=crew.compact_side_atoms(p,red)
        self.assertGreaterEqual(len(atoms),1)
        self.assertIsNone(crew.sparse_milp(p,time.monotonic()+3,reduction=red))

    def test_strict_duplicate_intersection_can_force_costlier_solution(self):
        p=crew.parse({"dimensions":{"num_rows":2,"num_cols":3},
          "cost_vector":[3.,3.,1.],
          "constraint_matrix_A":{"columns":[[0],[1],[0,1]]},
          "has_base_constraints":True,
          "base_constraints":{"D_matrix":{"rows":[[0.,0.,1.],[0.,0.,1.],[-0.,-0.,-1.]]},
            "lower_bounds_d1":[0.,1.,-1.],"upper_bounds_d2":[1.,1.,0.]}})
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        atoms=crew.compact_side_atoms(p,red)
        self.assertEqual(len(atoms),1)
        candidate,certified=crew.sparse_milp(p,time.monotonic()+3,
            reduction=red,return_certificate=True)
        self.assertTrue(crew.verify(p,candidate))
        self.assertEqual(crew.objective(p,candidate),1.)
        self.assertTrue(certified)

    def test_unique_rows_are_never_collapsed_by_near_equality(self):
        p=crew.parse({"dimensions":{"num_rows":2,"num_cols":3},
          "cost_vector":[2.,2.,1.],
          "constraint_matrix_A":{"columns":[[0],[1],[0,1]]},
          "has_base_constraints":True,
          "base_constraints":{"D_matrix":{"rows":[[1.,0.,0.],[1.+1e-9,0.,0.],[1.,0.,0.]]},
            "lower_bounds_d1":[0.,0.,0.],"upper_bounds_d2":[2.,2.,2.]}})
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        atoms=crew.compact_side_atoms(p,red)
        self.assertEqual(len(atoms),2)

    def test_signed_cost_metamorphs_column_permutation_and_inverse_rows(self):
        for seed in range(30):
            base=make(seed+200)
            p=crew.parse(base)
            optimum=brute(p)[0]
            rng=random.Random(seed+900)
            n=p[1]
            permutation=list(range(n));rng.shuffle(permutation)
            modified=dict(base)
            modified["cost_vector"]=[base["cost_vector"][i] for i in permutation]
            modified["constraint_matrix_A"]={"columns":[
                base["constraint_matrix_A"]["columns"][i] for i in permutation]}
            bc=base["base_constraints"]
            modified["base_constraints"]={"D_matrix":{"rows":[
                [-row[i] for i in permutation] for row in bc["D_matrix"]["rows"]]},
                "lower_bounds_d1":[-v for v in bc["upper_bounds_d2"]],
                "upper_bounds_d2":[-v for v in bc["lower_bounds_d1"]]}
            q=crew.parse(modified)
            self.assertAlmostEqual(brute(q)[0],optimum)
            solved=crew.sparse_milp(q,time.monotonic()+3,
                                   return_certificate=True)
            self.assertTrue(crew.verify(q,solved[0]))
            self.assertAlmostEqual(crew.objective(q,solved[0]),optimum)

if __name__=="__main__":
    unittest.main()
