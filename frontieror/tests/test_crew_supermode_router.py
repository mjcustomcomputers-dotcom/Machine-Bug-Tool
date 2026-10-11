"""JOHNNY 5 Supermode: rank/density routing, tolerance and test inversion."""
import importlib.util, math, random, time, unittest
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
def get(n,p):
    sp=importlib.util.spec_from_file_location(n,p)
    m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m);return m
crew=get("supermode_crew",ROOT/"solvers"/"hoffman1993"/"solve.py")
fixture=get("supermode_cases",ROOT/"tests"/"test_crew_coupled_cycle_rescue.py")
truth=get("supermode_oracle",ROOT/"tests"/"test_crew_five_level_parity.py")

class SupermodeRankDensity(unittest.TestCase):
    def test_tolerance_mutation_falsifies_unsafe_xor(self):
        matrix=np.array([[1.,1.],[1.,1.]],dtype=float)
        lhs=np.array([1000000.,1.])
        rhs=lhs.copy()
        # The first purported equality actually admits 999999,1000000,
        # 1000001 under the source's 1e-6 magnitude tolerance.
        safe=crew.independent_parity_atoms(
            matrix,lhs,rhs,source_tolerance=[1.000001,1e-6])
        only_safe=crew.independent_parity_atoms(
            matrix,np.array([1.]),np.array([1.]),
            source_tolerance=[1e-6]) if False else None
        self.assertEqual(len(safe),1)
        self.assertEqual(safe[0][1],1)
        self.assertEqual(crew.independent_parity_atoms(
            np.array([[1.]]),np.array([1e7]),np.array([1e7]),
            source_tolerance=[10.]),[])
        self.assertEqual(crew.independent_parity_atoms(
            np.array([[1.]]),np.array([float("inf")]),
            np.array([float("inf")]),source_tolerance=[0.]),[])

    def test_2_by_2_rank_density_matrix(self):
        rng=random.Random(248)
        n=16;q=20
        cases={}
        for high_rank in (False,True):
            for dense in (False,True):
                rows=[]
                for k in range(q):
                    row=[0]*n
                    if high_rank:
                        row[k%n]=1
                    else:
                        row[0]=1
                    if dense:
                        # Many even coefficients raise density without
                        # changing the parity rank.
                        row=[int(v+2*rng.randint(1,4))
                             for v in row]
                    rows.append(row)
                A=np.asarray(rows,dtype=float)
                lhs=np.zeros(q,dtype=float)
                p=crew.parity_rank_density_profile(
                    A,lhs,lhs,[0.00001]*q)
                cases[(high_rank,dense)]=p
                self.assertGreater(p["rank"],0)
                self.assertEqual(p["use_parity"],
                    high_rank and dense)
        self.assertGreater(cases[(True,True)]["rank"],
                           cases[(False,True)]["rank"])
        self.assertGreater(cases[(False,True)]["density"],
                           cases[(False,False)]["density"])

    def test_matched_rank_fraction_classifiers(self):
        # High-density 10-dimensional side parity in 61 choices is worth a
        # trial; the same rank in 121 choices carries less propagation power.
        def profile(n,q,rank):
            matrix=np.zeros((q,n),dtype=float)
            for row in range(q):
                matrix[row,:]=2.
                matrix[row,row%rank]+=1.
            return crew.parity_rank_density_profile(
                matrix,np.zeros(q),np.zeros(q),[1e-6]*q)
        favorable=profile(61,20,10)
        unfavorable=profile(121,25,12)
        self.assertEqual(favorable["rank"],10)
        self.assertTrue(favorable["use_parity"])
        self.assertEqual(unfavorable["rank"],12)
        self.assertFalse(unfavorable["use_parity"])

    def test_original_verifier_is_distinct_from_route_classifier(self):
        d=fixture.cycle_case(groups=3,q=6,seed=43,empty=True)
        p=crew.parse(d)
        ans,cert=crew.coupled_cycle_choice_milp(
            p,time.monotonic()+3,prefer_cp_feasibility=True,
            cp_parity="auto",return_certificate=True)
        self.assertTrue(truth.independent_cover_truth(p,ans))
        self.assertFalse(cert)
        broken=next(j for j in ans if p[3][j])
        mutant=[j for j in ans if j!=broken]
        self.assertFalse(truth.independent_cover_truth(p,mutant))
        self.assertFalse(crew.verify(p,mutant))

    def test_source_order_sign_metamorphs_auto_30_seeds(self):
        for seed in range(30):
            with self.subTest(seed=seed):
                d=fixture.cycle_case(groups=2,q=6,seed=seed,
                   empty=bool(seed%2))
                rng=random.Random(seed+31415)
                perm=list(range(d["dimensions"]["num_cols"]))
                rng.shuffle(perm)
                d["cost_vector"]=[d["cost_vector"][j] for j in perm]
                d["constraint_matrix_A"]["columns"]=[
                    d["constraint_matrix_A"]["columns"][j] for j in perm]
                bc=d["base_constraints"]
                bc["D_matrix"]["rows"]=[
                    [row[j] for j in perm] for row in bc["D_matrix"]["rows"]]
                if seed%3==0:
                    bc["D_matrix"]["rows"]=[
                        [-v for v in row] for row in bc["D_matrix"]["rows"]]
                    lo=bc["lower_bounds_d1"][:]
                    hi=bc["upper_bounds_d2"][:]
                    bc["lower_bounds_d1"]=[-v for v in hi]
                    bc["upper_bounds_d2"]=[-v for v in lo]
                p=crew.parse(d)
                candidate=crew.coupled_cycle_choice_milp(
                   p,time.monotonic()+2,prefer_cp_feasibility=True,
                   cp_parity="auto")
                self.assertTrue(truth.independent_cover_truth(p,candidate))

if __name__=="__main__":unittest.main()
