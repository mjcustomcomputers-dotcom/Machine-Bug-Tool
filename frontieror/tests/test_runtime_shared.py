"""MPC shared-kernel, route-cache and residual improvement invariants."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
from test_multicommodity import solver as flow, instance as flow_fixture
from test_orienteering import op, fixture as op_fixture

ROOT=Path(__file__).resolve().parents[1]
SLUGS=("barnhart2000","bodur2017","cordeau2006",
       "fischetti1998","hoffman1993","nagy2015")

class SharedRuntimeTests(unittest.TestCase):
    def test_identical_per_folder_modules(self):
        master=(ROOT/"shared"/"runtime_core.py").read_bytes()
        for slug in SLUGS:
            self.assertEqual(master,(ROOT/"solvers"/slug/"_runtime_core.py").read_bytes())

    def test_route_cost_full_key_cache_preserves_exact_integer_cost(self):
        p=op.parse_problem(op_fixture(9,4))
        other=[x for x in p.cities if x!=p.depot]
        for route in ([p.depot,other[0],other[1],p.depot],
                      [p.depot,other[0],other[2],p.depot]):
            original=sum(p.distance(a,b) for a,b in zip(route,route[1:]))
            self.assertEqual(p.cost(route),original)
            self.assertEqual(p.cost(route),original)
        self.assertEqual(len(p._route_cost_cache),2)

    def test_residual_recovery_requires_valid_better_solution(self):
        arcs,adj,goods=flow.parse(flow_fixture([(4,20),(5,15),(3,25)],(5,10)))
        reject={c["id"]:None for c in goods}
        candidate=flow.repair_residual(arcs,adj,goods,reject,time.monotonic()+1)
        self.assertTrue(flow.verify(arcs,goods,candidate))
        self.assertLessEqual(flow._route_objective(arcs,goods,candidate),
                             flow._route_objective(arcs,goods,reject)+1e-8)

    def test_atomic_solution_and_rejected_bad_objective(self):
        path=ROOT/"shared"/"runtime_core.py"
        spec=importlib.util.spec_from_file_location("runtime_core_test",path)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/"solution.json"
            self.assertGreater(module.write_solution(target,{"objective_value":0,"x":[]}),0)
            self.assertEqual(json.loads(target.read_text())["objective_value"],0)
            with self.assertRaises(ValueError):
                module.write_solution(target,{"objective_value":float("nan")})
            self.assertEqual(json.loads(target.read_text())["objective_value"],0)

if __name__=="__main__":
    unittest.main()
