"""Synthetic contract tests for FrontierOR fischetti1998 using independent scorer."""
import importlib.util
import itertools
import pathlib
import random
import time
import sys
import unittest

PATH=pathlib.Path(__file__).resolve().parents[1]/'solvers'/'fischetti1998'/'solve.py'
spec=importlib.util.spec_from_file_location('frontieror_op',PATH)
op=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=op
spec.loader.exec_module(op)


def fixture(n,seed):
    r=random.Random(seed)
    pts=[(r.randrange(0,45),r.randrange(0,45)) for _ in range(n)]
    scores={str(i+1): 0 if i==0 else r.randrange(5,60) for i in range(n)}
    dist={f'({i+1},{j+1})':round(((pts[i][0]-pts[j][0])**2+
                                 (pts[i][1]-pts[j][1])**2)**0.5)
          for i in range(n) for j in range(i+1,n)}
    return {'n':n,'depot':1,'t0':125,'prizes':scores,'travel_times':dist}


def independent_check(data,out):
    assert set(out)=={'objective_value','visited_nodes','edges','tour'}
    tour=out['tour']
    assert tour[0]==tour[-1]==data['depot']
    assert len(tour)>=4 and len(set(tour[:-1]))==len(tour)-1
    assert out['visited_nodes']==tour[:-1]
    assert out['edges']==[[i,j] for i,j in zip(tour,tour[1:])]
    t=lambda i,j: data['travel_times'][f'({min(i,j)},{max(i,j)})']
    cost=sum(t(i,j) for i,j in zip(tour,tour[1:]))
    assert cost<=data['t0']+1e-6
    prize=sum(data['prizes'][str(i)] for i in tour[1:-1])
    assert out['objective_value']==prize


class OrienteeringMethodsTests(unittest.TestCase):
    def test_exact_small_matches_exhaustive(self):
        for n,seed in ((5,7),(7,12),(9,99)):
            with self.subTest(n=n):
                data=fixture(n,seed)
                p=op.parse_problem(data)
                exact,proved=op.exact_dp(p,time.monotonic()+5)
                self.assertTrue(proved)
                independent_check(data,op.build_solution(p,exact))
                best=-1
                cities=[i for i in range(2,n+1)]
                for k in range(2,n):
                    for seq in itertools.permutations(cities,k):
                        tour=[1,*seq,1]
                        if p.cost(tour)<=p.limit:
                            best=max(best,p.prize(tour))
                self.assertEqual(p.prize(exact),best)

    def test_portfolio_strictly_dominates_greedy(self):
        for n,seed in ((9,4),(13,17),(24,54)):
            with self.subTest(n=n):
                data=fixture(n,seed)
                quick=op.greedy(op.parse_problem(data),'greedy_ratio',time.monotonic()+0.2)
                result=op.solve(data,8)
                independent_check(data,result)
                self.assertGreaterEqual(result['objective_value'],
                                        op.parse_problem(data).prize(quick))

    def test_actual_cp_sat_branch(self):
        from ortools.sat.python import cp_model
        self.assertTrue(cp_model)
        data=fixture(12,517)
        p=op.parse_problem(data)
        tour,proof=op.cp_sat_circuit(p,time.monotonic()+6)
        independent_check(data,op.build_solution(p,tour))


if __name__=='__main__':unittest.main()
