"""Feasible-by-construction hard DARP fixtures: regression for narrow time windows."""
from __future__ import annotations
import math
import random
import time
import unittest

from test_darp import darp, independent_check


def tight_fixture(n: int, vehicles: int, seed: int, width: float, ride_slack: float=2):
    r = random.Random(seed)
    centers = [(r.uniform(10,60), r.uniform(10,60)) for _ in range(vehicles)]
    coord = {0:(0.,0.), 2*n+1:(0.,0.)}
    for u in range(n):
        x = centers[u % vehicles][0] + r.uniform(-12,12)
        y = centers[u % vehicles][1] + r.uniform(-12,12)
        coord[u+1] = (x,y)
        coord[n+u+1] = (x+r.uniform(-6,6), y+r.uniform(-6,6))
    times, planted = {}, []
    for vehicle in range(vehicles):
        users = [u for u in range(n) if u % vehicles == vehicle]
        r.shuffle(users)
        route = [0] + [i for u in users for i in (u+1,n+u+1)] + [2*n+1]
        planted.append(route)
        current=0.
        for a,b in zip(route,route[1:]):
            current += math.dist(coord[a],coord[b]) + (0 if a==0 else 1)
            if b != 2*n+1: times[b]=current
    nodes=[]
    for j in range(2*n+2):
        if j==0 or j==2*n+1:
            typ='origin_depot' if j==0 else 'destination_depot'
            load=0
            window=(0.,10000.)
            user=None
        else:
            typ='pickup' if j<=n else 'dropoff'
            load=1 if typ=='pickup' else -1
            user=j-1 if j<=n else j-n-1
            window=(max(0.,times[j]-width),times[j]+width)
        d={'node_id':j,'x':coord[j][0],'y':coord[j][1],
           'earliest_time':window[0],'latest_time':window[1],
           'service_duration':0. if user is None else 1.,
           'load':load,'node_type':typ}
        if user is not None:
            d.update(user_id=user,paired_node=j+n if j<=n else j-n,
                     request_type='outbound' if user<n//2 else 'inbound')
        nodes.append(d)
    maxduration = max(sum(math.dist(coord[a],coord[b])+(0 if a==0 else 1) for a,b in zip(rr,rr[1:]))
                      for rr in planted) + max(10.,width)
    ride_max = max(math.dist(coord[u+1],coord[n+u+1]) for u in range(n)) + ride_slack
    raw={'num_vehicles':vehicles,'num_users':n,'num_nodes':2*n+2,
         'vehicle_capacity':2,'maximum_ride_time':ride_max,
         'maximum_route_duration':maxduration,'nodes':nodes}
    return raw,planted


class TightTimeWindowTests(unittest.TestCase):
    def test_planted_feasible_difficult_cases(self):
        for n,vehicles,seed,width,budget in (
            (12,3,1122,10,25),
            (16,4,1162,15,20),
            (24,4,1240,30,25),
        ):
            with self.subTest(n=n,seed=seed):
                raw,planted = tight_fixture(n,vehicles,seed,width)
                p=darp._problem(raw)
                schedules=[darp._schedule(p,route) for route in planted]
                self.assertTrue(all(s is not None for s in schedules))
                self.assertTrue(darp._verify(p,planted,schedules),
                                'fixture must have an independent feasible certificate')
                before=time.monotonic()
                solved=darp.solve(raw,budget)
                independent_check(raw,solved)
                print('TIGHT_CASE',n,'duration',round(time.monotonic()-before,2),
                      'candidate_cost',round(solved['objective_value'],3),
                      'known_feasible_cost',round(darp._cost(p,planted),3),
                      flush=True)


if __name__=='__main__':
    unittest.main()
