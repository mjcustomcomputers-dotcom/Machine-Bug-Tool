"""Side-constrained crew set partitioning feasibility rescue (V6).
Standalone same algorithm as V6 crew solve.py; Python 3.12, OR-Tools 9.15.
"""
import time
from decimal import Decimal, ROUND_FLOOR, ROUND_CEILING

def cp_sat_side(p,deadline,incumbent=None,feasibility_only=True):
    if time.monotonic()>=deadline-0.4:return None
    try:from ortools.sat.python import cp_model
    except ImportError:return None
    m,n,costs,columns,incidence,d,lo,hi=p
    if n>25000 or m>12000 or sum(map(len,columns))>1000000:return None
    model=cp_model.CpModel()
    vars=[model.new_bool_var(f'r_{j}') for j in range(n)]
    for k,row in enumerate(incidence):
        if not row:return None
        model.add_exactly_one(vars[j] for j in row)
        if k%1000==0 and time.monotonic()>deadline-0.8:return None
    for k,base in enumerate(d):
        max_digits=0
        for x in [lo[k],hi[k],*base]:
            v=Decimal(str(x))
            if not v.is_finite():return None
            if v!=0:max_digits=max(max_digits,max(0,-v.as_tuple().exponent))
        scale=10**min(6,max_digits)
        coef=[int(round(v*scale)) for v in base]
        if max((abs(x) for x in coef),default=0)*max(1,n)>10**16:return None
        lower=int((Decimal(str(lo[k]))*scale-1).to_integral_value(rounding=ROUND_FLOOR))
        upper=int((Decimal(str(hi[k]))*scale+1).to_integral_value(rounding=ROUND_CEILING))
        nz=[coef[j]*vars[j] for j in range(n) if coef[j]]
        model.add(sum(nz)>=lower)
        model.add(sum(nz)<=upper)
        if time.monotonic()>deadline-0.7:return None
    if incumbent is not None:
        chosen=set(incumbent)
        for j,x in enumerate(vars):model.add_hint(x,int(j in chosen))
    if not feasibility_only:
        obj=[int(round(v)) if abs(v-round(v))<1e-7 else int(round(v*100)) for v in costs]
        model.minimize(sum(obj[j]*vars[j] for j in range(n)))
    solver=cp_model.CpSolver()
    solver.parameters.num_search_workers=2
    solver.parameters.max_time_in_seconds=max(0.1,deadline-time.monotonic()-0.25)
    solver.parameters.stop_after_first_solution=feasibility_only
    solver.parameters.random_seed=31103
    try:status=solver.solve(model)
    except Exception:return None
    if status not in (cp_model.OPTIMAL,cp_model.FEASIBLE):return None
    selected=[j for j,x in enumerate(vars) if solver.value(x)]
    return selected if verify(p,selected) else None

def verify(p,selected):
    if selected is None:return False
    m,n,costs,columns,_,d,lo,hi=p
    if len(set(selected))!=len(selected):return False
    counts=[0]*m
    for j in selected:
        if not 0<=j<n:return False
        for r in columns[j]:
            counts[r]+=1
    if any(x!=1 for x in counts):return False
    for i,row in enumerate(d):
        s=sum(row[j] for j in selected)
        if s<lo[i]-1e-6*max(1,abs(lo[i])) or s>hi[i]+1e-6*max(1,abs(hi[i])):return False
    return True

def fixture(m,seed,base=True,distractors=True):
    import random
    assert m%2==0
    rng=random.Random(seed)
    cols=[[i] for i in range(m)]+[[2*i,2*i+1] for i in range(m//2)]
    costs=[1.]*m+[float(17+i%3) for i in range(m//2)]
    if distractors:
        for _ in range(m//2):
            a,b=rng.sample(range(m),2)
            cols.append([a,b]);costs.append(0.5)
    n=len(cols)
    d=[0.]*m+[.75]*(m//2)+[0.]*(n-m-m//2)
    inc=[[] for _ in range(m)]
    for j,rows in enumerate(cols):
        for r in rows:inc[r].append(j)
    return (m,n,costs,cols,inc,[d] if base else [],[.75*(m//2)] if base else [],[.75*(m//2)] if base else [])

if __name__=='__main__':
    from ortools import __version__ as version
    print('ORTOOLS',version,flush=True)
    for m in (200,600,1200,2000):
        t=time.monotonic()
        p=fixture(m,17)
        sel=cp_sat_side(p,time.monotonic()+24)
        assert verify(p,sel),('No feasible solution',m)
        chosen=set(sel)
        assert len(sel)==m//2 and all(j>=m and j<m+m//2 for j in sel),(m,len(sel))
        print('PASS',m,'rows',p[1],'columns',round(time.monotonic()-t,3),'seconds',flush=True)
    p=fixture(200,33)
    p=list(p);p[6]=[1000.0];p=tuple(p)
    assert cp_sat_side(p,time.monotonic()+5) is None,'Infeasible base model should reject'
    print('PASS impossible-model rejection',flush=True)
