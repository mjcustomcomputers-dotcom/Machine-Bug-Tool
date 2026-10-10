"""Synthetic methods-versus-baselines comparison for all six testing solvers.

This is deliberately NOT a FrontierOR score estimate. Every reported
objective is independently checked against its original fixture.
"""
from __future__ import annotations
import json
import pathlib
import sys
import time

ROOT=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/"tests"))
from test_crew import crew, example as crew_fixture, independently_check as crew_verify
from test_facility import solver as facility, fixture as facility_fixture, independent as facility_verify
from test_vrpddp import vrp, fixture as vrp_fixture, independent as vrp_verify
from test_multicommodity import solver as flow, instance as flow_fixture, verify_output as flow_verify
from test_orienteering import op, fixture as op_fixture, independent_check as op_verify
from test_darp import darp, independent_check as darp_verify
from test_darp_tight import tight_fixture


def checked(name, comparator, candidate, maximize, duration, mode):
    old=float(comparator);new=float(candidate)
    improvement=100*(new/old-1) if maximize and old else (
        100*(1-new/old) if old else 0)
    return {"problem":name,"baseline":round(old,5),"challenger":round(new,5),
            "improvement_pct":round(improvement,3),"runtime_s":round(duration,3),
            "better_or_equal":new>=old-1e-6 if maximize else new<=old+1e-6,
            "comparator":mode}


def bench():
    records=[]
    # DARP: planted routes are known feasible, but NOT optimal.
    data,planted=tight_fixture(12,3,1122,10)
    p=darp._problem(data)
    baseline=darp._cost(p,planted)
    start=time.monotonic()
    ans=darp.solve(data,8)
    darp_verify(data,ans)
    records.append(checked("cordeau2006",baseline,ans["objective_value"],False,
                           time.monotonic()-start,"known-feasible planted route"))

    data=op_fixture(13,17);p=op.parse_problem(data)
    start=time.monotonic()
    prior=op.greedy(p,"greedy_ratio",time.monotonic()+0.25)
    answer=op.solve(data,6);op_verify(data,answer)
    records.append(checked("fischetti1998",p.prize(prior),answer["objective_value"],True,
                           time.monotonic()-start,"single greedy construction"))

    data=flow_fixture([(4,20),(5,15),(3,25)],(5,10))
    arcs,adj,goods=flow.parse(data)
    prior=flow._route_objective(arcs,goods,{c["id"]:None for c in goods})
    start=time.monotonic()
    answer=flow.solve(data,5);flow_verify(data,answer)
    records.append(checked("barnhart2000",prior,answer["objective_value"],False,
                           time.monotonic()-start,"reject-all feasible baseline"))

    data=crew_fixture(True);p=crew.parse(data)
    baseline=[0,1,2,3]
    assert crew.verify(p,baseline)
    start=time.monotonic()
    answer=crew.solve(data,5);crew_verify(data,answer)
    records.append(checked("hoffman1993",crew.objective(p,baseline),
                           answer["objective_value"],False,time.monotonic()-start,
                           "four singleton exact-cover rotations"))

    data=facility_fixture(3,2,2,3)
    for i,f in enumerate(data["facilities"]):
        f["opening_cost"]=15. if i==0 else 45.
        f["capacity"]=10.
    data["transportation_costs"]=[[1.,1.],[2.,2.],[3.,3.]]
    p=facility.parse(data)
    allopen=set(range(3))
    prior=facility.greedy_transport(p,allopen)
    assert facility.check(p,allopen,prior)
    before=facility.objective(p,allopen,prior)
    start=time.monotonic()
    answer=facility.solve(data,6);facility_verify(data,answer)
    records.append(checked("bodur2017",before,answer["objective_value"],False,
                           time.monotonic()-start,"all facilities open, greedy shipments"))

    data=vrp_fixture(15,20)
    p=vrp.parse(data)
    prior=vrp.score(p,vrp.separate_routes(p))
    start=time.monotonic()
    answer=vrp.solve(data,6);vrp_verify(data,answer)
    records.append(checked("nagy2015",prior,answer["objective_value"],False,
                           time.monotonic()-start,"one vehicle per customer baseline"))

    root=ROOT/"artifacts"
    root.mkdir(parents=True,exist_ok=True)
    (root/"benchmark.json").write_text(json.dumps(
        {"stage":"Testing","fixture_type":"synthetic","competition_score":None,
         "run_count":len(records),"results":records},indent=2)+"\n")
    out=[
        "# FrontierOR method portfolio — synthetic benchmark",
        "",
        "This report measures real objectives on known synthetic inputs, **not the contest leaderboard**.",
        "",
        "| Problem | Feasible comparator | Proposed | Gain | Runtime |",
        "| --- | ---: | ---: | ---: | ---: |"
    ]
    for row in records:
        out.append("| {problem} | {baseline} | {challenger} | {improvement_pct:+.2f}% | {runtime_s:.2f}s |".format(**row))
    out += [
        "",
        "Each case passes an independent output/feasibility check.",
        "Comparators are intentionally simple or planted-feasible, never claimed optimal.",
        "Competition private-instance scores remain UNKNOWN.",
        "The organizer's official public fixtures and private checker are required for score readiness.",
    ]
    (root/"benchmark.md").write_text("\n".join(out)+"\n")
    for row in records:
        print(row)
    return records


if __name__=="__main__":
    bench()
