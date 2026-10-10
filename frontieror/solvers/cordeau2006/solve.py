"""FrontierOR cordeau2006 DARP solver.

Each execution solves an unseen JSON instance. Uses OR-Tools routing with
capacity, pickup/delivery, time windows, ride-duration and route-duration
constraints, followed by a mathematically independent schedule/route check.
An anytime paired-insertion fallback requires no external packages.

This file is self-contained for FrontierOR's read-only sandbox and JSON CLI.
"""
from __future__ import annotations

import argparse
import json
import math
import time
from typing import Any


def _problem(raw: dict) -> dict:
    n = int(raw["num_users"])
    count = int(raw["num_nodes"])
    assert count == 2 * n + 2
    node_list = raw["nodes"]
    assert len(node_list) == count
    nodes = {int(node["node_id"]): node for node in node_list}
    assert set(nodes) == set(range(count))
    pickup = {}
    dropoff = {}
    for node in nodes.values():
        if node["node_type"] in ("pickup", "dropoff"):
            user = int(node["user_id"])
            if node["node_type"] == "pickup":
                pickup[user] = int(node["node_id"])
            else:
                dropoff[user] = int(node["node_id"])
    assert len(pickup) == len(dropoff) == n and set(pickup) == set(dropoff)
    assert all(int(nodes[p]["paired_node"]) == dropoff[u] for u, p in pickup.items())
    assert all(int(nodes[d]["paired_node"]) == pickup[u] for u, d in dropoff.items())
    xx = [(float(nodes[i]["x"]), float(nodes[i]["y"])) for i in range(count)]
    distances = [[math.hypot(xx[i][0] - xx[j][0], xx[i][1] - xx[j][1]) for j in range(count)] for i in range(count)]
    return {
        "n": n, "v": int(raw["num_vehicles"]), "nodes": nodes,
        "cap": int(raw["vehicle_capacity"]),
        "ride_max": float(raw["maximum_ride_time"]),
        "duration_max": float(raw["maximum_route_duration"]),
        "pickup": pickup, "dropoff": dropoff,
        "dist": distances, "start": 0, "end": count - 1,
    }


def _route_cost(p: dict, route: list[int]) -> float:
    return math.fsum(p["dist"][a][b] for a, b in zip(route, route[1:]))


def _cost(p: dict, routes: list[list[int]]) -> float:
    return math.fsum(_route_cost(p, route) for route in routes)


def _schedule(p: dict, route: list[int]) -> list[float] | None:
    """Solve fixed-route time feasibility as a system of difference constraints.

    Includes full window, travel, service, ride-time and route-duration inequalities.
    This is independent of OR-Tools integer-scaled time cumulants.
    """
    nodes = p["nodes"]
    count = len(route)
    root = count
    edges: list[tuple[int, int, float]] = []
    pos = {node: j for j, node in enumerate(route) if j and j < count - 1}
    for i, node_id in enumerate(route):
        node = nodes[node_id]
        earliest, latest = float(node["earliest_time"]), float(node["latest_time"])
        # t_i >= earliest and t_i <= latest
        edges.append((i, root, -earliest))
        edges.append((root, i, latest))
        if i:
            previous = route[i - 1]
            delta = float(nodes[previous]["service_duration"]) + p["dist"][previous][node_id]
            # t_i >= t_(i-1) + delta
            edges.append((i, i - 1, -delta))
    # t_end <= t_start + max_route_duration
    edges.append((0, count - 1, p["duration_max"]))
    for user, pick in p["pickup"].items():
        drop = p["dropoff"][user]
        if pick not in pos and drop not in pos:
            continue
        if pick not in pos or drop not in pos or pos[pick] >= pos[drop]:
            return None
        ip, jd = pos[pick], pos[drop]
        svc = float(nodes[pick]["service_duration"])
        # service_time(drop) <= service_time(pick) + service_pick + maximum ride
        edges.append((ip, jd, svc + p["ride_max"]))
        # service_time(drop) >= service_time(pick) + service_pick + direct distance
        edges.append((jd, ip, -(svc + p["dist"][pick][drop])))

    # Bellman-Ford; negative cycle means no time schedule satisfies all inequalities.
    distance = [0.0] * (count + 1)
    for iteration in range(count + 1):
        changed = False
        for u, v, w in edges:
            candidate = distance[u] + w
            if candidate < distance[v] - 1e-9:
                distance[v] = candidate
                changed = True
        if not changed:
            break
    else:
        return None
    solution = [distance[i] - distance[root] for i in range(count)]
    return solution


def _verify(p: dict, routes: list[list[int]], times: list[list[float]], tolerance: float = 1e-5) -> bool:
    if len(routes) != p["v"] or len(times) != p["v"]:
        return False
    seen: dict[int, tuple[int, int]] = {}
    nodes = p["nodes"]
    for v, (r, ts) in enumerate(zip(routes, times)):
        if len(r) != len(ts) or len(r) < 2 or r[0] != p["start"] or r[-1] != p["end"]:
            return False
        if ts[-1] - ts[0] > p["duration_max"] + tolerance:
            return False
        load = 0
        for j, nodeid in enumerate(r):
            if nodeid not in nodes:
                return False
            node = nodes[nodeid]
            if not (float(node["earliest_time"]) - tolerance <= ts[j] <= float(node["latest_time"]) + tolerance):
                return False
            if j:
                prev = r[j - 1]
                min_t = ts[j - 1] + float(nodes[prev]["service_duration"]) + p["dist"][prev][nodeid]
                if ts[j] + tolerance < min_t:
                    return False
            load += int(node["load"])
            if not (0 <= load <= p["cap"]):
                return False
            if j and j < len(r) - 1:
                if nodeid in seen or nodeid in (p["start"], p["end"]):
                    return False
                seen[nodeid] = (v, j)
        if load != 0:
            return False
    if set(seen) != set(range(1, p["end"])):
        return False
    for user, pick in p["pickup"].items():
        drop = p["dropoff"][user]
        v, pi = seen[pick]
        v2, di = seen[drop]
        if v != v2 or pi >= di:
            return False
        ride = times[v][di] - times[v][pi] - float(nodes[pick]["service_duration"])
        if not (p["dist"][pick][drop] - tolerance <= ride <= p["ride_max"] + tolerance):
            return False
    return True


def _format(p: dict, routes: list[list[int]], times: list[list[float]]) -> dict[str, Any]:
    nodes = p["nodes"]
    visits = {node: ts[j] for r, ts in zip(routes, times) for j, node in enumerate(r) if j and j < len(r) - 1}
    service = {str(node): float(value) for node, value in visits.items()}
    for k, ts in enumerate(times):
        service[f"depot_start_{k}"] = float(ts[0])
        service[f"depot_end_{k}"] = float(ts[-1])
    rides = {str(u): float(visits[d] - visits[pu] - float(nodes[pu]["service_duration"]))
             for u, pu in p["pickup"].items() for d in [p["dropoff"][u]]}
    return {
        "objective_value": _cost(p, routes),
        "routes": {str(i): list(route) for i, route in enumerate(routes)},
        "service_times": service,
        "ride_times": rides,
    }


def _integer_ceil(x: float, scale: int) -> int:
    return math.ceil(x * scale - 1e-7)


def _integer_floor(x: float, scale: int) -> int:
    return math.floor(x * scale + 1e-7)


def _ortools(p: dict, deadline: float, incumbent_cost: float) -> tuple[list[list[int]], list[list[float]]] | None:
    try:
        from ortools.constraint_solver import pywrapcp, routing_enums_pb2
    except ImportError:
        return None
    remaining = deadline - time.monotonic()
    if remaining < 3:
        return None
    SCALE = 100000  # sub-1e-5 conservative discretization of continuous time
    n = len(p["nodes"])
    manager = pywrapcp.RoutingIndexManager(n, p["v"], [p["start"]] * p["v"], [p["end"]] * p["v"])
    routing = pywrapcp.RoutingModel(manager)
    nodes = p["nodes"]
    distance = p["dist"]
    arc_costs = [[_integer_ceil(distance[i][j], 10000) for j in range(n)] for i in range(n)]
    # Objective rounding is independent of the exact floating-point output objective.
    def cost(i: int, j: int) -> int:
        return arc_costs[manager.IndexToNode(i)][manager.IndexToNode(j)]
    routing.SetArcCostEvaluatorOfAllVehicles(routing.RegisterTransitCallback(cost))
    time_matrix = [[_integer_ceil(distance[i][j] + float(nodes[i]["service_duration"]), SCALE)
                    for j in range(n)] for i in range(n)]
    def transit(i: int, j: int) -> int:
        return time_matrix[manager.IndexToNode(i)][manager.IndexToNode(j)]
    transit_idx = routing.RegisterTransitCallback(transit)
    slack_max = max(0, _integer_ceil(max(float(t["latest_time"]) for t in nodes.values()) -
                                    min(float(t["earliest_time"]) for t in nodes.values()), SCALE))
    max_time = max(_integer_ceil(float(t["latest_time"]) + p["duration_max"] + 1, SCALE)
                   for t in nodes.values())
    routing.AddDimension(transit_idx, slack_max, max_time, False, "Time")
    timed = routing.GetDimensionOrDie("Time")
    # Demand at a node changes the load as the vehicle leaves that node.
    def demand(i: int) -> int:
        return int(nodes[manager.IndexToNode(i)]["load"])
    cap_idx = routing.RegisterUnaryTransitCallback(demand)
    routing.AddDimensionWithVehicleCapacity(cap_idx, 0, [p["cap"]] * p["v"], True, "Capacity")
    solver = routing.solver()
    for node in range(1, n - 1):
        idx = manager.NodeToIndex(node)
        lo = _integer_ceil(float(nodes[node]["earliest_time"]), SCALE)
        hi = _integer_floor(float(nodes[node]["latest_time"]), SCALE)
        if lo > hi:
            return None
        timed.CumulVar(idx).SetRange(lo, hi)
    for vehicle in range(p["v"]):
        start = routing.Start(vehicle)
        end = routing.End(vehicle)
        for nodeid, idx in ((p["start"], start), (p["end"], end)):
            lo = _integer_ceil(float(nodes[nodeid]["earliest_time"]), SCALE)
            hi = _integer_floor(float(nodes[nodeid]["latest_time"]), SCALE)
            if lo > hi:
                return None
            timed.CumulVar(idx).SetRange(lo, hi)
        solver.Add(timed.CumulVar(end) - timed.CumulVar(start) <= _integer_floor(p["duration_max"], SCALE))
        routing.AddVariableMinimizedByFinalizer(timed.CumulVar(start))
        routing.AddVariableMinimizedByFinalizer(timed.CumulVar(end))
    for user, pickup in p["pickup"].items():
        drop = p["dropoff"][user]
        pi, di = manager.NodeToIndex(pickup), manager.NodeToIndex(drop)
        routing.AddPickupAndDelivery(pi, di)
        solver.Add(routing.VehicleVar(pi) == routing.VehicleVar(di))
        solver.Add(timed.CumulVar(pi) <= timed.CumulVar(di))
        service = float(nodes[pickup]["service_duration"])
        solver.Add(timed.CumulVar(di) - timed.CumulVar(pi) <= _integer_floor(service + p["ride_max"], SCALE))
        solver.Add(timed.CumulVar(di) - timed.CumulVar(pi) >= _integer_ceil(service + distance[pickup][drop], SCALE))

    def read_assignment(solution) -> tuple[list[list[int]], list[list[float]]] | None:
        routes, times = [], []
        for vehicle in range(p["v"]):
            idx = routing.Start(vehicle)
            route, ts = [], []
            guard = 0
            while True:
                route.append(manager.IndexToNode(idx))
                ts.append(solution.Value(timed.CumulVar(idx)) / SCALE)
                if routing.IsEnd(idx):
                    break
                idx = solution.Value(routing.NextVar(idx))
                guard += 1
                if guard > n + 1:
                    return None
            routes.append(route)
            times.append(ts)
        if _verify(p, routes, times):
            return routes, times
        # Integer rounding on short narrow windows can be conservative.
        # Try a separate continuous schedule for each route as a rescue.
        revised = [_schedule(p, r) for r in routes]
        if all(t is not None for t in revised) and _verify(p, routes, revised):
            return routes, revised
        return None

    best = None
    best_cost = incumbent_cost
    strategies = [
        routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION,
        routing_enums_pb2.FirstSolutionStrategy.LOCAL_CHEAPEST_INSERTION,
        routing_enums_pb2.FirstSolutionStrategy.AUTOMATIC,
    ]
    # Three genuinely different launch methods; leave time for validation/output.
    for iteration, method in enumerate(strategies):
        left = deadline - time.monotonic()
        if left < 2.0:
            break
        params = pywrapcp.DefaultRoutingSearchParameters()
        params.first_solution_strategy = method
        params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        params.time_limit.FromMilliseconds(max(200, int(min(left - 0.5, left * (0.64 if iteration == 0 else 0.75)) * 1000)))
        params.log_search = False
        try:
            result = routing.SolveWithParameters(params)
            if result is not None:
                candidate = read_assignment(result)
                if candidate:
                    score = _cost(p, candidate[0])
                    if score < best_cost - 1e-7:
                        best_cost, best = score, candidate
        except (ValueError, OverflowError, RuntimeError):
            # Retain independently checked incumbent when an alternative strategy fails.
            continue
    return best



def _fast_append(p: dict, deadline: float) -> tuple[list[list[int]], list[list[float]]] | None:
    """Very fast feasible incumbent: append a complete request pair before a depot.

    Keeps an incumbent available even when sophisticated search times out.
    """
    users = list(p["pickup"])
    nodes = p["nodes"]
    orders = [
        sorted(users, key=lambda u: (float(nodes[p["pickup"][u]]["earliest_time"]),
                                    float(nodes[p["dropoff"][u]]["latest_time"]))),
        sorted(users, key=lambda u: float(nodes[p["dropoff"][u]]["latest_time"])),
        sorted(users, key=lambda u: (float(nodes[p["pickup"][u]]["latest_time"]) -
                                     float(nodes[p["pickup"][u]]["earliest_time"]))),
    ]
    best = None
    best_score = math.inf
    for order in orders:
        routes = [[p["start"], p["end"]] for _ in range(p["v"])]
        time_values = [_schedule(p, r) for r in routes]
        if not all(x is not None for x in time_values):
            continue
        route_costs = [_route_cost(p, r) for r in routes]
        succeeded = True
        for user in order:
            if time.monotonic() > deadline - 0.01:
                succeeded = False
                break
            pu, dr = p["pickup"][user], p["dropoff"][user]
            tests = []
            for k, route in enumerate(routes):
                if int(nodes[pu]["load"]) > p["cap"]:
                    continue
                trial = route[:-1] + [pu, dr, p["end"]]
                tests.append((_route_cost(p, trial) - route_costs[k], k, trial))
            chosen = None
            for _, k, trial in sorted(tests):
                ts = _schedule(p, trial)
                if ts is not None and _route_capacity_ok(p, trial):
                    chosen = k, trial, ts
                    break
            if chosen is None:
                succeeded = False
                break
            k, route, ts = chosen
            routes[k], time_values[k] = route, ts
            route_costs[k] = _route_cost(p, route)
        if succeeded and _verify(p, routes, time_values):
            score = _cost(p, routes)
            if score < best_score:
                best, best_score = (routes, time_values), score
    return best


def _route_capacity_ok(p: dict, route: list[int]) -> bool:
    load = 0
    for node in route:
        load += int(p["nodes"][node]["load"])
        if load < 0 or load > p["cap"]:
            return False
    return load == 0

def _insertion(p: dict, deadline: float) -> tuple[list[list[int]], list[list[float]]] | None:
    """Pure Python anytime complementary method: precedence-preserving pair insertion.

    Limited candidate neighborhood + multiple orderings. No global dependencies.
    """
    users = list(p["pickup"])
    if not users:
        routes = [[p["start"], p["end"]] for _ in range(p["v"])]
        times = [_schedule(p, r) for r in routes]
        if all(t is not None for t in times):
            return routes, times
        return None
    nodes = p["nodes"]
    scored = []
    for user in users:
        a, b = p["pickup"][user], p["dropoff"][user]
        interval = float(nodes[b]["latest_time"]) - float(nodes[a]["earliest_time"])
        scored.append((interval, float(nodes[a]["latest_time"]) - float(nodes[a]["earliest_time"]), user))
    # Feasibility-first ordering rescues narrow-window cases where ranking
    # only by interval width can trap the insertion heuristic prematurely.
    earliest_pickup = sorted(users, key=lambda u: (
        float(nodes[p["pickup"][u]]["earliest_time"]),
        float(nodes[p["dropoff"][u]]["latest_time"]), u))
    orderings = [
        earliest_pickup,
        sorted(users, key=lambda u: (float(nodes[p["dropoff"][u]]["latest_time"]), u)),
        [u for _, _, u in sorted(scored)],
        [u for _, _, u in sorted(scored, key=lambda x: (x[1], x[0]))],
        [u for _, _, u in sorted(scored, key=lambda x: (-x[0], x[1]))],
    ]
    if len(users) <= 40:
        import random
        seed = (20261010 + len(users) * 1009 + p["v"] * 103
                + int(sum(abs(float(n["x"])) * 17 + abs(float(n["y"])) * 19
                          for n in nodes.values())))
        rng = random.Random(seed)
        for _ in range(12 if len(users) <= 20 else 3):
            perm = users[:]
            rng.shuffle(perm)
            orderings.append(perm)
    best = None
    best_cost = math.inf
    for order in orderings:
        if deadline - time.monotonic() <= 0.1:
            break
        routes = [[p["start"], p["end"]] for _ in range(p["v"])]
        times = [_schedule(p, r) for r in routes]
        route_costs = [_route_cost(p, r) for r in routes]
        successful = True
        for user in order:
            if time.monotonic() > deadline - 0.07:
                successful = False
                break
            a, b = p["pickup"][user], p["dropoff"][user]
            candidates = []
            for vehicle, route in enumerate(routes):
                # Capacity single request must be possible.
                if int(nodes[a]["load"]) > p["cap"]:
                    continue
                for i in range(1, len(route)):
                    for j in range(i + 1, len(route) + 1):
                        new_route = route[:i] + [a] + route[i:j - 1] + [b] + route[j - 1:]
                        # Cheap delta filter; expensive schedule only for likely good insertions.
                        cost = _route_cost(p, new_route)
                        candidates.append((cost - route_costs[vehicle], vehicle, new_route, cost))
            candidates.sort(key=lambda x: x[0])
            chosen = None
            # Strict, fast feasibility tests; evaluate broader candidates on small instances.
            take = len(candidates) if len(users) <= 12 else min(len(candidates), 300)
            for delta, vehicle, trial, route_cost in candidates[:take]:
                sched = _schedule(p, trial)
                if sched is not None:
                    # ride & capacity, route duration are covered by _schedule / load check.
                    load = 0
                    for nd in trial:
                        load += int(nodes[nd]["load"])
                        if not (0 <= load <= p["cap"]):
                            break
                    else:
                        chosen = vehicle, trial, sched, route_cost
                        break
            if chosen is None:
                successful = False
                break
            vehicle, route, ts, route_cost = chosen
            routes[vehicle] = route
            times[vehicle] = ts
            route_costs[vehicle] = route_cost
        if successful and _verify(p, routes, times):
            objective = _cost(p, routes)
            if objective < best_cost:
                best, best_cost = (routes, times), objective
    return best


def _fast_feasible_bounds(p: dict, route: list[int]) -> bool:
    """Necessary feasibility checks (O(route length)); never suppress a valid tour.

    Only reject capacity, unavoidable window violations, or a minimal route
    duration that already exceeds the hard bound. Exact scheduler decides later.
    """
    loads = 0
    time_lb = float(p['nodes'][route[0]]['earliest_time'])
    total_service_and_travel = 0.0
    for index, node_id in enumerate(route):
        node = p['nodes'][node_id]
        loads += int(node['load'])
        if loads < 0 or loads > p['cap']:
            return False
        if index:
            previous = route[index-1]
            transit = p['dist'][previous][node_id] + float(p['nodes'][previous]['service_duration'])
            total_service_and_travel += transit
            time_lb = max(time_lb+transit, float(node['earliest_time']))
        if time_lb > float(node['latest_time']) + 1e-7:
            return False
    return loads == 0 and total_service_and_travel <= p['duration_max'] + 1e-7


def _pair_moves(p: dict, routes: list[list[int]], user: int, base_costs=None):
    """O(1) delta for each pickup/dropoff pair insertion; defer route allocation.

    Every possible insertion position is considered, with exact float arc cost.
    Algebraic delta is cheaper than constructing & rescoring every route.
    """
    a, b = p['pickup'][user], p['dropoff'][user]
    dist = p['dist']
    all_moves = []
    for vehicle, route in enumerate(routes):
        m = len(route)
        for i in range(1, m):
            pre, following = route[i-1], route[i]
            first = dist[pre][a] + dist[a][following] - dist[pre][following]
            for j in range(i+1, m+1):
                if j == i+1:
                    delta = dist[pre][a] + dist[a][b] + dist[b][following] - dist[pre][following]
                else:
                    x, y = route[j-2], route[j-1]
                    delta = first + dist[x][b] + dist[b][y] - dist[x][y]
                all_moves.append((delta, vehicle, i, j))
    all_moves.sort()
    return all_moves


def _insert_pair_route(p: dict, route: list[int], user: int, i: int, j: int) -> list[int]:
    a, b = p['pickup'][user], p['dropoff'][user]
    return route[:i] + [a] + route[i:j-1] + [b] + route[j-1:]


def _try_best_pair(p: dict, routes: list[list[int]], user: int,
                   deadline: float, max_exact: int = 160):
    """Methods-v-methods: cheap bound -> exact schedule -> capacity -> accept."""
    checked = 0
    for delta, v, i, j in _pair_moves(p, routes, user):
        if time.monotonic() > deadline - 0.025:
            break
        trial = _insert_pair_route(p, routes[v], user, i, j)
        if not _fast_feasible_bounds(p, trial):
            continue
        checked += 1
        sched = _schedule(p, trial)
        if sched is not None and _verify_partial_timing(p, trial, sched):
            return v, trial, sched, delta
        if checked >= max_exact:
            break
    return None


def _verify_partial_timing(p: dict, route: list[int], ts: list[float]) -> bool:
    """One-route check independent from partial global-coverage assumptions."""
    if len(route) != len(ts):
        return False
    if ts[-1] - ts[0] > p['duration_max'] + 1e-6:
        return False
    load=0
    pos={}
    for j, node_id in enumerate(route):
        nd=p['nodes'][node_id]
        load+=int(nd['load'])
        if not 0<=load<=p['cap']:
            return False
        if not float(nd['earliest_time'])-1e-6<=ts[j]<=float(nd['latest_time'])+1e-6:
            return False
        if j and ts[j] +1e-6 < ts[j-1]+p['nodes'][route[j-1]]['service_duration']+p['dist'][route[j-1]][node_id]:
            return False
        if j and j<len(route)-1: pos[node_id]=j
    for u,a in p['pickup'].items():
        b=p['dropoff'][u]
        if a not in pos and b not in pos: continue
        if a not in pos or b not in pos or pos[b]<=pos[a]: return False
        ride=ts[pos[b]]-ts[pos[a]]-float(p['nodes'][a]['service_duration'])
        if not p['dist'][a][b]-1e-6 <= ride <= p['ride_max']+1e-6: return False
    return load==0


def _solid_construct(p: dict, deadline: float):
    """Method-router portfolio: earliest windows, deadline and hardness variants.

    Every stage is bounded, candidate ranking is O(1) arc delta, and output
    receives the same exact schedule/constraint gate as all other solvers.
    """
    users=list(p['pickup'])
    if not users:
        rr=[[p['start'],p['end']] for _ in range(p['v'])]
        tt=[_schedule(p,r) for r in rr]
        return (rr,tt) if all(s is not None for s in tt) and _verify(p,rr,tt) else None
    nd=p['nodes']
    def earliest(u): return float(nd[p['pickup'][u]]['earliest_time'])
    def deadline_drop(u): return float(nd[p['dropoff'][u]]['latest_time'])
    def width(u): return float(nd[p['pickup'][u]]['latest_time'])-earliest(u)
    orders=[sorted(users,key=lambda u:(earliest(u),deadline_drop(u))),
            sorted(users,key=lambda u:(deadline_drop(u),earliest(u))),
            sorted(users,key=lambda u:(width(u),deadline_drop(u))),
            sorted(users,key=lambda u:(p['dist'][p['pickup'][u]][p['dropoff'][u]]*-1,earliest(u)))]
    import random
    seed = 20261010 + 31*p['n'] + 101*p['v'] + int(sum(abs(float(x['x']))+abs(float(x['y'])) for x in nd.values()))
    rng=random.Random(seed)
    if len(users)<=32:
        for _ in range(10 if len(users)<=16 else 3):
            order=users[:];rng.shuffle(order);orders.append(order)
    best=None
    best_cost=math.inf
    for order in orders:
        if time.monotonic()>deadline-0.06:break
        routes=[[p['start'],p['end']] for _ in range(p['v'])]
        times=[_schedule(p,r) for r in routes]
        ok=True
        for user in order:
            if time.monotonic()>deadline-0.04:
                ok=False;break
            move=_try_best_pair(p,routes,user,deadline,max_exact=200 if p['n']<=18 else 70)
            if move is None:
                ok=False;break
            v,route,sched,_=move
            routes[v],times[v]=route,sched
        if ok and _verify(p,routes,times):
            cost=_cost(p,routes)
            if cost<best_cost-1e-7:
                best=(routes,times);best_cost=cost
    return best


def _solid_improve(p: dict, incumbent, deadline: float):
    """Bounded 1-request relocate local search including cross-vehicle moves.

    Strict nonregression: only accept provably feasible lower-cost neighbors.
    Stop when time exhausted; never destroy the last verified incumbent.
    """
    if incumbent is None or not _verify(p,*incumbent):return incumbent
    routes=[r[:] for r in incumbent[0]]
    times=[t[:] for t in incumbent[1]]
    best=_cost(p,routes)
    users=list(p['pickup'])
    import random
    seed = 11939 + p['n'] * 103 + p['v']
    rng = random.Random(seed)
    changed=True
    pass_number=0
    while changed and time.monotonic()<deadline-0.10 and pass_number<4:
        pass_number+=1;changed=False
        rng.shuffle(users)
        for u in users:
            if time.monotonic()>deadline-0.09:break
            a,b=p['pickup'][u],p['dropoff'][u]
            oldv=next((k for k,r in enumerate(routes) if a in r), None)
            if oldv is None: continue
            oldroute=routes[oldv]
            reduced=[x for x in oldroute if x!=a and x!=b]
            if not _fast_feasible_bounds(p,reduced):continue
            oldsched=_schedule(p,reduced)
            if oldsched is None or not _verify_partial_timing(p,reduced,oldsched):continue
            reduced_routes=list(routes);reduced_routes[oldv]=reduced
            removed_cost=_cost(p,reduced_routes)
            for delta,v,i,j in _pair_moves(p,reduced_routes,u):
                if time.monotonic()>deadline-0.08:break
                candidate_cost=removed_cost+delta
                if candidate_cost>=best-1e-6:break
                candidate=_insert_pair_route(p,reduced_routes[v],u,i,j)
                if not _fast_feasible_bounds(p,candidate):continue
                s=_schedule(p,candidate)
                if s is None or not _verify_partial_timing(p,candidate,s):continue
                trial_routes=list(reduced_routes);trial_routes[v]=candidate
                trial_times=list(times);trial_times[oldv]=oldsched;trial_times[v]=s
                if not _verify(p,trial_routes,trial_times):continue
                exact_cost=_cost(p,trial_routes)
                if exact_cost<best-1e-6:
                    routes,times=trial_routes,trial_times
                    best=exact_cost;changed=True
                    break
    return (routes,times) if _verify(p,routes,times) else incumbent

def solve(instance: dict, time_limit_s: float) -> dict[str, Any]:
    p = _problem(instance)
    if p["v"] <= 0 or p["cap"] <= 0:
        raise ValueError("Invalid fleet capacity")
    hard = time.monotonic() + max(1.0, float(time_limit_s) - 3.5)
    # Fast independent fallback first for small problems; OR-Tools is primary for large problems.
    fast_budget = min(1.0, max(0.0, hard - time.monotonic() - 0.3))
    fallback = _fast_append(p, time.monotonic() + fast_budget) if fast_budget > 0 else None
    warmup = min(3.0 if p["n"] <= 20 else 2.0, max(0.0, hard - time.monotonic() - 1.0))
    attempted = _insertion(p, time.monotonic() + warmup) if warmup > 0 else None
    if attempted and (fallback is None or _cost(p, attempted[0]) < _cost(p, fallback[0])):
        fallback = attempted
    # Fast solid-state alternative with strict independent validation.
    budget = min(3.0, max(0.0, hard-time.monotonic()-1.0))
    alternative = _solid_construct(p, time.monotonic()+budget) if budget>0.2 else None
    if alternative and _verify(p,*alternative) and (fallback is None or _cost(p,alternative[0]) < _cost(p,fallback[0])):
        fallback = alternative
    if fallback and not _verify(p, *fallback):
        fallback = None
    incumbent = _cost(p, fallback[0]) if fallback else math.inf
    try:
        improved = _ortools(p, hard, incumbent)
    except Exception:
        # Preserve a checked incumbent if OR-Tools fails to initialize on a host.
        improved = None
    selection = improved if improved is not None else fallback
    # When feasible, promote only strict improvements; reserve leftover budget.
    if selection and time.monotonic()<hard-0.15:
        selection = _solid_improve(p, selection, hard-0.1)
    if selection is None and time.monotonic() < hard - 0.1:
        selection = _insertion(p, hard)
    if selection is None or not _verify(p, *selection):
        raise RuntimeError("Failed to find an independently feasible solution within the time limit")
    return _format(p, *selection)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--problem", default="cordeau2006")
    parser.add_argument("--instance", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--time-limit", type=float, default=60.0)
    args = parser.parse_args()
    with open(args.instance, encoding="utf-8") as file:
        instance = json.load(file)
    solution = solve(instance, args.time_limit)
    from _runtime_core import write_solution
    write_solution(args.output, solution)


if __name__ == "__main__":
    main()