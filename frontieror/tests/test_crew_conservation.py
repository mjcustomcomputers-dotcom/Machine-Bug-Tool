"""Focused conservation-law falsifiers; native complete-model objective is oracle."""
import importlib.util
import itertools
import math
import random
import time
import unittest
from pathlib import Path

SRC=Path(__file__).resolve().parents[1]/"solvers"/"hoffman1993"/"solve.py"
spec=importlib.util.spec_from_file_location("crew_conservation",SRC)
crew=importlib.util.module_from_spec(spec)
spec.loader.exec_module(crew)


def generated(m=80,q=50,seed=10,empty=True):
    assert m%2==0
    n=m+m//2+int(empty)
    cols=[[i] for i in range(m)]+[[2*i,2*i+1] for i in range(m//2)]
    if empty:cols.append([])
    costs=[12.]*m+[3.]*(m//2)+([-3.] if empty else [])
    side=[];lo=[];hi=[]
    for k in range(q):
        prices=[float(((r*17+k*13+seed)%13)-6) for r in range(m)]
        row=prices+[prices[2*i]+prices[2*i+1] for i in range(m//2)]
        if empty:row.append(0.)
        side.append(row)
        bound=float(sum(prices))
        lo.append(bound);hi.append(bound)
    return {"dimensions":{"num_rows":m,"num_cols":n},
      "cost_vector":costs,
      "constraint_matrix_A":{"columns":cols},"has_base_constraints":True,
      "base_constraints":{"D_matrix":{"rows":side},
        "lower_bounds_d1":lo,"upper_bounds_d2":hi}}


def oracle(p):
    answers=[]
    for bits in itertools.product((0,1),repeat=p[1]):
        selected=[i for i,b in enumerate(bits) if b]
        if crew.verify(p,selected):answers.append(crew.objective(p,selected))
    return min(answers) if answers else None


class ConservationTests(unittest.TestCase):
    def test_tight_invariants_invisible_to_existing_envelope(self):
        data=generated(m=80,q=50)
        p=crew.parse(data)
        reduced=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.conserved_side_rows(p,reduced),list(range(50)))
        self.assertEqual(crew.redundant_side_rows(p,reduced),list(range(50)))
        answer,proven=crew.sparse_milp(
            p,time.monotonic()+6,reduction=reduced,return_certificate=True)
        self.assertTrue(crew.verify(p,answer))
        self.assertEqual(crew.objective(p,answer),117.)
        self.assertTrue(proven)

    def test_single_bad_pair_breaks_conservation_and_changes_optimum(self):
        data=generated(m=4,q=1,empty=False)
        data["base_constraints"]["D_matrix"]["rows"][0][4]+=1.
        p=crew.parse(data)
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.conserved_side_rows(p,red),[])
        got=crew.sparse_milp(p,time.monotonic()+4,reduction=red)
        self.assertTrue(crew.verify(p,got))
        self.assertEqual(crew.objective(p,got),oracle(p))
        self.assertEqual(crew.objective(p,got),27.)

    def test_near_integer_coefficients_never_get_certified(self):
        data=generated(m=4,q=1,empty=False)
        data["base_constraints"]["D_matrix"]["rows"][0][4]+=1e-8
        p=crew.parse(data)
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.conserved_side_rows(p,red),[])
        got=crew.sparse_milp(p,time.monotonic()+4,reduction=red)
        self.assertTrue(crew.verify(p,got))
        self.assertAlmostEqual(crew.objective(p,got),oracle(p))

    def test_100_random_metamorphs_vs_bruteforce(self):
        for seed in range(100):
            with self.subTest(seed=seed):
                rng=random.Random(seed)
                data=generated(m=4,q=3,seed=seed)
                side=data["base_constraints"]["D_matrix"]["rows"]
                if seed%3==0:
                    side[seed%3][4]+=1.
                elif seed%3==1:
                    side[seed%3][4]+=1e-8
                if seed%5==0:
                    side[0][-1]=1.
                if seed%7==0:
                    # Permute all columns consistently.
                    order=list(range(7))
                    rng.shuffle(order)
                    data["cost_vector"]=[data["cost_vector"][j] for j in order]
                    data["constraint_matrix_A"]["columns"]=[
                        data["constraint_matrix_A"]["columns"][j] for j in order]
                    data["base_constraints"]["D_matrix"]["rows"]=[
                        [row[j] for j in order] for row in side]
                p=crew.parse(data)
                ref=oracle(p)
                red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
                if red is None:continue
                certified=crew.conserved_side_rows(p,red)
                for k in certified:
                    # Exhaustively verify this claim over the enumerated
                    # covers, not only the optimizer's one chosen solution.
                    for bits in itertools.product((0,1),repeat=p[1]):
                        selected=[j for j,v in enumerate(bits) if v]
                        counts=[0]*p[0]
                        for j in selected:
                            for r in p[3][j]:counts[r]+=1
                        if counts!=[1]*p[0]:continue
                        total=sum(p[5][k][j] for j in selected)
                        self.assertEqual(total,p[6][k])
                got=crew.sparse_milp(p,time.monotonic()+2,reduction=red)
                if ref is None:self.assertIsNone(got)
                else:
                    self.assertTrue(crew.verify(p,got))
                    self.assertAlmostEqual(crew.objective(p,got),ref)

if __name__=="__main__":
    unittest.main()
