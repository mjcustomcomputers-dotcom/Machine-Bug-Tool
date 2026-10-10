"""FrontierOR bodur2017: scenario-wise capacitated location/transport.

Verified constructive all-open recourse, reduced-cost facility closure,
and time-limited sparse HiGHS extensive-form mixed integer programming.
All constraints and objective independently recomputed before promotion.
"""
from __future__ import annotations

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


def try_closures(p,opened,ship,deadline):
    """Maximize opening-cost savings under conservative recourse recomputation."""
    f,c,s,cap,fixed,_,demand,_=p
    best_opened=set(opened)
    best_ship=ship
    best_score=objective(p,best_opened,ship)
    maxd=max((math.fsum(row) for row in demand),default=0)
    for iteration in range(2):
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


def solve(instance,time_limit_s):
    p=parse(instance)
    deadline=time.monotonic()+max(.1,float(time_limit_s)-2.8)
    opened=set(range(p[0]))
    # Guarantee feasibility first. All-open transport always exists if
    # the published complete facility/customer network has sufficient capacity.
    ship=greedy_transport(p,opened)
    if ship is None:
        raise RuntimeError("Published instance has no feasible all-open transport")
    best_opened,best_ship=opened,ship
    if time.monotonic()<deadline-.5:
        challenger_open,challenger_ship=try_closures(
            p,opened,ship,min(deadline,time.monotonic()+1.5))
        if check(p,challenger_open,challenger_ship) and (
                objective(p,challenger_open,challenger_ship)<objective(p,best_opened,best_ship)-1e-7):
            best_opened,best_ship=challenger_open,challenger_ship
    # Tighten expected shipping cost using each scenario's exact LP recourse.
    if time.monotonic()<deadline-.6:
        lp=lp_transport(p,best_opened,min(deadline,time.monotonic()+4.0))
        if lp is not None and check(p,best_opened,lp) and (
                objective(p,best_opened,lp)<objective(p,best_opened,best_ship)-1e-7):
            best_ship=lp
    if time.monotonic()<deadline-.6:
        challenger=extensive_milp(p,deadline)
        if challenger is not None and check(p,*challenger):
            if objective(p,*challenger)<objective(p,best_opened,best_ship)-1e-7:
                best_opened,best_ship=challenger
    assert check(p,best_opened,best_ship)
    f,c,s=p[:3]
    return {
        "objective_value":objective(p,best_opened,best_ship),
        "open_facilities":sorted(best_opened),
        "x":{str(i):int(i in best_opened) for i in range(f)},
        "y":{str(k):{str(i):{str(j):best_ship[k][i][j] for j in range(c)}
                       for i in range(f)} for k in range(s)}
    }


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--problem",default="bodur2017")
    ap.add_argument("--instance",required=True)
    ap.add_argument("--output",required=True)
    ap.add_argument("--time-limit",type=float,default=60)
    args=ap.parse_args()
    with open(args.instance,encoding="utf-8") as fd:
        data=json.load(fd)
    result=solve(data,args.time_limit)
    with open(args.output,"w",encoding="utf-8") as fd:
        json.dump(result,fd,allow_nan=False,separators=(",",":"))


if __name__=="__main__":
    main()
