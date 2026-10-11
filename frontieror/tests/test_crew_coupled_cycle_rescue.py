"""Original-cover falsifiers for globally coupled cycle-choice rescue.

MPC cross-ref: V31 independent proof replay, V15 adaptive computation
routing, solid-state TIMEOUT/INFEASIBLE/QUALITY controlled inverse. All
fixtures GENERATED. No private organizer data, no ZIP.
"""
import importlib.util
import itertools
import math
import random
import time
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"solvers"/"hoffman1993"/"solve.py"
sp=importlib.util.spec_from_file_location("crew_coupled",SRC)
crew=importlib.util.module_from_spec(sp)
sp.loader.exec_module(crew)


def cycle_case(groups=3,q=5,seed=42,empty=True,corrupt=False):
    rng=random.Random(seed)
    cols=[];costs=[]
    for c in range(groups):
        a=4*c
        cols.extend([[a,a+1],[a+2,a+3],[a,a+3],[a+1,a+2]])
        costs.extend([float(rng.randint(-2,12)) for _ in range(4)])
    if empty:
        cols.append([]);costs.append(-2.)
    n=len(cols)
    truth=[bool((c*7+seed)%3==0) for c in range(groups)]
    # Hidden witness is feasible by construction; side effects genuinely
    # differ between alternatives and couple the cycle decisions.
    selected=[]
    for c,use_b in enumerate(truth):
        selected.extend([4*c+2,4*c+3] if use_b else [4*c,4*c+1])
    if empty:selected.append(n-1)
    side=[];low=[];high=[]
    for k in range(q):
        effects=[float(rng.randint(-3,3)) for _ in range(n)]
        if empty:effects[-1]=float(rng.randint(-2,2))
        total=sum(effects[j] for j in selected)
        side.append(effects)
        slack=0. if k%2 else 1.
        low.append(float(total-slack));high.append(float(total+slack))
    if corrupt:
        cols.append([0,2]);costs.append(-50.)
        for row in side:row.append(0.)
    return {"dimensions":{"num_rows":4*groups,"num_cols":len(cols)},
      "cost_vector":costs,"constraint_matrix_A":{"columns":cols},
      "has_base_constraints":True,
      "base_constraints":{"D_matrix":{"rows":side},
           "lower_bounds_d1":low,"upper_bounds_d2":high}}


def original_bruteforce(p):
    best=math.inf
    found=False
    for y in itertools.product((0,1),repeat=p[1]):
        chosen=[j for j,x in enumerate(y) if x]
        if crew.verify(p,chosen):
            found=True
            best=min(best,crew.objective(p,chosen))
    return best if found else None


class CoupledCycleRescue(unittest.TestCase):
    def test_random_100_metamorphs_against_bruteforce_original(self):
        for seed in range(100):
            with self.subTest(seed=seed):
                d=cycle_case(groups=1 if seed%4==0 else 2,
                    q=1+seed%4,seed=seed,empty=bool(seed%3==0))
                rng=random.Random(17*seed+3)
                if seed%5==0:
                    order=list(range(d["dimensions"]["num_cols"]))
                    rng.shuffle(order)
                    d["cost_vector"]=[d["cost_vector"][j] for j in order]
                    d["constraint_matrix_A"]["columns"]=[
                        d["constraint_matrix_A"]["columns"][j] for j in order]
                    d["base_constraints"]["D_matrix"]["rows"]=[
                        [r[j] for j in order]
                        for r in d["base_constraints"]["D_matrix"]["rows"]]
                if seed%7==0:
                    bc=d["base_constraints"]
                    bc["D_matrix"]["rows"]=[[-v for v in row]
                        for row in bc["D_matrix"]["rows"]]
                    low=bc["lower_bounds_d1"];hi=bc["upper_bounds_d2"]
                    bc["lower_bounds_d1"]=[-v for v in hi]
                    bc["upper_bounds_d2"]=[-v for v in low]
                p=crew.parse(d)
                red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
                got,cert=crew.coupled_cycle_choice_milp(
                    p,time.monotonic()+3,reduction=red,return_certificate=True)
                self.assertTrue(crew.verify(p,got))
                self.assertEqual(crew.objective(p,got),original_bruteforce(p))
                if cert:self.assertEqual(crew.objective(p,got),original_bruteforce(p))

    def test_side_coupling_actually_changes_optimal_local_choice(self):
        d=cycle_case(groups=3,q=4,seed=18,empty=True)
        p=crew.parse(d)
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        ans,proof=crew.coupled_cycle_choice_milp(
            p,time.monotonic()+4,reduction=red,return_certificate=True)
        self.assertTrue(crew.verify(p,ans))
        # All q constraints are still active; side-vector invariance shortcut
        # must reject these nonidentical cycle alternative side effects.
        self.assertEqual(crew.exact_cycle_cover(
            p,time.monotonic()+3,red),(None,False))
        self.assertEqual(crew.objective(p,ans),original_bruteforce(p))

    def test_extra_edge_degree_three_returns_unknown(self):
        d=cycle_case(groups=2,q=3,corrupt=True)
        p=crew.parse(d)
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.coupled_cycle_choice_milp(
            p,time.monotonic()+3,reduction=red,return_certificate=True),
            (None,False))

    def test_original_infeasible_bounds_refused(self):
        d=cycle_case(groups=2,q=2,seed=7)
        bc=d["base_constraints"]
        bc["D_matrix"]["rows"][0]=[0.]*d["dimensions"]["num_cols"]
        bc["lower_bounds_d1"][0]=1.;bc["upper_bounds_d2"][0]=1.
        p=crew.parse(d)
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        got,cert=crew.coupled_cycle_choice_milp(
            p,time.monotonic()+3,reduction=red,return_certificate=True)
        self.assertIsNone(got);self.assertFalse(cert)

    def test_zero_cover_rotation_with_nonzero_side_effect(self):
        d=cycle_case(groups=2,q=3,seed=31,empty=True)
        p=crew.parse(d)
        ans=crew.coupled_cycle_choice_milp(
            p,time.monotonic()+3)
        self.assertTrue(crew.verify(p,ans))
        self.assertEqual(crew.objective(p,ans),original_bruteforce(p))


if __name__=="__main__":unittest.main()
