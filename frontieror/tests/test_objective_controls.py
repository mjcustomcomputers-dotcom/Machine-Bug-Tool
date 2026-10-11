"""Objective-specific controls: matching reformulation, LP pricing, native MIP, prize exchanges."""
from __future__ import annotations
import itertools
import importlib.util
import math
from pathlib import Path
import sys
import time
import unittest

HERE=Path(__file__).resolve().parents[1]/"solvers"
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec)
    sys.modules[name]=module
    spec.loader.exec_module(module)
    return module

crew=load("crew_objective_source",HERE/"hoffman1993"/"solve.py")
op=load("op_objective_source",HERE/"fischetti1998"/"solve.py")


class ObjectiveControls(unittest.TestCase):
    def test_pair_only_exact_matching_without_singletons(self):
        columns=[[0,1],[2,3],[0,2],[1,3]]
        costs=[5.,6.,20.,20.]
        data={"dimensions":{"num_rows":4,"num_cols":4},
              "cost_vector":costs,
              "constraint_matrix_A":{"columns":columns},
              "has_base_constraints":False}
        p=crew.parse(data)
        answer=crew.pair_graph_incumbent(p,time.monotonic()+3)
        self.assertTrue(crew.verify(p,answer))
        self.assertAlmostEqual(crew.objective(p,answer),11.)
        independent=min(
            sum(costs[j] for j,x in enumerate(bits) if x)
            for bits in itertools.product((0,1),repeat=len(costs))
            if crew.verify(p,[j for j,x in enumerate(bits) if x]))
        self.assertAlmostEqual(independent,crew.objective(p,answer))

    def test_matching_does_not_bypass_original_base_bounds(self):
        columns=[[0,1],[2,3],[0,2],[1,3]]
        costs=[5.,6.,20.,20.]
        data={"dimensions":{"num_rows":4,"num_cols":4},
              "cost_vector":costs,
              "constraint_matrix_A":{"columns":columns},
              "has_base_constraints":True,
              "base_constraints":{"D_matrix":{"rows":[[2.,2.,1.,1.]]},
                   "lower_bounds_d1":[2.],"upper_bounds_d2":[2.]}}
        p=crew.parse(data)
        answer=crew.pair_graph_incumbent(p,time.monotonic()+3)
        self.assertTrue(answer is None or crew.verify(p,answer))

    def test_lp_priced_core_keeps_exact_cover_and_cost(self):
        m=48
        columns=[[i] for i in range(m)]+[
            [2*i,2*i+1] for i in range(m//2)]
        costs=[15.]*m+[3.]*(m//2)
        n=len(columns)
        data={"dimensions":{"num_rows":m,"num_cols":n},
              "cost_vector":costs,
              "constraint_matrix_A":{"columns":columns},
              "has_base_constraints":True,
              "base_constraints":{"D_matrix":{"rows":[[1.]*n]},
                   "lower_bounds_d1":[m/2],
                   "upper_bounds_d2":[m]}}
        p=crew.parse(data)
        answer=crew.lp_priced_integer_core(p,time.monotonic()+5.5)
        self.assertTrue(crew.verify(p,answer))
        self.assertAlmostEqual(crew.objective(p,answer),72.)

    def test_native_highspy_can_improve_verified_mip_start(self):
        # Native HiGHS must be tested in a sterile Python process. Loading
        # SciPy or OR-Tools first in the unittest runner can cause a global
        # C++ libhighs symbol collision across bundled solver extensions.
        import subprocess
        script = r"""
import highspy
import importlib.util
import sys
from pathlib import Path
from time import monotonic
src = Path(sys.argv[1])
sys.path.insert(0,str(src.parent))
spec = importlib.util.spec_from_file_location("crew_sterile",src)
solver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(solver)
data = {"dimensions":{"num_rows":4,"num_cols":6},
        "cost_vector":[20.,20.,20.,20.,3.,3.],
        "constraint_matrix_A":{"columns":[[0],[1],[2],[3],[0,1],[2,3]]},
        "has_base_constraints":True,
        "base_constraints":{"D_matrix":{"rows":[[1.]*6]},
             "lower_bounds_d1":[2.],"upper_bounds_d2":[4.]}}
p = solver.parse(data)
old = [0,1,2,3]
assert solver.verify(p,old)
answer = solver._bounded_native(p,"stream",5.5,incumbent=old)
assert solver.verify(p,answer), "Sterile HiGHS child returned no checked schedule"
assert solver.objective(p,answer) < solver.objective(p,old) - 1e-7
assert abs(solver.objective(p,answer) - 6.0) < 1e-6
print("NATIVE_HIGHSPY_STERILE_OBJECTIVE",solver.objective(p,answer))
"""
        runner = subprocess.run(
            [sys.executable, "-c", script,
             str(HERE/"hoffman1993"/"solve.py")],
            cwd=HERE/"hoffman1993",
            stdin=subprocess.DEVNULL, capture_output=True, text=True,
            timeout=15, check=False)
        self.assertEqual(runner.returncode,0,
            "Native solver failed in fresh process.\\n" +
            runner.stdout[-1500:] + runner.stderr[-3500:])

    def test_orienteering_prize_exchange_increases_reward_not_runtime(self):
        cities=[(0,0),(1,0),(2,0),(3,0),(1,1),(5,5)]
        travel={f"({i}, {j})":max(1,round(math.dist(cities[i],cities[j])))
                for i in range(len(cities)) for j in range(i+1,len(cities))}
        data={"depot":0,"n":len(cities),
              "prizes":{str(i):[0,3,3,50,7,1][i] for i in range(len(cities))},
              "travel_times":travel,"t0":8}
        p=op.parse_problem(data)
        original=[0,1,2,0]
        improved=op.best_prize_exchange(p,original,time.monotonic()+3)
        self.assertGreater(p.prize(improved),p.prize(original))
        self.assertLessEqual(p.cost(improved),p.limit)
        rearranged=op.relocate_short_blocks(p,improved,time.monotonic()+2)
        self.assertEqual(p.prize(rearranged),p.prize(improved))
        self.assertLessEqual(p.cost(rearranged),p.cost(improved))

if __name__=="__main__":
    unittest.main()
