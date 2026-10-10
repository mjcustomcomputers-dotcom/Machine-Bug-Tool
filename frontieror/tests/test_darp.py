"""Isolated FrontierOR Dial-a-Ride independent correctness and OR-Tools tests."""
from __future__ import annotations
import importlib.util
import math
import pathlib
import random
import time
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[1] / "solvers" / "cordeau2006" / "solve.py"
spec = importlib.util.spec_from_file_location("frontieror_darp", SOURCE)
darp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(darp)


def fixture(n: int, vehicles: int, seed: int) -> dict:
    rng = random.Random(seed)
    pts = [(0.0, 0.0)] + [
        (rng.uniform(-20, 20), rng.uniform(-20, 20)) for _ in range(2*n)
    ] + [(0.0, 0.0)]
    nodes = []
    for j, (x, y) in enumerate(pts):
        if j == 0:
            kind, user, pair, load = "origin_depot", None, None, 0
        elif j == 2*n + 1:
            kind, user, pair, load = "destination_depot", None, None, 0
        elif j <= n:
            kind, user, pair, load = "pickup", j-1, j+n, 1
        else:
            kind, user, pair, load = "dropoff", j-n-1, j-n, -1
        node = dict(node_id=j, x=x, y=y, earliest_time=0.0,
                    latest_time=10000.0, service_duration=1.0 if user is not None else 0.0,
                    load=load, node_type=kind)
        if user is not None:
            node.update(user_id=user, paired_node=pair,
                        request_type="outbound" if user < n//2 else "inbound")
        nodes.append(node)
    return dict(num_vehicles=vehicles, num_users=n,
                num_nodes=2*n+2, nodes=nodes,
                vehicle_capacity=3, maximum_ride_time=1000,
                maximum_route_duration=10000)


def independent_check(inp: dict, out: dict) -> None:
    nodes = {x["node_id"]: x for x in inp["nodes"]}
    n = inp["num_users"]
    v = inp["num_vehicles"]
    end = 2*n+1
    assert set(out) == {"objective_value", "routes", "service_times", "ride_times"}
    assert set(out["routes"]) == {str(i) for i in range(v)}
    seen = set()
    users = {}
    cost = 0.0
    for vehicle in range(v):
        route = out["routes"][str(vehicle)]
        assert route[0] == 0 and route[-1] == end
        s = out["service_times"]
        times = [s[f"depot_start_{vehicle}"]] + [s[str(j)] for j in route[1:-1]] + [s[f"depot_end_{vehicle}"]]
        assert times[-1] - times[0] <= inp["maximum_route_duration"] + 1e-5
        load = 0
        for pos, node_id in enumerate(route):
            node = nodes[node_id]
            load += node["load"]
            assert 0 <= load <= inp["vehicle_capacity"]
            assert node["earliest_time"] - 1e-5 <= times[pos] <= node["latest_time"] + 1e-5
            if 0 < pos < len(route)-1:
                assert node_id not in seen
                seen.add(node_id)
                users.setdefault(node["user_id"], {})[node["node_type"]] = (vehicle, pos, times[pos], node["service_duration"])
            if pos:
                before = nodes[route[pos-1]]
                dist = math.hypot(before["x"] - node["x"], before["y"] - node["y"])
                cost += dist
                assert times[pos] >= times[pos-1] + before["service_duration"] + dist - 1e-5
        assert load == 0
    assert seen == set(range(1, end))
    for uid in range(n):
        p = users[uid]["pickup"]
        d = users[uid]["dropoff"]
        assert p[0] == d[0] and p[1] < d[1]
        ride = d[2] - p[2] - p[3]
        assert -1e-5 <= ride <= inp["maximum_ride_time"] + 1e-5
        assert abs(ride - out["ride_times"][str(uid)]) < 1e-5
        pick_node = nodes[uid+1]
        drop_node = nodes[n+uid+1]
        direct = math.hypot(pick_node["x"]-drop_node["x"], pick_node["y"]-drop_node["y"])
        assert ride + 1e-5 >= direct
    assert abs(cost - out["objective_value"]) < 1e-5 * max(cost, 1)


class DarpTests(unittest.TestCase):
    def test_independent_solver(self):
        for n, v in ((1, 1), (4, 2), (8, 3), (12, 2)):
            with self.subTest(n=n, vehicles=v):
                inp = fixture(n, v, 500 + n)
                out = darp.solve(inp, 8)
                independent_check(inp, out)

    def test_direct_ortools_path(self):
        from ortools.constraint_solver import pywrapcp
        self.assertTrue(pywrapcp)
        inp = fixture(5, 2, 19)
        problem = darp._problem(inp)
        candidate = darp._ortools(problem, time.monotonic()+12, math.inf)
        self.assertIsNotNone(candidate, "OR-Tools branch must actually return a feasible solution")
        self.assertTrue(darp._verify(problem, *candidate))
        independent_check(inp, darp._format(problem, *candidate))


if __name__ == "__main__":
    unittest.main()
