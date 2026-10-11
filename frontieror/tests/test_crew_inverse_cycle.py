"""Exact cycle-factor adversarial inverse tests against original brute-force models."""
import importlib.util
import itertools
import random
import time
import unittest
from pathlib import Path

SRC=Path(__file__).resolve().parents[1]/"solvers"/"hoffman1993"/"solve.py"
spec=importlib.util.spec_from_file_location("crew_cycle",SRC)
crew=importlib.util.module_from_spec(spec);spec.loader.exec_module(crew)


def graph_case(blocks=2,q=3,seed=3,corruption=False,
               negative_empty=False,extra_edge=False,odd=False,near_integer=False):
    rng=random.Random(seed)
    m=4*blocks
    cols=[]
    costs=[]
    for k in range(blocks):
        a=4*k
        cols.extend([[a,a+1],[a+2,a+3],[a,a+3],[a+1,a+2]])
        costs.extend([float(rng.randint(-5,12)) for _ in range(4)])
    if extra_edge:
        cols.append([0,2])
        costs.append(-100.)
    if odd:
        # Pair-only triangle has no possible perfect matching in its own
        # three-node component; connected 4-vertex graph is now degree>2.
        cols.append([0,2])
        costs.append(-100.)
    if negative_empty:
        cols.append([])
        costs.append(-3.)
    d=[];lo=[];hi=[]
    for k in range(q):
        potential=[rng.randint(-8,8) for _ in range(m)]
        coeff=[float(sum(potential[r] for r in col)) for col in cols]
        if corruption and k==0:
            coeff[0]+=1.
        if near_integer and k==0:
            coeff[0]+=1e-8
        d.append(coeff)
        bound=float(sum(potential))
        lo.append(bound);hi.append(bound)
    return {"dimensions":{"num_rows":m,"num_cols":len(cols)},
      "cost_vector":costs,"constraint_matrix_A":{"columns":cols},
      "has_base_constraints":bool(q),
      "base_constraints":{"D_matrix":{"rows":d},
          "lower_bounds_d1":lo,"upper_bounds_d2":hi}}


def brute(p):
    possible=[]
    for bits in itertools.product((0,1),repeat=p[1]):
        selected=[i for i,v in enumerate(bits) if v]
        if crew.verify(p,selected):
            possible.append(crew.objective(p,selected))
    return min(possible) if possible else None


class CycleFactorFaults(unittest.TestCase):
    def test_tight_global_side_200_seeds_equal_bruteforce(self):
        for seed in range(200):
            with self.subTest(seed=seed):
                rng=random.Random(seed)
                p=crew.parse(graph_case(blocks=1 if seed%3 else 2,
                    q=1+(seed%4),seed=seed,negative_empty=bool(seed%5==0)))
                red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
                candidate,proof=crew.exact_cycle_cover(
                    p,time.monotonic()+3,red)
                self.assertTrue(proof)
                self.assertTrue(crew.verify(p,candidate))
                self.assertAlmostEqual(crew.objective(p,candidate),brute(p))

    def test_perturbed_edge_reverts_to_original_MILP(self):
        p=crew.parse(graph_case(corruption=True))
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        candidate,proof=crew.exact_cycle_cover(p,time.monotonic()+3,red)
        self.assertIsNone(candidate);self.assertFalse(proof)
        ans=crew.sparse_milp(p,time.monotonic()+3,reduction=red)
        self.assertTrue(crew.verify(p,ans))
        self.assertAlmostEqual(crew.objective(p,ans),brute(p))

    def test_near_integer_edge_never_misclassified(self):
        p=crew.parse(graph_case(near_integer=True))
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.exact_cycle_cover(p,time.monotonic()+3,red),
                         (None,False))

    def test_degree_three_extra_edge_not_reduced(self):
        p=crew.parse(graph_case(extra_edge=True))
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.exact_cycle_cover(p,time.monotonic()+3,red),
                         (None,False))

    def test_side_bound_infeasible_cannot_be_shortcut(self):
        data=graph_case()
        data["base_constraints"]["lower_bounds_d1"][0]+=1.
        data["base_constraints"]["upper_bounds_d2"][0]+=1.
        p=crew.parse(data)
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.exact_cycle_cover(p,time.monotonic()+3,red),
                         (None,False))

    def test_permutation_sign_inversion_120_models(self):
        for seed in range(120):
            with self.subTest(seed=seed):
                data=graph_case(blocks=2,seed=seed,negative_empty=bool(seed%3==0))
                rng=random.Random(seed+901)
                order=list(range(data["dimensions"]["num_cols"]))
                rng.shuffle(order)
                data["cost_vector"]=[data["cost_vector"][i] for i in order]
                data["constraint_matrix_A"]["columns"]=[
                    data["constraint_matrix_A"]["columns"][i] for i in order]
                base=data["base_constraints"]
                base["D_matrix"]["rows"]=[
                    [-r[i] for i in order] for r in base["D_matrix"]["rows"]]
                low=base["lower_bounds_d1"][:]
                high=base["upper_bounds_d2"][:]
                base["lower_bounds_d1"]=[-v for v in high]
                base["upper_bounds_d2"]=[-v for v in low]
                p=crew.parse(data)
                red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
                candidate,proof=crew.exact_cycle_cover(
                    p,time.monotonic()+3,red)
                self.assertTrue(proof)
                self.assertTrue(crew.verify(p,candidate))
                self.assertAlmostEqual(crew.objective(p,candidate),brute(p))

    def test_600_rows_cycle_certificate_and_full_solver(self):
        p=crew.parse(graph_case(blocks=150,q=65,seed=11))
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        selected,proof=crew.exact_cycle_cover(
            p,time.monotonic()+5,red)
        self.assertTrue(proof)
        self.assertTrue(crew.verify(p,selected))
        answer=crew.solve(graph_case(blocks=150,q=65,seed=11),12)
        self.assertTrue(crew.verify(p,answer["selected_rotations"]))
        self.assertAlmostEqual(crew.objective(p,selected),
                               answer["objective_value"])

if __name__=="__main__": unittest.main()
