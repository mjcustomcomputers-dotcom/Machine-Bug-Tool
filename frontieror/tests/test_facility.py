"""FrontierOR SCFLP: independent recourse, capacity and expected-cost proofs."""
import importlib.util
import math
import pathlib
import random
import unittest
from unittest.mock import patch

FILE=pathlib.Path(__file__).resolve().parents[1]/"solvers"/"bodur2017"/"solve.py"
spec=importlib.util.spec_from_file_location("scflp",FILE)
solver=importlib.util.module_from_spec(spec)
spec.loader.exec_module(solver)


def fixture(f=5,c=8,s=3,seed=10):
    rng=random.Random(seed)
    facilities=[]
    for i in range(f):
        facilities.append(dict(id=i,opening_cost=float(8+i*3),
                               capacity=float(c*2/f+4),location_x=float(i),
                               location_y=float(i)))
    customers=[dict(id=j,deterministic_demand=1.5,
                    demand_std_fraction=0.1,location_x=float(j),location_y=float(j))
               for j in range(c)]
    costs=[[float(1+abs(i-j%f)*3) for j in range(c)] for i in range(f)]
    scenarios=[dict(id=k,probability=1.0/s,
                    demands=[rng.uniform(0.5,1.9) for j in range(c)])
               for k in range(s)]
    return dict(num_facilities=f,num_customers=c,num_scenarios=s,
                capacity_factor=2.,variance_level="normal",
                facilities=facilities,customers=customers,
                transportation_costs=costs,scenarios=scenarios)


def independent(raw,output):
    f,c,s=raw["num_facilities"],raw["num_customers"],raw["num_scenarios"]
    assert set(output)=={"objective_value","open_facilities","x","y"}
    opened=set(output["open_facilities"])
    assert set(output["x"])=={str(i) for i in range(f)}
    assert opened=={i for i in range(f) if output["x"][str(i)]==1}
    result=sum(raw["facilities"][i]["opening_cost"] for i in opened)
    assert set(output["y"])=={str(i) for i in range(s)}
    for k in range(s):
        matrix=output["y"][str(k)]
        assert set(matrix).issubset({str(i) for i in range(f)})
        for i in range(f):
            assert set(matrix.get(str(i), {})).issubset({str(j) for j in range(c)})
            flow=[matrix.get(str(i), {}).get(str(j), 0.0) for j in range(c)]
            assert all(x>=-1e-6 and math.isfinite(x) for x in flow)
            assert sum(flow)<=((raw["facilities"][i]["capacity"] if i in opened else 0)+1e-5)
            result+=raw["scenarios"][k]["probability"]*sum(
                flow[j]*raw["transportation_costs"][i][j] for j in range(c))
        for j in range(c):
            assert sum(matrix.get(str(i), {}).get(str(j), 0.0) for i in range(f)) >= (
                raw["scenarios"][k]["demands"][j]-1e-5)
    assert abs(output["objective_value"]-result)<1e-4


class FacilityTests(unittest.TestCase):
    def test_milp_closed_facility_better_than_all_open(self):
        raw=fixture(3,2,2,3)
        raw["facilities"][0]["capacity"]=10.
        raw["facilities"][1]["capacity"]=10.
        raw["facilities"][2]["capacity"]=10.
        raw["facilities"][0]["opening_cost"]=15.
        raw["facilities"][1]["opening_cost"]=45.
        raw["facilities"][2]["opening_cost"]=45.
        raw["transportation_costs"]=[[1.,1.],[2.,2.],[3.,3.]]
        result=solver.solve(raw,8)
        independent(raw,result)
        self.assertIn(0,result["open_facilities"])
        self.assertLess(result["objective_value"],100.)

    def test_sparse_shipments_implicit_zeros(self):
        raw=fixture(6,12,4,21)
        result=solver.solve(raw,5)
        independent(raw,result)
        total=6*12*4
        emitted=sum(len(v) for scenario in result["y"].values() for v in scenario.values())
        self.assertLess(emitted,total)
        # Roundtrip keeps the original independent objective and all physical constraints.
        import json
        independent(raw,json.loads(json.dumps(result,separators=(",",":"))))

    def test_exact_recourse_opening_search_reduces_true_objective(self):
        import time
        raw=fixture(3,2,2,7)
        for i,row in enumerate(raw["facilities"]):
            row["capacity"]=10.
            row["opening_cost"]=[12.,65.,70.][i]
        raw["transportation_costs"]=[[1.,1.],[2.,2.],[3.,3.]]
        p=solver.parse(raw)
        opened=set(range(3))
        baseline=solver.greedy_transport(p,opened)
        self.assertTrue(solver.check(p,opened,baseline))
        before=solver.objective(p,opened,baseline)
        new_open,ship=solver.improve_openings_lp(
            p,opened,baseline,time.monotonic()+5.0)
        self.assertTrue(solver.check(p,new_open,ship))
        self.assertLess(solver.objective(p,new_open,ship),before)
        self.assertEqual(new_open,{0})

    def test_closure_descent_is_not_limited_to_two_facilities(self):
        import time
        raw=fixture(8,4,2,91)
        for i,row in enumerate(raw["facilities"]):
            row["capacity"]=50.0
            row["opening_cost"]=10.0+i
        raw["transportation_costs"]=[[1.0]*4 for _ in range(8)]
        p=solver.parse(raw)
        opened=set(range(8))
        ship=solver.greedy_transport(p,opened)
        revised_open,revised_ship=solver.try_closures(
            p,opened,ship,time.monotonic()+3.0)
        self.assertTrue(solver.check(p,revised_open,revised_ship))
        self.assertEqual(revised_open,{0})
        self.assertLess(solver.objective(p,revised_open,revised_ship),
                        solver.objective(p,opened,ship))

    def test_greedy_fallback_always_feasible(self):
        raw=fixture()
        p=solver.parse(raw)
        greedy=solver.greedy_transport(p,set(range(p[0])))
        self.assertTrue(solver.check(p,set(range(p[0])),greedy))
        with patch.object(solver,"extensive_milp",return_value=None):
            result=solver.solve(raw,4)
        independent(raw,result)

    def test_scenario_alteration(self):
        for seed in (10,11,12,13):
            with self.subTest(seed=seed):
                raw=fixture(6,10,3,seed)
                result=solver.solve(raw,4)
                independent(raw,result)

    def test_exact_fixed_open_scenario_recourse(self):
        raw=fixture(4,6,3,74)
        p=solver.parse(raw)
        selected=set(range(p[0]))
        fast=solver.greedy_transport(p,selected)
        self.assertIsNotNone(fast)
        import time
        exact=solver.lp_transport(p,selected,time.monotonic()+4)
        self.assertIsNotNone(exact)
        self.assertTrue(solver.check(p,selected,exact))
        self.assertLessEqual(solver.objective(p,selected,exact),
                             solver.objective(p,selected,fast)+1e-6)

    def test_pure_python_exchange_repairs_greedy_assignment(self):
        import time
        raw={"num_facilities":3,"num_customers":3,"num_scenarios":1,
             "facilities":[{"id":i,"capacity":1,"opening_cost":0}
                           for i in range(3)],
             "scenarios":[{"id":0,"demands":[1,1,1],"probability":1}],
             "transportation_costs":[[0,13,9],[16,13,19],[5,5,3]]}
        p=solver.parse(raw)
        opened={0,1,2}
        greedy=solver.greedy_transport(p,opened)
        self.assertEqual(solver.objective(p,opened,greedy),30.)
        repaired=solver.improve_transport_exchanges(
            p,opened,greedy,time.monotonic()+1.)
        self.assertTrue(solver.check(p,opened,repaired))
        self.assertEqual(solver.objective(p,opened,repaired),16.)

    def test_direct_sparse_mip(self):
        raw=fixture(4,5,2,36)
        p=solver.parse(raw)
        import time
        result=solver.extensive_milp(p,time.monotonic()+5)
        self.assertIsNotNone(result)
        self.assertTrue(solver.check(p,*result))


if __name__=="__main__":
    unittest.main()
