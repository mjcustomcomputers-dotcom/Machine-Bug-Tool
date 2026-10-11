"""FrontierOR bodur2017: scenario-wise capacitated location/transport.

Verified constructive all-open recourse, reduced-cost facility closure,
and time-limited sparse HiGHS extensive-form mixed integer programming.
All constraints and objective independently recomputed before promotion.
"""
from __future__ import annotations

import os
# Limit BLAS thread amplification under the organizer's two-vCPU cap.
# SciPy/NumPy are imported lazily after this module-level configuration.
os.environ["OPENBLAS_NUM_THREADS"]="1"
os.environ["MKL_NUM_THREADS"]="1"
os.environ["NUMEXPR_NUM_THREADS"]="1"

import argparse
import json
import math
import time


def parse(raw):
    f = int(raw["num_facilities"])
    c = int(raw["num_customers"])
    s = int(raw["num_scenarios"])
    facilities = {int(row["id"]): row for row in raw["facilities"]}
    scenarios = {int(row["id"]): row for row in raw["scenarios"]}
    if set(facilities) != set(range(f)) or set(scenarios) != set(range(s)):
        raise ValueError("Facility/scenario identifier mismatch")
    costs = [[float(x) for x in row] for row in raw["transportation_costs"]]
    if len(costs) != f or any(len(row) != c for row in costs):
        raise ValueError("Wrong transport cost matrix")
    cap = [float(facilities[i]["capacity"]) for i in range(f)]
    fixed = [float(facilities[i]["opening_cost"]) for i in range(f)]
    demand = [[float(x) for x in scenarios[k]["demands"]] for k in range(s)]
    if any(len(row) != c for row in demand):
        raise ValueError("Wrong scenario demand length")
    prob = [float(scenarios[k]["probability"]) for k in range(s)]
    return f,c,s,cap,fixed,costs,demand,prob


def check(p,opened,ship,eps=2e-5):
    f,c,s,cap,fixed,costs,demand,prob=p
    opened=set(opened)
    if any(not isinstance(i,int) or not 0<=i<f for i in opened):
        return False
    if len(ship)!=s:
        return False
    maxd=max((math.fsum(x) for x in demand),default=0)
    if math.fsum(cap[i] for i in opened)+eps*max(1,maxd)<maxd:
        return False
    for k in range(s):
        matrix=ship[k]
        if len(matrix)!=f or any(len(row)!=c for row in matrix):
            return False
        for i in range(f):
            if any(not math.isfinite(x) or x < -eps for x in matrix[i]):
                return False
            total=math.fsum(matrix[i])
            if total> (cap[i] if i in opened else 0.) + eps*max(1,cap[i]):
                return False
        for j in range(c):
            provided=math.fsum(matrix[i][j] for i in range(f))
            if provided+eps*max(1,demand[k][j]) < demand[k][j]:
                return False
    return True


def objective(p,opened,ship):
    f,c,s,cap,fixed,costs,demand,prob=p
    return (math.fsum(fixed[i] for i in opened) +
            math.fsum(prob[k] * math.fsum(costs[i][j]*ship[k][i][j]
                        for i in range(f) for j in range(c))
                      for k in range(s)))


def greedy_transport(p,opened):
    """Every facility can serve every customer; complete bipartite transport."""
    f,c,s,cap,fixed,costs,demand,prob=p
    opened=sorted(set(opened))
    if not opened and any(any(d>1e-9 for d in row) for row in demand):
        return None
    result=[]
    ranks=[sorted(opened,key=lambda i:(costs[i][j],i)) for j in range(c)]
    for k in range(s):
        remainder=[cap[i] if i in opened else 0. for i in range(f)]
        matrix=[[0.]*c for _ in range(f)]
        # Scarce customers first: prioritize those with expensive second choice.
        jobs=list(range(c))
        jobs.sort(key=lambda j:(-(costs[ranks[j][1]][j]-costs[ranks[j][0]][j])
                               if len(ranks[j])>1 else -1e9,-demand[k][j]))
        for j in jobs:
            needed=demand[k][j]
            for i in ranks[j]:
                take=min(remainder[i],needed)
                if take>0:
                    matrix[i][j]=take
                    remainder[i]-=take
                    needed-=take
                if needed<=1e-8:
                    break
            if needed>1e-6*max(1,demand[k][j]):
                return None
        result.append(matrix)
    return result if check(p,opened,result) else None


def improve_transport_exchanges(p,opened,ship,deadline):
    """Improve fixed-opening recourse with capacity-safe residual exchanges.

    Direct moves consume spare capacity. Pair exchanges preserve both facility
    loads and customer totals, so every accepted step remains feasible without
    SciPy. Rebuilding the sparse positive-flow list between sweeps also exposes
    improvements created by an earlier exchange.
    """
    if ship is None or time.monotonic() >= deadline:
        return ship
    f,c,s,cap,fixed,costs,demand,prob=p
    opened=sorted(set(opened))
    candidate=[[row[:] for row in matrix] for matrix in ship]
    original_value=objective(p,opened,ship)
    for matrix in candidate:
        if time.monotonic() >= deadline:
            break
        for _ in range(4):
            changed=False
            free={i:max(0.0,cap[i]-math.fsum(matrix[i])) for i in opened}
            arcs=[(i,j) for i in opened for j in range(c)
                  if matrix[i][j] > 1e-10]
            # Move flow directly to a cheaper facility with unused capacity.
            moves=[]
            for i,j in arcs:
                for h in opened:
                    saving=costs[i][j]-costs[h][j]
                    if h != i and free[h] > 1e-10 and saving > 1e-10:
                        moves.append((-saving,i,h,j))
            moves.sort()
            for z,(_,i,h,j) in enumerate(moves):
                if (z & 255) == 0 and time.monotonic() >= deadline:
                    break
                amount=min(matrix[i][j],free[h])
                if amount <= 1e-10:
                    continue
                matrix[i][j]-=amount
                matrix[h][j]+=amount
                free[i]+=amount
                free[h]-=amount
                changed=True
            if time.monotonic() >= deadline:
                break
            # Exchange two assignments when the crossed arcs are cheaper.
            arcs=[(i,j) for i in opened for j in range(c)
                  if matrix[i][j] > 1e-10]
            # Greedy transport is sparse (normally <= customers+facilities).
            # Cap pathological dense caller input while retaining deterministic
            # high-cost arcs, which offer the largest repair opportunity.
            if len(arcs)>900:
                arcs=sorted(arcs,key=lambda z:(-costs[z[0]][z[1]],z))[:900]
            checks=0
            for a,(i,j) in enumerate(arcs):
                for h,k2 in arcs[a+1:]:
                    checks+=1
                    if (checks & 1023) == 0 and time.monotonic() >= deadline:
                        break
                    if i==h or j==k2:
                        continue
                    saving=(costs[i][j]+costs[h][k2]
                            -costs[h][j]-costs[i][k2])
                    if saving <= 1e-10:
                        continue
                    amount=min(matrix[i][j],matrix[h][k2])
                    if amount <= 1e-10:
                        continue
                    matrix[i][j]-=amount
                    matrix[h][k2]-=amount
                    matrix[h][j]+=amount
                    matrix[i][k2]+=amount
                    changed=True
                if time.monotonic() >= deadline:
                    break
            if not changed or time.monotonic() >= deadline:
                break
    if (check(p,opened,candidate) and
            objective(p,opened,candidate)<original_value-1e-7):
        return candidate
    return ship


def try_closures(p,opened,ship,deadline):
    """Maximize opening-cost savings under conservative recourse recomputation."""
    f,c,s,cap,fixed,_,demand,_=p
    best_opened=set(opened)
    best_ship=ship
    best_score=objective(p,best_opened,ship)
    maxd=max((math.fsum(row) for row in demand),default=0)
    # Continue the descent until no single closure helps or the bounded slice
    # expires. The former two-pass cap left many needless opening charges on
    # large instances where the extensive MIP is intentionally skipped.
    for iteration in range(f):
        changed=False
        for i in sorted(best_opened,key=lambda j:(-fixed[j]/max(cap[j],1),-fixed[j])):
            if time.monotonic()>=deadline:
                return best_opened,best_ship
            proposal=best_opened-{i}
            if math.fsum(cap[j] for j in proposal)<maxd-1e-8:
                continue
            candidate=greedy_transport(p,proposal)
            if candidate is None:
                continue
            candidate=improve_transport_exchanges(
                p,proposal,candidate,min(deadline,time.monotonic()+0.08))
            score=objective(p,proposal,candidate)
            if score+1e-7<best_score:
                best_opened,best_ship,best_score=proposal,candidate,score
                changed=True
                break
        if not changed:
            break
    return best_opened,best_ship


def lp_transport(p,opened,deadline):
    """Solve exact scenario recourse LP for fixed openings; use safe fallback."""
    if time.monotonic()>=deadline-0.2:
        return None
    try:
        import numpy as np
        from scipy.sparse import coo_matrix
        from scipy.optimize import linprog
    except ImportError:
        return None
    f,c,s,cap,fixed,costs,demand,prob=p
    choices=sorted(opened)
    nv=len(choices)*c
    if nv>180000 or nv==0:
        return None
    rr,cc,vv=[],[],[]
    for z,i in enumerate(choices):
        for j in range(c):
            idx=z*c+j
            rr.extend((j,c+z))
            cc.extend((idx,idx))
            vv.extend((1.,1.))
    mat=coo_matrix((vv,(rr,cc)),shape=(c+len(choices),nv)).tocsr()
    expenses=np.array([costs[i][j] for i in choices for j in range(c)],dtype=float)
    capacities=np.asarray([cap[i] for i in choices],dtype=float)
    shipped=[]
    for k in range(s):
        available=deadline-time.monotonic()
        if available<0.2:
            return None
        try:
            res=linprog(expenses,A_eq=mat[:c],b_eq=np.asarray(demand[k],dtype=float),
                        A_ub=mat[c:],b_ub=capacities,bounds=(0,None),method="highs",
                        options={"time_limit":max(0.1,available-0.12),"presolve":True})
        except (ValueError,RuntimeError,MemoryError):
            return None
        if not res.success or res.x is None:
            return None
        matrix=[[0.]*c for _ in range(f)]
        for z,i in enumerate(choices):
            for j in range(c):
                matrix[i][j]=max(0.,float(res.x[z*c+j]))
        shipped.append(matrix)
    return shipped if check(p,opened,shipped) else None



def improve_openings_lp(p, opened, ship, deadline):
    """Bounded 1-close / 1-swap descent with exact scenario-wise LP recourse.

    Unlike greedy closure, measure the same true expected objective after
    reoptimizing shipping for each proposed opening configuration.
    """
    f,c,scenarios,cap,fixed,costs,demand,prob=p
    if f>14 or c>100 or scenarios>36 or deadline-time.monotonic()<0.45:
        return opened,ship
    best_open=set(opened)
    best_ship=ship
    best_value=objective(p,best_open,best_ship)
    required=max((math.fsum(row) for row in demand),default=0.0)
    capacity=math.fsum(cap[i] for i in best_open)
    # Deterministic orders: expensive opening first, then cheap replacement.
    for _ in range(2):
        if deadline-time.monotonic()<0.45:
            break
        changed=False
        active=sorted(best_open,key=lambda i:(-fixed[i],i))
        inactive=sorted(set(range(f))-best_open,key=lambda i:(fixed[i],i))
        for leaving in active:
            if deadline-time.monotonic()<0.45:
                break
            choices=[None]+inactive
            for entering in choices:
                if deadline-time.monotonic()<0.45:
                    break
                if entering is None and capacity-cap[leaving]<required-1e-8:
                    continue
                if entering is not None and capacity-cap[leaving]+cap[entering]<required-1e-8:
                    continue
                candidate_open=(best_open-{leaving})|({entering} if entering is not None else set())
                # A lower bound on shipping is zero only when costs nonnegative.
                candidate_fixed=math.fsum(fixed[i] for i in candidate_open)
                if candidate_fixed>=best_value-1e-7 and all(x>=0 for row in costs for x in row):
                    continue
                candidate_ship=lp_transport(p,candidate_open,min(deadline,time.monotonic()+0.65))
                if candidate_ship is None:
                    continue
                value=objective(p,candidate_open,candidate_ship)
                if value<best_value-1e-7 and check(p,candidate_open,candidate_ship):
                    best_open,best_ship,best_value=candidate_open,candidate_ship,value
                    capacity=math.fsum(cap[i] for i in best_open)
                    changed=True
                    break
            if changed:
                break
        if not changed:
            break
    return best_open,best_ship


def extensive_milp(p,deadline):
    """Exact sparse extensive-form MIP; skip models that could exceed memory."""
    f,c,s,cap,fixed,cost,demand,prob=p
    count=f*c*s
    if not count or count>260000 or deadline-time.monotonic()<0.6:
        return None
    try:
        import numpy as np
        from scipy.optimize import Bounds, LinearConstraint, milp
        from scipy.sparse import coo_matrix
    except ImportError:
        return None
    variables=f+count
    # Rows: scenario/customer demand equality, scenario/facility capacity,
    # and total first-stage facility capacity sufficient for any scenario.
    rows,cols,values=[],[],[]
    for i in range(f):
        rows.append(s*c+s*f)
        cols.append(i)
        values.append(cap[i])
    for k in range(s):
        for i in range(f):
            capacityrow=s*c+k*f+i
            rows.append(capacityrow);cols.append(i);values.append(-cap[i])
            for j in range(c):
                idx=f+(k*f+i)*c+j
                rows.extend((k*c+j,capacityrow))
                cols.extend((idx,idx))
                values.extend((1.,1.))
    A=coo_matrix((np.asarray(values,dtype=float),(rows,cols)),shape=(s*c+s*f+1,variables)).tocsr()
    d=np.asarray(demand,dtype=float)
    lb=np.concatenate((d.reshape(-1),np.full(s*f,-np.inf),[float(max(np.sum(d,axis=1)))]))
    ub=np.concatenate((d.reshape(-1),np.zeros(s*f),[np.inf]))
    obj=np.array(fixed+[prob[k]*cost[i][j] for k in range(s)
                         for i in range(f) for j in range(c)],dtype=float)
    integrality=np.zeros(variables,dtype=np.int32)
    integrality[:f]=1
    lower=np.zeros(variables)
    upper=np.full(variables,np.inf)
    upper[:f]=1
    try:
        res=milp(c=obj,integrality=integrality,
                 bounds=Bounds(lower,upper),
                 constraints=LinearConstraint(A,lb,ub),
                 options={"time_limit":max(.1,deadline-time.monotonic()-.15),
                          "mip_rel_gap":0.01,"presolve":True})
    except (ValueError,RuntimeError,MemoryError):
        return None
    if res.x is None:
        return None
    opened={i for i in range(f) if res.x[i]>.5}
    flow=res.x[f:].reshape((s,f,c))
    ship=[[[max(0.,float(flow[k,i,j])) for j in range(c)] for i in range(f)]
          for k in range(s)]
    return (opened,ship) if check(p,opened,ship) else None


def drop_exact_idle(p, opened, ship):
    """V5 exact contraction: close positive-cost never-used facilities.

    Preserve every shipment and all first-stage capacities. This cannot
    worsen a feasible minimization objective and is independent of SciPy.
    """
    if ship is None:
        return opened, ship
    f,c,s,cap,fixed,costs,demand,prob=p
    active=set(opened)
    used=[False]*f
    for scenario in ship:
        for i in active:
            if not used[i] and any(v>1e-11 for v in scenario[i]):
                used[i]=True
    reduced={i for i in active if used[i] or fixed[i]<=0}
    if len(reduced)<len(active) and check(p,reduced,ship):
        return reduced,ship
    return opened,ship


def solve(instance,time_limit_s):
    started=time.monotonic()
    p=parse(instance)
    f,c,s=p[:3]
    seconds=max(0.5,float(time_limit_s))
    reserve=min(6.,max(1.5,seconds*.105))
    deadline=started+max(0.1,seconds-reserve)
    opened=set(range(f))
    # Always construct an original-checker-valid incumbent before any native
    # MILP, and keep this candidate through all subsequent improvements.
    ship=greedy_transport(p,opened)
    if ship is None:
        raise RuntimeError('No valid all-open scenario shipments')
    best_opened,best_ship=drop_exact_idle(p,opened,ship)
    best_value=objective(p,best_opened,best_ship)

    def promote(challenger):
        nonlocal best_opened,best_ship,best_value
        if challenger is None:
            return False
        x,y=challenger
        if not check(p,x,y):
            return False
        x,y=drop_exact_idle(p,x,y)
        val=objective(p,x,y)
        if val<best_value-1e-7:
            best_opened,best_ship,best_value=x,y,val
            return True
        return False

    # Restore the V5 proven objective-first ordering. SciPy HiGHS must get
    # a dedicated early slice while its full extensive model is still small.
    # Large scenario tensors bypass this expensive formulation completely.
    total=f*c*s
    if 0<total<=260000 and deadline-time.monotonic()>1.3:
        early=min(deadline-0.7,time.monotonic()+5.0)
        promote(extensive_milp(p,early))

    # Game-Changer pure-Python residual moves are useful on modest tensors,
    # but a full copy of a 43-million-entry shipment tensor repeats work and
    # steals time from exact V5 idle-facility contraction.
    if total<=800000 and deadline-time.monotonic()>0.7:
        improvement=improve_transport_exchanges(
            p,best_opened,best_ship,min(deadline,time.monotonic()+0.8))
        promote((best_opened,improvement))

    if total<=1000000 and deadline-time.monotonic()>0.8:
        proposal=try_closures(
            p,best_opened,best_ship,min(deadline,time.monotonic()+1.5))
        promote(proposal)

    # LP recourse operates at a fixed opening vector; bound total tensor
    # materialization and retain incumbent if the large LP is unavailable.
    if total<=1200000 and deadline-time.monotonic()>1.0:
        candidate=lp_transport(p,best_opened,min(deadline,time.monotonic()+4.0))
        if candidate is not None:
            promote((best_opened,candidate))

    if deadline-time.monotonic()>1.1:
        x,y=improve_openings_lp(
            p,best_opened,best_ship,min(deadline,time.monotonic()+3.0))
        promote((x,y))

    assert check(p,best_opened,best_ship)
    f,c,s=p[:3]
    return {'objective_value':objective(p,best_opened,best_ship),
            'open_facilities':sorted(best_opened),
            'x':{str(i):int(i in best_opened) for i in range(f)},
            'y':{str(k):{str(i):{str(j):best_ship[k][i][j]
                                      for j in range(c) if best_ship[k][i][j]!=0.0}
                          for i in range(f) if any(v!=0.0 for v in best_ship[k][i])}
                 for k in range(s)}}


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--problem",default="bodur2017")
    ap.add_argument("--instance",required=True)
    ap.add_argument("--output",required=True)
    ap.add_argument("--time-limit",type=float,default=60)
    args=ap.parse_args()
    command_started=time.monotonic()
    with open(args.instance,encoding="utf-8") as fd:
        data=json.load(fd)
    remaining=max(0.5,float(args.time_limit)-(time.monotonic()-command_started))
    result=solve(data,remaining)
    from _runtime_core import write_solution
    write_solution(args.output, result)


if __name__=="__main__":
    main()
