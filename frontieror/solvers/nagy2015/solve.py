"""FrontierOR nagy2015: verified delivery/pickup routing method portfolio.

Baseline: every customer's delivery and pickup is fulfilled together by
a single vehicle. Candidate: savings-driven pairing, deterministic
2-opt within delivery/pickup phases, and bounded one-customer transfers.
Feasibility is checked at every promotion. No model/API calls at runtime.
"""
from __future__ import annotations
import argparse
import heapq
import json
import math
import time


def parse(raw):
    n = int(raw["num_customers"])
    cap = float(raw["vehicle_capacity"])
    rows = {int(x["id"]): x for x in raw["customers"]}
    if set(rows) != set(range(1, n+1)) or cap <= 0:
        raise ValueError("Unrecognized VRP customer or capacity")
    deliveries = [0.0] + [float(rows[i]["delivery_demand"]) for i in range(1,n+1)]
    pickups = [0.0] + [float(rows[i]["pickup_demand"]) for i in range(1,n+1)]
    d = [[float(x) for x in row] for row in raw["distance_matrix"]]
    if len(d) != n+1 or any(len(row) != n+1 for row in d):
        raise ValueError("Wrong distance dimensions")
    return n, cap, deliveries, pickups, d


def original(node, n):
    return node if node <= n else node - n


def travel(p, a, b):
    return p[4][original(a,p[0])][original(b,p[0])]


def routecost(p, r):
    return math.fsum(travel(p,a,b) for a,b in zip(r,r[1:]))


def feasible(p,r):
    n, cap, deliveries, pickups, _ = p
    if len(r) < 3 or r[0] != 0 or r[-1] != 0:
        return False
    if any(not (1 <= i <= 2*n) for i in r[1:-1]):
        return False
    # All deliveries leave the depot; pickups accumulate through the route.
    load = math.fsum(deliveries[i] for i in r[1:-1] if i <= n)
    if load > cap + 1e-7 or load < -1e-7:
        return False
    for node in r[1:-1]:
        if node <= n:
            load -= deliveries[node]
        else:
            load += pickups[node-n]
        if load > cap + 1e-7 or load < -1e-7:
            return False
    return True


def verify(p,routes):
    n, cap, deliveries, pickups, d = p
    seen = []
    for route in routes:
        if not feasible(p,route):
            return False
        seen.extend(route[1:-1])
    return len(seen) == 2*n and set(seen) == set(range(1,2*n+1)) and len(seen) == len(set(seen))


def score(p, routes):
    return math.fsum(routecost(p,r) for r in routes)


def separate_routes(p):
    return [[0,i,i+p[0],0] for i in range(1,p[0]+1)]


def merge_pair(p,a,b):
    """Compare bidirectional concatenations of pickup and delivery phases."""
    n, cap, deliveries, pickups, _ = p
    d1 = [x for x in a[1:-1] if x <= n]
    d2 = [x for x in b[1:-1] if x <= n]
    p1 = [x for x in a[1:-1] if x > n]
    p2 = [x for x in b[1:-1] if x > n]
    ds = math.fsum(deliveries[x] for x in d1+d2)
    ps = math.fsum(pickups[x-n] for x in p1+p2)
    if max(ds,ps) > cap + 1e-7:
        return None
    best = None
    bestcost = math.inf
    for first_deliveries, last_deliveries in ((d1,d2),(d2,d1)):
        for first_pickups,last_pickups in ((p1,p2),(p2,p1)):
            r = [0,*first_deliveries,*last_deliveries,*first_pickups,*last_pickups,0]
            c = routecost(p,r)
            if c < bestcost and feasible(p,r):
                bestcost,best = c,r
    return (bestcost,best) if best else None


def savings(p, deadline):
    """Sparse update of route-pair savings; avoids O(number_of_merges*candidates)."""
    routes = {i:[0,i,i+p[0],0] for i in range(1,p[0]+1)}
    heap = []
    serial = 0
    def consider(i,j):
        nonlocal serial
        if time.monotonic() >= deadline:
            return
        # Memory guard: the original quadratic candidate heap grows without
        # bound on unusually large instances. Baseline remains valid.
        if len(heap)>=60000:
            return
        candidate=merge_pair(p,routes[i],routes[j])
        if candidate is None:
            return
        merged_cost, merged = candidate
        gain = routecost(p,routes[i]) + routecost(p,routes[j]) - merged_cost
        if gain <= 1e-9:
            return
        serial += 1
        heapq.heappush(heap,(-gain,serial,i,j,merged))
    keys=list(routes)
    for i, a in enumerate(keys):
        for b in keys[i+1:]:
            if time.monotonic() >= deadline:
                break
            consider(a,b)
    next_id=p[0]+1
    while heap and time.monotonic() < deadline:
        neg,_,i,j,merged=heapq.heappop(heap)
        if i not in routes or j not in routes:
            continue
        # Only immutable old routes enter the heap. No recomputation necessary.
        del routes[i]
        del routes[j]
        routes[next_id]=merged
        idx=next_id
        next_id+=1
        for other in list(routes):
            if other!=idx and time.monotonic() < deadline:
                consider(other,idx)
    result=list(routes.values())
    return result if verify(p,result) else None


def phase_two_opt(p, route, deadline):
    """Shorten a route without violating its delivery-first and pickup-last guarantee."""
    n = p[0]
    current=route[:]
    while time.monotonic() < deadline:
        best_gain = 1e-7
        best = None
        # Reversals cannot cross the delivery/pickup boundary.
        split = 1
        while split < len(current)-1 and current[split] <= n:
            split += 1
        for low,hi in ((1,split),(split,len(current)-1)):
            for i in range(low,hi-1):
                if time.monotonic() >= deadline:
                    break
                a,b=current[i-1],current[i]
                for j in range(i+1,hi):
                    c,d=current[j],current[j+1]
                    gain=travel(p,a,b)+travel(p,c,d)-travel(p,a,c)-travel(p,b,d)
                    if gain > best_gain:
                        best_gain,best=gain,(i,j)
        if best is None:
            break
        i,j=best
        current[i:j+1]=reversed(current[i:j+1])
    return current


def cross_phase_two_opt(p,route,deadline):
    """Swap delivery/pickup positions only when the complete load trajectory is valid."""
    current=route[:]
    while time.monotonic()<deadline:
        best_delta=-1e-7
        best=None
        for i in range(1,len(current)-2):
            if time.monotonic()>=deadline:
                break
            a,b=current[i-1],current[i]
            for j in range(i+1,len(current)-1):
                c,d=current[j],current[j+1]
                delta=(travel(p,a,c)+travel(p,b,d)
                       -travel(p,a,b)-travel(p,c,d))
                if delta < best_delta:
                    trial=current[:i]+list(reversed(current[i:j+1]))+current[j+1:]
                    if feasible(p,trial):
                        best_delta,best=delta,trial
        if best is None:
            break
        current=best
    return current


def relocation(p, routes, deadline):
    """Bounded strict-improvement operator: move an entire paired request."""
    if not routes or time.monotonic() > deadline:
        return routes
    n=p[0]
    incumbent=[r[:] for r in routes]
    bestcost=score(p,incumbent)
    for _ in range(2):
        changed=False
        for a in range(len(incumbent)):
            if time.monotonic() >= deadline:
                break
            for uid in [x for x in incumbent[a][1:-1] if x<=n]:
                if time.monotonic() >= deadline:
                    break
                bnode=uid+n
                base=[x for x in incumbent[a] if x not in (uid,bnode)]
                if len(base) < 3:
                    continue
                for b in range(len(incumbent)):
                    if b==a or time.monotonic() >= deadline:
                        continue
                    other=incumbent[b]
                    # Constant-time delta is enough to rank candidates, but verify exact loads.
                    split=next((k for k in range(1,len(other)-1) if other[k]>n),len(other)-1)
                    candidates=[]
                    for i in range(1,split+1):
                        for j in range(i+1,len(other)+1):
                            if j <= i:
                                continue
                            if time.monotonic() >= deadline:
                                break
                            trial=other[:i]+[uid]+other[i:j-1]+[bnode]+other[j-1:]
                            if feasible(p,trial):
                                candidates.append((routecost(p,trial),trial))
                    for _,trial in sorted(candidates, key=lambda x:x[0])[:2]:
                        proposal=[r[:] for r in incumbent]
                        proposal[a]=base
                        proposal[b]=trial
                        if verify(p,proposal):
                            cost=score(p,proposal)
                            if cost < bestcost-1e-7:
                                incumbent,bestcost=proposal,cost
                                changed=True
                                break
                    if changed:
                        break
                if changed:
                    break
            if changed:
                break
        if not changed:
            break
    return incumbent


def detailed(p,route):
    n,_,delivery,pickup,_=p
    result=[]
    for node in route:
        if node == 0:
            result.append({"node_id":0,"role":"depot","customer_id":0,
                           "delivery_quantity":0,"pickup_quantity":0})
        elif node <= n:
            result.append({"node_id":node,"role":"linehaul","customer_id":node,
                           "delivery_quantity":delivery[node],"pickup_quantity":0})
        else:
            c=node-n
            result.append({"node_id":node,"role":"backhaul","customer_id":c,
                           "delivery_quantity":0,"pickup_quantity":pickup[c]})
    return result


def solve(instance,time_limit_s):
    start=time.monotonic()
    deadline=start + max(0.1,float(time_limit_s)-2.8)
    p=parse(instance)
    baseline=separate_routes(p)
    if not verify(p,baseline):
        raise RuntimeError("No valid baseline; individual demand exceeds capacity")
    best=baseline
    # Negative-cost savings only. Every better candidate must be independently feasible.
    left=deadline-time.monotonic()
    if left > 0.3:
        candidate=savings(p,min(deadline,time.monotonic()+min(15.0,left*0.52)))
        if candidate is not None and verify(p,candidate) and score(p,candidate) < score(p,best)-1e-7:
            best=candidate
    if time.monotonic() < deadline:
        tuned=[phase_two_opt(p,r,min(deadline,time.monotonic()+0.4)) for r in best]
        if verify(p,tuned) and score(p,tuned) < score(p,best)-1e-7:
            best=tuned
    if time.monotonic() + 0.5 < deadline and len(best) < 100:
        tuned=relocation(p,best,min(deadline,time.monotonic()+10.0))
        if verify(p,tuned) and score(p,tuned) < score(p,best)-1e-7:
            best=tuned
    # Cross-phase reversal can improve on strictly delivery-first routes.
    # It never promotes a reversal that violates the actual vehicle load.
    if time.monotonic()+0.25 < deadline:
        phase_deadline=min(deadline,time.monotonic()+2.0)
        tuned=[cross_phase_two_opt(p,r,phase_deadline) for r in best]
        if verify(p,tuned) and score(p,tuned)<score(p,best)-1e-7:
            best=tuned
    assert verify(p,best)
    return {"objective_value":score(p,best),
            "routes":best,
            "routes_detailed":[detailed(p,r) for r in best]}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--problem",default="nagy2015")
    parser.add_argument("--instance",required=True)
    parser.add_argument("--output",required=True)
    parser.add_argument("--time-limit",type=float,default=60)
    arg=parser.parse_args()
    with open(arg.instance,encoding="utf-8") as f:
        data=json.load(f)
    result=solve(data,arg.time_limit)
    from _runtime_core import write_solution
    write_solution(arg.output, result)


if __name__=="__main__":
    main()
