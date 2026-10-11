"""Five-dimension Crew parity method and *oracle inversion* faults.

The falsifier is independently implemented from crew.verify. All fixtures
are generated and result methods never receive the hidden planted witness.
"""
import importlib.util
import itertools
import math
import random
import time
import unittest
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
crew=load("crew_gf2",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixture=load("crew_gf2_case",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")

def independent_cover_truth(p,selected):
    if selected is None or len(selected)!=len(set(selected)):
        return False
    if any(not 0<=j<p[1] for j in selected):
        return False
    counts=[0]*p[0]
    for j in selected:
        for r in p[3][j]:counts[r]+=1
    if counts!=[1]*p[0]:
        return False
    for k,row in enumerate(p[5]):
        total=math.fsum(row[j] for j in selected)
        if total<p[6][k]-1e-6*max(1,abs(p[6][k])):
            return False
        if total>p[7][k]+1e-6*max(1,abs(p[7][k])):
            return False
    return True

class ParityInversion(unittest.TestCase):
    def test_gf2_projection_matches_complete_binary_oracle(self):
        rng=random.Random(43)
        for trial in range(120):
            n=2+(trial%6)
            q=1+(trial%10)
            matrix=np.asarray([[rng.randint(-7,7) for z in range(n)]
                               for _ in range(q)],dtype=float)
            target=np.asarray([rng.randint(-30,30) for _ in range(q)],
                              dtype=float)
            atoms=crew.independent_parity_atoms(matrix,target,target)
            self.assertLessEqual(len(atoms),min(q,n))
            for bits in itertools.product((0,1),repeat=n):
                exact=all((sum(int(matrix[k,z])*bits[z]
                             for z in range(n))-int(target[k]))%2==0
                          for k in range(q))
                reduced=all(((mask&sum((1<<z) for z,b in enumerate(bits)
                                    if b)).bit_count()%2)==v
                            for mask,v in atoms)
                # Inconsistent source systems can have parity contradictions.
                # The reduction is *necessary* only: never reject a source
                # parity witness by introducing an invalid equation.
                if exact:self.assertTrue(reduced)

    def test_exact_null_and_noninteger_rows_retain_uncertainty(self):
        matrix=np.array([[2.,4.,6.],[1.000000001,0.,2.],
                         [1.,1.,1.]],dtype=float)
        atoms=crew.independent_parity_atoms(
            matrix,np.array([0.,1.,3.]),np.array([0.,1.,4.]))
        self.assertEqual(atoms,[])

    def test_tester_itself_rejects_mutated_invalid_witness(self):
        p=crew.parse(fixture.cycle_case(groups=3,q=6,seed=31))
        result=crew.coupled_cycle_choice_milp(p,time.monotonic()+3,
              prefer_cp_feasibility=True,cp_parity=True)
        self.assertTrue(independent_cover_truth(p,result))
        self.assertTrue(crew.verify(p,result))
        mutant=result[:-1]
        self.assertFalse(independent_cover_truth(p,mutant))
        self.assertFalse(crew.verify(p,mutant))
        # Mutating original bound must invalidate once-valid answer.
        broken=fixture.cycle_case(groups=3,q=6,seed=31)
        bc=broken["base_constraints"]
        bc["D_matrix"]["rows"][0]=[0.]*broken["dimensions"]["num_cols"]
        bc["lower_bounds_d1"][0]=1.
        bc["upper_bounds_d2"][0]=1.
        q=crew.parse(broken)
        self.assertFalse(independent_cover_truth(q,result))
        got=crew.coupled_cycle_choice_milp(q,time.monotonic()+2,
              prefer_cp_feasibility=True,cp_parity=True)
        self.assertIsNone(got)

    def test_30_metamerphic_reordering_signs_and_side_scaling(self):
        for seed in range(30):
            with self.subTest(seed=seed):
                raw=fixture.cycle_case(groups=2,q=5,seed=seed,
                                       empty=bool(seed%2))
                rng=random.Random(seed+999)
                order=list(range(raw["dimensions"]["num_cols"]))
                rng.shuffle(order)
                raw["cost_vector"]=[raw["cost_vector"][j] for j in order]
                raw["constraint_matrix_A"]["columns"]=[
                    raw["constraint_matrix_A"]["columns"][j] for j in order]
                base=raw["base_constraints"]
                base["D_matrix"]["rows"]=[
                    [r[j] for j in order] for r in base["D_matrix"]["rows"]]
                if seed%3==0:
                    base["D_matrix"]["rows"]=[
                        [-x for x in r] for r in base["D_matrix"]["rows"]]
                    lo=base["lower_bounds_d1"];hi=base["upper_bounds_d2"]
                    base["lower_bounds_d1"]=[-v for v in hi]
                    base["upper_bounds_d2"]=[-v for v in lo]
                p=crew.parse(raw)
                ref=fixture.original_bruteforce(p)
                answer,proof=crew.coupled_cycle_choice_milp(
                   p,time.monotonic()+2,prefer_cp_feasibility=True,
                   cp_parity=True,return_certificate=True)
                self.assertTrue(independent_cover_truth(p,answer))
                self.assertFalse(proof)
                self.assertGreaterEqual(crew.objective(p,answer),ref-1e-8)

if __name__=="__main__":unittest.main()
