"""FrontierOR nagy2015 independently verifies every stop, load, and distance."""
import importlib.util
import math
import pathlib
import random
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[1] / "solvers" / "nagy2015" / "solve.py"
spec = importlib.util.spec_from_file_location("vrpddp", SOURCE)
vrp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vrp)


def fixture(n, seed):
    rng = random.Random(seed)
    coords=[(0,0)]+[(int(rng.uniform(8,32)), int(rng.uniform(8,32))) for _ in range(n)]
    rows=[]
    for j in range(1,n+1):
        x,y=coords[j]
        rows.append({"id":j,"x":x,"y":y,
                     "delivery_demand":rng.randrange(1,4),
                     "pickup_demand":rng.randrange(1,4)})
    dist=[[int(math.hypot(xa-xb,ya-yb)+0.5)
           for xb,yb in coords] for xa,ya in coords]
    return {"num_customers":n,"vehicle_capacity":10,
            "depot":{"id":0,"x":0,"y":0},
            "customers":rows,"distance_matrix":dist}


def independent(data, sol):
    assert set(sol)=={"objective_value","routes","routes_detailed"}
    n=data["num_customers"]
    byid={c["id"]:c for c in data["customers"]}
    visits=[]
    value=0.0
    assert len(sol["routes"])==len(sol["routes_detailed"])
    for route,details in zip(sol["routes"],sol["routes_detailed"]):
        assert len(route)==len(details)
        assert route[0]==route[-1]==0
        delivery=sum(byid[x]["delivery_demand"] for x in route[1:-1] if x<=n)
        load=delivery
        assert 0<=load<=data["vehicle_capacity"]
        backhaul_started=False
        for x,item in zip(route,details):
            assert item["node_id"]==x
            if x==0: assert item["role"]=="depot"
            elif x<=n:
                assert not backhaul_started
                visits.append(x)
                assert item["role"]=="linehaul" and item["customer_id"]==x
                load-=byid[x]["delivery_demand"]
            else:
                backhaul_started=True
                visits.append(x)
                assert item["role"]=="backhaul" and item["customer_id"]==x-n
                load+=byid[x-n]["pickup_demand"]
            assert -1e-7<=load<=data["vehicle_capacity"]+1e-7
        for a,b in zip(route,route[1:]):
            a=a if a<=n else a-n
            b=b if b<=n else b-n
            value+=data["distance_matrix"][a][b]
    assert sorted(visits)==list(range(1,2*n+1))
    assert abs(value-sol["objective_value"])<=1e-6
    return value


class DivisibleVRPTests(unittest.TestCase):
    def test_valid_savings_portfolio(self):
        for n,seed in ((2,11),(5,12),(15,20),(28,22)):
            with self.subTest(n=n):
                data=fixture(n,seed)
                solution=vrp.solve(data,6)
                independent(data,solution)
                p=vrp.parse(data)
                self.assertLessEqual(solution["objective_value"],vrp.score(p,vrp.separate_routes(p))+1e-7)

    def test_improves_single_customer_baseline(self):
        data=fixture(9,42)
        p=vrp.parse(data)
        answer=vrp.solve(data,5)
        self.assertLess(answer["objective_value"],vrp.score(p,vrp.separate_routes(p)))

    def test_request_swap_escapes_capacity_tight_relocation_optimum(self):
        import time
        data=fixture(10,11)
        p=vrp.parse(data)
        routes=vrp.savings(p,time.monotonic()+2.)
        routes=[vrp.phase_two_opt(p,r,time.monotonic()+.2) for r in routes]
        routes=vrp.relocation(p,routes,time.monotonic()+1.)
        before=vrp.score(p,routes)
        swapped=vrp.request_swap(p,routes,time.monotonic()+2.)
        self.assertTrue(vrp.verify(p,swapped))
        self.assertLess(vrp.score(p,swapped),before)
        self.assertLessEqual(vrp.score(p,swapped),216.)

    def test_cross_phase_method_nonregression(self):
        import time
        for n,seed in ((6,91),(15,64),(30,75)):
            with self.subTest(n=n):
                data=fixture(n,seed)
                p=vrp.parse(data)
                seed_routes=vrp.savings(p,time.monotonic()+1.5)
                self.assertTrue(vrp.verify(p,seed_routes))
                original=vrp.score(p,seed_routes)
                revised=[vrp.cross_phase_two_opt(p,route,time.monotonic()+0.3)
                         for route in seed_routes]
                self.assertTrue(vrp.verify(p,revised))
                self.assertLessEqual(vrp.score(p,revised),original+1e-7)

    def test_constraint_15_rejects_backhaul_before_linehaul(self):
        data=fixture(2,31)
        p=vrp.parse(data)
        self.assertFalse(vrp.feasible(p,[0,1,3,2,4,0]))

    def test_relocation_can_eliminate_single_request_route(self):
        n=3
        distances=[[abs(i-j) for j in range(n+1)] for i in range(n+1)]
        p=(n,10.0,[0.0,1.0,1.0,1.0],[0.0,1.0,1.0,1.0],distances)
        routes=[[0,1,4,0],[0,2,3,5,6,0]]
        import time
        revised=vrp.relocation(p,routes,time.monotonic()+1.0)
        self.assertTrue(vrp.verify(p,revised))
        self.assertEqual(len(revised),1)
        self.assertLess(vrp.score(p,revised),vrp.score(p,routes))

    def test_rejects_capacity_violation(self):
        data=fixture(2,1)
        data["customers"][0]["pickup_demand"]=20
        with self.assertRaises(RuntimeError):
            vrp.solve(data,2)


if __name__=="__main__":
    unittest.main()
