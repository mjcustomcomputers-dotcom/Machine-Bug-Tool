"""FrontierOR Orienteering methods lab v0.2.

Implements the public fischetti1998 problem contract; uses only Python stdlib.
A genuine competition score requires the organizer's private checker.

    python solve.py --problem fischetti1998 --instance sample.json \
        --output solution.json --time-limit 60

Or import ``solve(instance: dict, time_limit_s: int) -> dict`` from an agent.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import re
import time
from dataclasses import dataclass
from pathlib import Path
import sys as _sys
_local_dir = str(Path(__file__).resolve().parent)
if _local_dir not in _sys.path:
    _sys.path.insert(0, _local_dir)
from _runtime_core import BoundedMemo


@dataclass
class Problem:
    depot: int
    cities: list[int]
    prizes: dict[int, int]
    travel: dict[tuple[int, int], int]
    limit: int

    def distance(self, a: int, b: int) -> int:
        if a == b:
            return 0
        return self.travel[(min(a, b), max(a, b))]

    def cost(self, route: list[int]) -> int:
        # Per-instance MPC virtual route cache: full immutable tour as key.
        cache = getattr(self, "_route_cost_cache", None)
        if cache is None:
            cache = BoundedMemo(limit=2048)
            self._route_cost_cache = cache
        key = tuple(route)
        saved = cache.get(key)
        if saved is not None:
            return saved
        result = sum(self.distance(u, v) for u, v in zip(route, route[1:]))
        return cache.set(key, result)

    def prize(self, route: list[int]) -> int:
        return sum(self.prizes[c] for c in route[1:-1])


def parse_problem(instance: dict) -> Problem:
    depot = int(instance['depot'])
    prizes = {int(k): int(v) for k, v in instance['prizes'].items()}
    cities = sorted(prizes)
    if len(cities) != int(instance['n']) or depot not in prizes:
        raise ValueError('Inconsistent city count or depot')
    if any(p < 0 for p in prizes.values()):
        raise ValueError('Negative prize is outside the published OP problem')
    travel = {}
    for text_key, raw_value in instance['travel_times'].items():
        match = re.fullmatch(r'\(\s*(\d+)\s*,\s*(\d+)\s*\)', str(text_key))
        if match is None:
            raise ValueError(f'Unexpected travel-times key: {text_key!r}')
        a, b = map(int, match.groups())
        if a == b or a not in prizes or b not in prizes:
            raise ValueError(f'Invalid distance pair {a}, {b}')
        value = int(raw_value)
        if value < 0 or value != raw_value:
            raise ValueError(f'Noninteger or negative travel time at {text_key}')
        key = (min(a, b), max(a, b))
        if key in travel and travel[key] != value:
            raise ValueError(f'Conflicting travel times at {text_key}')
        travel[key] = value
    expected = len(cities) * (len(cities) - 1) // 2
    if len(travel) != expected:
        raise ValueError(f'Incomplete travel matrix: {len(travel)} of {expected} pairs')
    limit = int(instance['t0'])
    if limit < 0:
        raise ValueError('Negative route time limit')
    return Problem(depot, cities, prizes, travel, limit)


def better(problem: Problem, route: list[int] | None, incumbent: list[int] | None) -> bool:
    if route is None:
        return False
    if incumbent is None:
        return True
    a, b = problem.prize(route), problem.prize(incumbent)
    return a > b or (a == b and problem.cost(route) < problem.cost(incumbent))


def pair_seeds(p: Problem, ranking: str = 'ratio', count: int = 6) -> list[list[int]]:
    """Build valid 3-city cycles before adding customers."""
    non_depot = [c for c in p.cities if c != p.depot]
    pairs = []
    for i, a in enumerate(non_depot):
        for b in non_depot[i + 1:]:
            route = [p.depot, a, b, p.depot]
            cost = p.cost(route)
            if cost <= p.limit:
                value = p.prizes[a] + p.prizes[b]
                priority = (value / (cost + 1)) if ranking == 'ratio' else value
                pairs.append((priority, value, -cost, a, b, route))
    pairs.sort(reverse=True)
    return [x[-1] for x in pairs[:count]]


def two_opt(p: Problem, route: list[int], deadline: float) -> list[int]:
    """Shorten the route without changing its selected cities (prize invariant)."""
    current = route[:]
    while time.monotonic() < deadline:
        best_delta, cut_i, cut_j = 0, -1, -1
        for i in range(1, len(current) - 2):
            if time.monotonic() >= deadline:
                break
            for j in range(i + 1, len(current) - 1):
                a, b = current[i - 1], current[i]
                c, d = current[j], current[j + 1]
                delta = p.distance(a, c) + p.distance(b, d) - p.distance(a, b) - p.distance(c, d)
                if delta < best_delta:
                    best_delta, cut_i, cut_j = delta, i, j
        if cut_i < 0:
            break
        current[cut_i:cut_j + 1] = reversed(current[cut_i:cut_j + 1])
    return current


def extend(p: Problem, route: list[int], method: str, deadline: float, rng: random.Random) -> list[int]:
    """Insert unvisited cities and shorten path when new capacity is needed."""
    current = two_opt(p, route, deadline)
    while time.monotonic() < deadline:
        selected = set(current)
        remaining = p.limit - p.cost(current)
        candidates = []
        for city in p.cities:
            if city in selected:
                continue
            prize = p.prizes[city]
            for pos in range(1, len(current)):
                extra = p.distance(current[pos - 1], city) + p.distance(city, current[pos]) - p.distance(current[pos - 1], current[pos])
                if extra <= remaining:
                    if method == 'greedy_prize':
                        priority = (prize, -extra)
                    elif method == 'randomized':
                        priority = (prize / (max(extra, 0) + 1), prize)
                    else:
                        priority = (prize / (max(extra, 0) + 1), -extra)
                    candidates.append((priority, city, pos))
        if not candidates:
            break
        candidates.sort(key=lambda x: x[0], reverse=True)
        chosen = candidates[rng.randrange(min(4, len(candidates)))] if method == 'randomized' else candidates[0]
        _, city, pos = chosen
        current.insert(pos, city)
        current = two_opt(p, current, deadline)
    return current


def swap_improve(p: Problem, route: list[int], deadline: float) -> list[int]:
    """Exchange one selected city for a higher-prize unselected one when feasible."""
    current = route[:]
    for _ in range(4):
        if time.monotonic() >= deadline:
            break
        selected = set(current)
        unselected = sorted((c for c in p.cities if c not in selected), key=lambda c: -p.prizes[c])
        candidate, best_gain = None, 0
        for out_pos in range(1, len(current) - 1):
            if time.monotonic() >= deadline:
                break
            removed = current[out_pos]
            shorter = current[:out_pos] + current[out_pos + 1:]
            for added in unselected[:40]:
                gain = p.prizes[added] - p.prizes[removed]
                if gain <= best_gain:
                    continue
                for at in range(1, len(shorter)):
                    proposal = shorter[:at] + [added] + shorter[at:]
                    if p.cost(proposal) <= p.limit:
                        candidate, best_gain = proposal, gain
                        break
        if candidate is None:
            break
        current = two_opt(p, candidate, deadline)
    return current



def relocate_short_blocks(p: Problem, route: list[int], deadline: float,
                          max_block: int = 3) -> list[int]:
    """Improve tour length using exact constant-time Or-opt edge deltas.

    These moves preserve every visited city and therefore preserve prize;
    recovered travel slack is available for later prize-bearing insertions.
    The block may move across the depot-adjacent positions but never include
    the depot itself. Every reported new route is independently cost-checked.
    """
    current=route[:]
    for iteration in range(15):
        if time.monotonic() >= deadline or len(current)<6:
            break
        best_delta=-1e-8
        best=None
        for length in range(1,min(max_block,len(current)-4)+1):
            if time.monotonic() >= deadline:
                break
            for i in range(1,len(current)-length):
                if (i & 3)==0 and time.monotonic() >= deadline:
                    break
                j=i+length
                a,b,c,d=current[i-1],current[i],current[j-1],current[j]
                removed=p.distance(a,b)+p.distance(c,d)-p.distance(a,d)
                shorter=current[:i]+current[j:]
                for k in range(1,len(shorter)):
                    u,v=shorter[k-1],shorter[k]
                    added=p.distance(u,b)+p.distance(c,v)-p.distance(u,v)
                    delta=added-removed
                    if delta<best_delta:
                        best_delta=delta
                        best=(i,j,k)
        if best is None:
            break
        i,j,k=best
        block=current[i:j]
        shorter=current[:i]+current[j:]
        challenger=shorter[:k]+block+shorter[k:]
        # This is a travel-cost-only transformation. Guard the exact invariant
        # against accidental indexing/float errors before changing state.
        if (len(challenger)!=len(current) or
            set(challenger)!=set(current) or
            p.cost(challenger)>p.cost(current)-1e-8):
            break
        current=challenger
    return current


def best_prize_exchange(p: Problem, route: list[int], deadline: float,
                        max_moves: int = 6) -> list[int]:
    """Maximum-prize 1-for-1 exchange with O(1) marginal edge costs.

    The earlier swap_improve constructed and re-scored an entire trial tour
    for each unvisited candidate, and inspected only the top 40 outsiders.
    This method checks all outsiders with local edge deltas and rebuilds only
    the single chosen improving tour. An unchanged incumbent remains valid.
    """
    current=route[:]
    for move in range(max_moves):
        if time.monotonic()>=deadline:
            break
        incumbent_prize=p.prize(current)
        incumbent_time=p.cost(current)
        available=[c for c in p.cities if c not in set(current)]
        if not available:
            break
        chosen=None
        best_key=None
        for i in range(1,len(current)-1):
            if time.monotonic()>=deadline:
                break
            removed=current[i]
            shorter=current[:i]+current[i+1:]
            a,b,d=current[i-1],removed,current[i+1]
            shorter_time=incumbent_time-p.distance(a,b)-p.distance(b,d)+p.distance(a,d)
            for city in available:
                gain=p.prizes[city]-p.prizes[removed]
                if gain<=0:
                    continue
                for k in range(1,len(shorter)):
                    u,v=shorter[k-1],shorter[k]
                    new_time=shorter_time+p.distance(u,city)+p.distance(city,v)-p.distance(u,v)
                    if new_time>p.limit:
                        continue
                    key=(gain,-new_time,-city,-i,-k)
                    if best_key is None or key>best_key:
                        best_key=key
                        chosen=(i,city,k)
        if chosen is None:
            break
        i,city,k=chosen
        shorter=current[:i]+current[i+1:]
        challenger=shorter[:k]+[city]+shorter[k:]
        if (p.cost(challenger)>p.limit or
            p.prize(challenger)<=incumbent_prize):
            break
        current=challenger
    return current


def greedy(p: Problem, mode: str, deadline: float) -> list[int]:
    starts = pair_seeds(p, mode, count=1)
    if not starts:
        raise ValueError('No feasible tour with depot plus two distinct cities')
    return extend(p, starts[0], mode, deadline, random.Random(0))


def multistart(p: Problem, deadline: float) -> list[int]:
    all_starts = pair_seeds(p, 'ratio', 7) + pair_seeds(p, 'prize', 7)
    if not all_starts:
        raise ValueError('No feasible tour with depot plus two distinct cities')
    best = None
    rng = random.Random(42719)
    for idx, seed in enumerate(all_starts):
        if time.monotonic() >= deadline:
            break
        mode = ['randomized', 'greedy_prize', 'greedy_ratio'][idx % 3]
        route = extend(p, seed, mode, deadline, rng)
        route = swap_improve(p, route, deadline)
        route = extend(p, route, 'greedy_ratio', deadline, rng)
        if better(p, route, best):
            best = route
    return best or all_starts[0]


def exact_dp(p: Problem, deadline: float) -> tuple[list[int], bool]:
    """Held-Karp subset DP: optimal selected cities & tour for n <= 14.

    A completed DP is an exact proof of optimality for this public OP model.
    If it runs out of time, return the best feasible route found, not a proof.
    """
    nodes = [c for c in p.cities if c != p.depot]
    m = len(nodes)
    if m > 13:
        raise ValueError('Exact DP intentionally limited to <= 14 total cities')
    if m < 2:
        raise ValueError('Tour requires at least two nondepot cities')
    tables: list[dict[int, int]] = [{} for _ in range(1 << m)]
    parents: dict[tuple[int, int], int | None] = {}
    best_score = -1
    best_time = math.inf
    best_endpoint = None
    best_mask = 0
    completed = True
    prizes = [p.prizes[c] for c in nodes]
    subset_prize = [0] * (1 << m)
    for mask in range(1, 1 << m):
        if time.monotonic() >= deadline:
            completed = False
            break
        bit = mask & -mask
        idx = bit.bit_length() - 1
        subset_prize[mask] = subset_prize[mask ^ bit] + prizes[idx]
        for j in range(m):
            chosen = 1 << j
            if not (mask & chosen):
                continue
            prev_mask = mask ^ chosen
            if prev_mask == 0:
                best_path, parent = p.distance(p.depot, nodes[j]), None
            else:
                options = ((oldcost + p.distance(nodes[k], nodes[j]), k)
                           for k, oldcost in tables[prev_mask].items())
                best_path, parent = min(options, default=(math.inf, None))
            if math.isinf(best_path):
                continue
            tables[mask][j] = best_path
            parents[(mask, j)] = parent
            total_time = best_path + p.distance(nodes[j], p.depot)
            value = subset_prize[mask]
            if mask.bit_count() >= 2 and total_time <= p.limit and (value > best_score or (value == best_score and total_time < best_time)):
                best_score, best_time, best_mask, best_endpoint = value, total_time, mask, j
    if best_endpoint is None:
        raise ValueError('No feasible route found before DP deadline')
    reverse_path = []
    mask, j = best_mask, best_endpoint
    while j is not None:
        reverse_path.append(nodes[j])
        old = parents[(mask, j)]
        mask ^= (1 << j)
        j = old
    return [p.depot] + reverse_path[::-1] + [p.depot], completed


def beam_construct(p: Problem, deadline: float, width: int = 96) -> list[int]:
    """Resource-constrained beam search, then insertion to optimize the tour.

    This is a distinct partial-path method, not a rerun of the insertion heuristic.
    Returns only a feasible tour (depot and at least two distinct cities).
    """
    seeds = pair_seeds(p, 'ratio', 1)
    if not seeds:
        raise ValueError('No feasible tour with depot plus two distinct cities')
    best = seeds[0]
    # The older code returned a two-city seed above 60 cities. A bounded
    # sparse beam now explores those larger instances, without changing the
    # existing greedy/LNS incumbent or claiming exhaustive optimization.
    large = len(p.cities) > 60
    if large:
        width=min(width,32)
        # Prize per optimistic depot-distance ranks promising cities;
        # unlisted cities remain available to greedy insertion/LNS.
        nodes=sorted((x for x in p.cities if x!=p.depot),
                     key=lambda x:(-p.prizes[x]/max(1,p.distance(p.depot,x)),
                                   -p.prizes[x],x))[:180]
    else:
        nodes=[x for x in p.cities if x!=p.depot]
    best_prize = p.prize(best)
    current = [(0, p.depot, (p.depot,), 0)]  # (cost so far, last, path, prize)
    max_depth = min(len(nodes), 23 if large else 35)
    for depth in range(1, max_depth + 1):
        if time.monotonic() >= deadline: break
        expanded = []
        for travel, last, path, score in current:
            if time.monotonic() >= deadline: break
            visited = set(path)
            for dest in nodes:
                if dest in visited: continue
                leg = p.distance(last, dest)
                nxt_time = travel + leg
                if nxt_time + p.distance(dest,p.depot) > p.limit: continue
                nxt = path + (dest,)
                value = score + p.prizes[dest]
                if depth >= 2 and (value>best_prize or (value==best_prize and nxt_time+p.distance(dest,p.depot)<p.cost(best))):
                    best=[*nxt,p.depot]
                    best_prize=value
                expanded.append((nxt_time,dest,nxt,value))
        if not expanded:break
        # Two complementary selection principles: high prize and high reward/time,
        # with route diversity to avoid collapsing onto one prefix.
        expanded.sort(key=lambda x:(-x[3],x[0]))
        primary=expanded[:max(1,width//2)]
        others=sorted(expanded,key=lambda x:(-x[3]/max(1,x[0]+p.distance(x[1],p.depot)),x[0]))
        dedup = {s[2]: s for s in primary}
        for item in others:
            if len(dedup)>=width:break
            dedup[item[2]]=item
        current=list(dedup.values())
    return two_opt(p,best,deadline)


def local_neighborhood(p: Problem, start_route: list[int], deadline: float) -> list[int]:
    """Destroy-repair / reverse move tests, retain a valid anytime incumbent."""
    incumbent = start_route[:]
    rng=random.Random(9817)
    steps=0
    while time.monotonic()<deadline and steps<200:
        steps+=1
        internal = incumbent[1:-1]
        if len(internal)<=2:break
        # Reverse reasoning: find whether dropping a point buys room for richer points.
        take=min(len(internal)-2,1+(steps%3))
        if take<=0:break
        if steps%2:
            # Cheapest loss of value per distance saved.
            ranked=sorted(range(len(internal)),key=lambda i:(p.prizes[internal[i]]+1)/(1+max(0,
                p.distance(incumbent[i],internal[i])+p.distance(internal[i],incumbent[i+2])-
                p.distance(incumbent[i],incumbent[i+2]))))
            remove=set(ranked[:take])
        else:
            remove=set(rng.sample(range(len(internal)),take))
        reduced=[p.depot]+[c for i,c in enumerate(internal) if i not in remove]+[p.depot]
        if len(reduced)<4:continue
        test_deadline=min(deadline,time.monotonic()+0.20)
        proposal=extend(p,reduced,'randomized' if steps%3==0 else 'greedy_ratio',test_deadline,rng)
        proposal=swap_improve(p,proposal,test_deadline)
        if better(p,proposal,incumbent):incumbent=proposal
    return incumbent


def cp_sat_circuit(p:Problem, deadline:float,
                   incumbent:list[int]|None=None) -> tuple[list[int], bool]:
    """Exact CP-SAT single tour formulation (optional, Open Source OR-Tools).

    With AddCircuit: unvisited nodes use self-loops; depot cannot self-loop;
    no disconnected subtours. A returned OPTIMAL is a genuine CP-SAT proof
    for the encoded OP mathematical model, independently checked afterwards.
    """
    from ortools.sat.python import cp_model
    if len(p.cities)>80:raise ValueError('CP-SAT deliberately bounded to <=80 cities')
    cities=p.cities
    m=cp_model.CpModel()
    arcs=[]
    chosen=[]
    selected={}
    arc_vars={}
    for i, city in enumerate(cities):
        if city!=p.depot:
            off=m.NewBoolVar(f'drop_{i}')
            y=m.NewBoolVar(f'use_{i}')
            m.Add(y+off==1)
            selected[i]=y
            arcs.append((i,i,off))
            arc_vars[i,i]=off
        for j, other in enumerate(cities):
            if i==j:continue
            arc=m.NewBoolVar(f'a_{i}_{j}')
            arcs.append((i,j,arc))
            chosen.append((i,j,arc))
            arc_vars[i,j]=arc
    m.AddCircuit(arcs)
    m.Add(sum(p.distance(cities[i],cities[j])*var for i,j,var in chosen)<=p.limit)
    m.Add(sum(selected.values())>=2)
    m.Maximize(sum(p.prizes[cities[i]]*var for i,var in selected.items()))
    if incumbent is not None:
        city_index={city:i for i,city in enumerate(cities)}
        used={city_index[city] for city in incumbent[1:-1]}
        route_edges={(city_index[a],city_index[b])
                     for a,b in zip(incumbent,incumbent[1:])}
        for i,var in selected.items():m.AddHint(var,int(i in used))
        for edge,var in arc_vars.items():
            if edge[0]==edge[1]:m.AddHint(var,int(edge[0] not in used))
            else:m.AddHint(var,int(edge in route_edges))
    solver=cp_model.CpSolver()
    solver.parameters.max_time_in_seconds=max(0.02,deadline-time.monotonic()-0.25)
    solver.parameters.num_search_workers=2
    solver.parameters.random_seed=815
    status=solver.Solve(m)
    if status not in (cp_model.OPTIMAL,cp_model.FEASIBLE):
        raise ValueError('CP-SAT did not return a feasible OP cycle')
    successors={i:j for i,j,v in chosen if solver.Value(v)}
    depot_i=cities.index(p.depot)
    cur=depot_i
    route=[p.depot]
    for _ in range(len(cities)+1):
        cur=successors[cur]
        route.append(cities[cur])
        if cur==depot_i:break
    if route[-1]!=p.depot or len(set(route[:-1]))!=len(route)-1 or len(route)<4 or p.cost(route)>p.limit:
        raise AssertionError('CP-SAT extracted tour violated independent route check')
    return route, status==cp_model.OPTIMAL


def build_solution(p: Problem, route: list[int]) -> dict:
    return {
        'objective_value': p.prize(route),
        'visited_nodes': route[:-1],
        'edges': [[a, b] for a, b in zip(route, route[1:])],
        'tour': route,
    }


def run_method(instance: dict, method: str, time_limit_s: float = 60) -> tuple[dict, dict]:
    p=parse_problem(instance)
    start=time.monotonic()
    budget=max(0.03,min(max(float(time_limit_s)-3.0,0.03),float(time_limit_s)*0.82,47.0))
    deadline=start+budget
    proof=False
    if method in ('greedy_ratio','greedy_prize'):
        route=greedy(p,method,deadline)
    elif method=='multistart':
        route=multistart(p,deadline)
    elif method=='exact_dp':
        route,proof=exact_dp(p,deadline)
    elif method=='beam':
        route=beam_construct(p,deadline)
    elif method=='lns':
        seed=greedy(p,'greedy_ratio',deadline)
        route=local_neighborhood(p,seed,deadline)
    elif method=='cp_sat':
        route,proof=cp_sat_circuit(p,deadline)
    elif method=='portfolio':
        candidates=[]
        # Reliable fallback before any expensive search or optional dependency.
        phase1=min(deadline,start+max(0.08,budget*0.12))
        for key in ('greedy_ratio','greedy_prize'):
            try:candidates.append(greedy(p,key,phase1))
            except ValueError:pass
        if not candidates:raise ValueError('No feasible route found')
        # Full prize collection is a mathematical upper-bound certificate.
        # Don't spend the remaining budget re-solving an achieved optimum.
        if any(p.prize(r)==sum(p.prizes.values()) for r in candidates):
            proof=True
        if not proof and len(p.cities)<=14 and time.monotonic()<deadline:
            try:
                candidate,proved=exact_dp(p,min(deadline,start+max(0.3,budget*0.37)))
                candidates.append(candidate)
                proof=proved
            except ValueError:pass
        if not proof and time.monotonic()<deadline:
            phase2=min(deadline,start+max(0.12,budget*0.35))
            candidates.append(multistart(p,phase2))
        if not proof and 6<len(p.cities)<=60 and time.monotonic()<deadline:
            try:candidates.append(beam_construct(p,min(deadline,start+max(0.14,budget*0.47))))
            except ValueError:pass
        if not proof and len(p.cities)>60 and time.monotonic()<deadline:
            try:
                beam_deadline=min(deadline,start+max(0.25,budget*0.61))
                proposal=beam_construct(p,beam_deadline,width=32)
                # Complete the partially selected subset using bounded prize
                # insertion, not just its best seed/beam prefix.
                if time.monotonic()<beam_deadline:
                    proposal=extend(p,proposal,'greedy_ratio',beam_deadline,random.Random(7819))
                candidates.append(proposal)
            except ValueError:
                pass
        if not proof and 14<len(p.cities)<=55 and time.monotonic()<deadline:
            try:
                incumbent=min(candidates,key=lambda r:(-p.prize(r),p.cost(r)))
                cp_route,cp_proof=cp_sat_circuit(
                    p,min(deadline,start+max(0.18,budget*0.81)),incumbent)
                candidates.append(cp_route)
                proof=cp_proof
            except (ImportError,ValueError):pass  # optional OR-Tools
        route=min(candidates,key=lambda r:(-p.prize(r),p.cost(r)))
        # Reversible optimization of tour order before the expensive
        # destroy-and-repair search. Or-opt preserves prize; a full-key
        # exchange can then replace a low-reward city within the same budget.
        if not proof and time.monotonic()<deadline-0.5:
            local_end=min(deadline,time.monotonic()+max(0.20,min(1.30,budget*0.055)))
            proposal=relocate_short_blocks(p,route,local_end)
            if time.monotonic()<local_end:
                proposal=extend(p,proposal,'greedy_ratio',local_end,random.Random(31415))
            if time.monotonic()<local_end:
                proposal=best_prize_exchange(p,proposal,local_end)
            if better(p,proposal,route):
                route=proposal
                candidates.append(proposal)
        if not proof and time.monotonic()<deadline:
            route=local_neighborhood(p,route,deadline)
            # Local improvement is compared with all independent candidates.
            route=min([route,*candidates],key=lambda r:(-p.prize(r),p.cost(r)))
    else:
        raise ValueError(f'Unknown method {method!r}')
    elapsed=time.monotonic()-start
    if len(route)<4 or len(set(route[:-1]))<3 or p.cost(route)>p.limit or len(route)!=len(set(route[:-1]))+1:
        raise AssertionError(f'Proposed {method} route violates published constraints')
    return build_solution(p,route),{
        'method':method,'elapsed_s':elapsed,'time_used':p.cost(route),
        'time_budget':p.limit,'optimality_proven':proof,
    }


def solve(instance:dict,time_limit_s:int)->dict:
    """Public starter agent contract, and default Main-track solver entrypoint."""
    solution,_=run_method(instance,'portfolio',time_limit_s)
    return solution


def main() -> None:
    ap = argparse.ArgumentParser(description='FrontierOR OP solver, standalone Main-track format')
    ap.add_argument('--problem', default='fischetti1998')
    ap.add_argument('--instance', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--time-limit', type=float, default=60)
    ap.add_argument('--method', default='portfolio', choices=['portfolio','greedy_ratio','greedy_prize','multistart','exact_dp','beam','lns','cp_sat'])
    args = ap.parse_args()
    if args.problem != 'fischetti1998':
        ap.error('This solver implements only fischetti1998')
    instance = json.loads(Path(args.instance).read_text(encoding='utf-8'))
    solution, _meta = run_method(instance, args.method, args.time_limit)
    from _runtime_core import write_solution
    write_solution(args.output, solution)


if __name__ == '__main__':
    main()
