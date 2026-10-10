"""FrontierOR barnhart2000: bounded path-set + CP-SAT assignment + greedy fallback.

Methods: shortest feasible simple paths, inverse-capacity pricing, residual
network greedy, exact path-set binary optimization, independent feasibility.
No API/model calls at inference. All optional dependencies have a valid fallback.
"""
from __future__ import annotations
import argparse, heapq, json, math, random, time


def parse(instance):
    network=instance['network']
    arcs={int(a['arc_id']):{'id':int(a['arc_id']), 'from':int(a['from_node']),
                            'to':int(a['to_node']), 'cap':int(a['capacity']),
                            'cost':float(a.get('cost',0))} for a in network['arcs']}
    adjacency={int(node):[] for node in network['nodes']}
    for aid,a in arcs.items():
        adjacency.setdefault(a['from'],[]).append(aid)
    for row in adjacency.values():row.sort()
    goods=[]
    for row in instance['commodities']['commodity_list']:
        c={'id':int(row['commodity_id']), 'from':int(row['origin']),
           'to':int(row['destination']), 'demand':int(row['demand']),
           'reject':float(row['artificial_arc_cost'])*int(row['demand'])}
        goods.append(c)
    return arcs,adjacency,goods


def route_paths(arcs,adj,c,deadline,max_paths=9):
    """Finite path catalog: shortest, low-congestion, and perturbed variants."""
    start,goal,d=c['from'],c['to'],c['demand']
    if start==goal:return [tuple()]
    result=[];seen=set()
    for mode in (0,1,2):
        if time.monotonic()>deadline-0.1:break
        count=0;queue=[(0.0,0,start,tuple(),frozenset([start]))]
        while queue and count<4500 and len(result)<max_paths and time.monotonic()<deadline-0.05:
            count+=1
            length,hops,node,path,visited=heapq.heappop(queue)
            if node==goal:
                if path not in seen:
                    seen.add(path);result.append(path)
                continue
            if hops >= len(adj):continue
            for aid in adj.get(node,()):
                a=arcs[aid]
                if a['cap']<d or a['to'] in visited:continue
                ratio = d / max(1,a['cap'])
                # Objective-aligned shortest paths: monetary arc cost, not hop
                # count, determines the first search. Other modes diversify
                # against scarce capacity without discarding real arc prices.
                monetary=max(0.0,a['cost'])*d
                if mode==0:weight=monetary
                elif mode==1:weight=monetary + 0.5*ratio
                else:weight=monetary + 0.1*ratio + ((aid*28657+c['id']*917)%19)/1000
                # Bounded queue protects the 4-GB sandbox on high-degree graphs.
                # Truncation affects candidate quality, never feasibility:
                # reject-all remains a verified legal backup.
                if len(queue)<30000:
                    heapq.heappush(queue,(length+weight,hops+1,a['to'],path+(aid,),visited|{a['to']}))
    return result


def _route_objective(arcs,goods,assignment):
    """Official barnhart2000 objective: penalty paid ONLY for rejected commodities.

    Real-arc costs may describe the network but are not part of the published
    objective_value. Keeping them here passed zero-cost synthetic tests while
    making a positive-cost routed solution disagree with the organizer checker.
    """
    return math.fsum(c['reject'] for c in goods if assignment.get(c['id']) is None)


def verify(arcs,goods,assignment):
    residual={aid:a['cap'] for aid,a in arcs.items()}
    for c in goods:
        path=assignment.get(c['id'])
        if path is None:continue
        node=c['from'];visited={node}
        for aid in path:
            if aid not in arcs:return False
            a=arcs[aid]
            if a['from']!=node:return False
            node=a['to']
            if node in visited:return False
            visited.add(node)
            residual[aid]-=c['demand']
            if residual[aid]<0:return False
        if node!=c['to']:return False
    return True


def greedy(arcs,goods,paths,deadline):
    """Deterministic multi-order residual network construction."""
    modes=[sorted(goods,key=lambda c:(-c['reject']/max(c['demand'],1),-c['reject'],c['id'])),
           sorted(goods,key=lambda c:(-c['reject']/max(1,len(paths.get(c['id'],[()]))) ,-c['reject'])),
           sorted(goods,key=lambda c:(-c['reject'],-c['demand'])),
           sorted(goods,key=lambda c:(-c['reject']/max(1,c['demand']*min((len(p) for p in paths.get(c['id'],())),default=100)), c['id']))]
    best=None;best_cost=math.inf
    for order in modes:
        if time.monotonic()>deadline-0.01:break
        residual={aid:a['cap'] for aid,a in arcs.items()}
        assignment={c['id']:None for c in goods}
        for c in order:
            candidates=paths.get(c['id'],[])
            viable=[]
            for p in candidates:
                if all(residual[aid]>=c['demand'] for aid in p):
                    # Preserve scarce capacity; actual arc transport cost is
                    # not a term in the official rejection-penalty objective.
                    score=(sum(c['demand']/max(1,residual[aid]) for aid in p),
                           len(p),tuple(p))
                    viable.append((score,p))
            if viable:
                chosen=min(viable)[1]
                assignment[c['id']]=chosen
                for aid in chosen:residual[aid]-=c['demand']
        if verify(arcs,goods,assignment):
            cost=_route_objective(arcs,goods,assignment)
            if cost<best_cost:
                best,best_cost=assignment,cost
    return best


def _residual_shortest_path(arcs,adj,c,residual,deadline,shadow=0.03):
    """Find a new unsplit capacity-feasible path outside the fixed catalog.

    Dijkstra weights are nonnegative under the published physical-cost model.
    The shadow charge only ranks paths; actual cost is recomputed separately.
    """
    origin,dest,d=c['from'],c['to'],c['demand']
    if origin==dest:return ()
    heap=[(0.0,0,origin)]
    best={origin:(0.0,0)}
    parent={}
    visited=set()
    while heap and time.monotonic()<deadline-0.003:
        price,hops,u=heapq.heappop(heap)
        if (price,hops)!=best.get(u) or u in visited:continue
        visited.add(u)
        if u==dest:
            out=[]
            while u!=origin:
                prev,aid=parent[u]
                out.append(aid)
                u=prev
            out.reverse()
            return tuple(out)
        for aid in adj.get(u,()):
            arc=arcs[aid]
            if residual[aid]<d:continue
            v=arc['to']
            if v in visited:continue
            left=residual[aid]-d
            edge=max(0.,arc['cost'])*d + shadow*d/(left+1.)
            trial=(price+edge,hops+1)
            if trial<best.get(v,(math.inf,math.inf)):
                best[v]=trial
                parent[v]=(u,aid)
                heapq.heappush(heap,(trial[0],trial[1],v))
    return None


def _path_monetary_cost(arcs,c,path):
    return c['demand']*math.fsum(arcs[aid]['cost'] for aid in path)


def repair_residual(arcs,adj,goods,assignment,deadline):
    """Anytime residual-path and one-ejection repair; never worsens incumbent.

    Build paths from current residual capacities rather than relying only on
    the bounded pre-generated path pool. A displaced commodity may reroute or
    be rejected when that produces a strictly better globally feasible plan.
    """
    if not verify(arcs,goods,assignment):return assignment
    current=dict(assignment)
    best_cost=_route_objective(arcs,goods,current)
    residual={aid:arc['cap'] for aid,arc in arcs.items()}
    for c in goods:
        for aid in current.get(c['id']) or ():
            residual[aid]-=c['demand']

    # First fill free capacity dynamically. Repeat for short alternative orderings.
    for _ in range(2):
        improved=False
        for c in sorted(goods,key=lambda x:(-x['reject'],-x['demand'],x['id'])):
            if time.monotonic()>=deadline-0.01:break
            if current[c['id']] is not None:continue
            path=_residual_shortest_path(arcs,adj,c,residual,deadline)
            if path is None:continue
            saving=c['reject']-_path_monetary_cost(arcs,c,path)
            if c['from']==c['to']:saving=0.
            if saving<=1e-8:continue
            current[c['id']]=path
            for aid in path:residual[aid]-=c['demand']
            improved=True
        if not improved or time.monotonic()>=deadline-0.02:break
    # Reset the baseline after every direct admission. Ejection is accepted
    # only if it improves on this newer, already-better assignment.
    best_cost=_route_objective(arcs,goods,current)

    # If every remaining high-value commodity is blocked by congestion,
    # try moving one existing commodity (bounded two-commodity ejection).
    probes=0
    pending=sorted((c for c in goods if current[c['id']] is None
                    and c['from']!=c['to']),key=lambda x:-x['reject'])[:12]
    for target in pending:
        if time.monotonic()>=deadline-0.03 or probes>=72:break
        selected=sorted((c for c in goods if current[c['id']] is not None
                         and current[c['id']]),key=lambda x:x['reject'])[:18]
        for victim in selected:
            if time.monotonic()>=deadline-0.03 or probes>=72:break
            probes+=1
            trial_res=dict(residual)
            for aid in current[victim['id']]:trial_res[aid]+=victim['demand']
            incoming=_residual_shortest_path(arcs,adj,target,trial_res,deadline)
            if incoming is None:continue
            if _path_monetary_cost(arcs,target,incoming)>=target['reject']-1e-8:
                continue
            for aid in incoming:trial_res[aid]-=target['demand']
            replacement=_residual_shortest_path(arcs,adj,victim,trial_res,deadline)
            if replacement is not None and (
                    _path_monetary_cost(arcs,victim,replacement)>=victim['reject']-1e-8):
                replacement=None
            challenger=dict(current)
            challenger[target['id']]=incoming
            challenger[victim['id']]=replacement
            newcost=_route_objective(arcs,goods,challenger)
            if newcost<best_cost-1e-8 and verify(arcs,goods,challenger):
                current=challenger
                best_cost=newcost
                residual={aid:a['cap'] for aid,a in arcs.items()}
                for c in goods:
                    for aid in current[c['id']] or ():
                        residual[aid]-=c['demand']
                break
    return current if verify(arcs,goods,current) else assignment


def optimize(arcs,goods,paths,deadline):
    """Exact 0-1 allocation over finitely enumerated paths (two CPU)."""
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        return None
    if time.monotonic()>deadline-0.2:return None
    model=cp_model.CpModel()
    choices={};usage={aid:[] for aid in arcs}
    for c in goods:
        vars=[]
        for k,path in enumerate(paths.get(c['id'],())):
            v=model.NewBoolVar('k%d_p%d'%(c['id'],k))
            vars.append(v)
            choices[(c['id'],k)]=v
            for aid in set(path):usage[aid].append(c['demand']*v)
        if vars:model.Add(sum(vars)<=1)
    for aid,a in arcs.items():
        if usage[aid]:model.Add(sum(usage[aid])<=a['cap'])
    # Choosing a feasible real path avoids this commodity's rejection penalty.
    # Positive transport costs must not discourage acceptance: the published
    # objective is the SUM of penalties for commodities rejected.
    scale=1000
    objective=[]
    for c in goods:
        for k,path in enumerate(paths.get(c['id'],())):
            objective.append(round(scale*c['reject'])*choices[c['id'],k])
    model.Maximize(sum(objective))
    solver=cp_model.CpSolver()
    solver.parameters.num_search_workers=2
    solver.parameters.random_seed=10409
    solver.parameters.max_time_in_seconds=max(0.1,deadline-time.monotonic()-0.1)
    try:status=solver.Solve(model)
    except Exception:return None
    if status not in (cp_model.FEASIBLE,cp_model.OPTIMAL):return None
    assignment={c['id']:None for c in goods}
    for c in goods:
        for k,path in enumerate(paths.get(c['id'],())):
            if solver.Value(choices[c['id'],k]):
                assignment[c['id']]=path
                break
    return assignment if verify(arcs,goods,assignment) else None


def solve(instance,time_limit_s):
    start=time.monotonic();deadline=start+max(0.1,float(time_limit_s)-2.0)
    arcs,adj,goods=parse(instance)
    paths={}
    for c in sorted(goods,key=lambda x:-x['reject']):
        if time.monotonic() >= deadline-0.5:
            break
        budget=min(deadline-0.25,time.monotonic()+min(0.4,max(0.16,(deadline-time.monotonic())*0.05)))
        paths[c['id']]=route_paths(arcs,adj,c,budget,max_paths=10)
    backup={c['id']:None for c in goods}
    found=greedy(arcs,goods,paths,min(deadline,time.monotonic()+2.0))
    if found is not None and verify(arcs,goods,found) and (
            _route_objective(arcs,goods,found)<_route_objective(arcs,goods,backup)-1e-8):
        backup=found
    # V7 residual recovery is reversible: only a verified lower-cost
    # assignment replaces the V6 incumbent, and old path columns remain.
    if _route_objective(arcs,goods,backup)>1e-8 and time.monotonic()<deadline-0.6:
        repaired=repair_residual(arcs,adj,goods,backup,
                                 min(deadline-0.4,time.monotonic()+2.0))
        if (verify(arcs,goods,repaired) and
                _route_objective(arcs,goods,repaired) <
                _route_objective(arcs,goods,backup)-1e-8):
            backup=repaired
            for c in goods:
                path=backup[c['id']]
                if path is not None and path not in paths.get(c['id'],()):
                    paths.setdefault(c['id'],[]).append(path)
    # Official physical costs and rejection penalties are nonnegative.
    # A feasible objective of zero is a certified global lower bound:
    # no integer solver can improve it. Avoid burning 50+ seconds.
    zero_lower_bound_reached=(_route_objective(arcs,goods,backup)<=1e-8
                              and all(a['cost']>=0 for a in arcs.values())
                              and all(c['reject']>=0 for c in goods))
    if not zero_lower_bound_reached and time.monotonic()<deadline-0.5:
        other=optimize(arcs,goods,paths,deadline)
        if other is not None and verify(arcs,goods,other) and _route_objective(arcs,goods,other)<_route_objective(arcs,goods,backup):
            backup=other
    if not verify(arcs,goods,backup):raise RuntimeError('Invalid internal routing assignment')
    return {
        'objective_value': _route_objective(arcs,goods,backup),
        'commodities':[
            {'commodity_id':c['id'],'rejected':backup[c['id']] is None,
             'path_arcs':([] if backup[c['id']] is None else
                  [{'from':arcs[aid]['from'],'to':arcs[aid]['to'],'arc_id':aid} for aid in backup[c['id']]])}
            for c in goods]
    }


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--problem',default='barnhart2000')
    p.add_argument('--instance',required=True)
    p.add_argument('--output',required=True)
    p.add_argument('--time-limit',type=float,default=60)
    a=p.parse_args()
    with open(a.instance) as f:instance=json.load(f)
    result=solve(instance,a.time_limit)
    from _runtime_core import write_solution
    write_solution(a.output, result)

if __name__=='__main__':main()