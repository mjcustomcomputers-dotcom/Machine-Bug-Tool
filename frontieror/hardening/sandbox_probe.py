"""FrontierOR Main-track Linux container stress and interface validator.

Synthetic probes only. Does not access FrontierOR API or consume submissions.
Exact published resource constraints are enforced by Docker flags.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests"))
from test_crew import independently_check as check_crew, example as fixture_crew
from test_darp import fixture as fixture_darp, independent_check as check_darp
from test_darp_tight import tight_fixture
from test_facility import fixture as fixture_facility, independent as check_facility
from test_multicommodity import instance as fixture_flow, verify_output as check_flow
from test_orienteering import fixture as fixture_orienteering, independent_check as check_orienteering
from test_vrpddp import fixture as fixture_vrp, independent as check_vrp

VERIFIERS = {
    "barnhart2000": check_flow,
    "bodur2017": check_facility,
    "cordeau2006": check_darp,
    "fischetti1998": check_orienteering,
    "hoffman1993": check_crew,
    "nagy2015": check_vrp,
}


def large_crew():
    m=60
    columns=[[i] for i in range(m)] + [[2*i,2*i+1] for i in range(m//2)]
    n=len(columns)
    return {
        "dimensions":{"num_rows":m,"num_cols":n},
        "cost_vector":[15]*m+[12]*(m//2),
        "constraint_matrix_A":{"columns":columns},
        "has_base_constraints":True,
        "base_constraints":{
            "num_bases":1,"num_constraints":1,
            "D_matrix":{"rows":[[1.0]*n]},
            "lower_bounds_d1":[1.0],"upper_bounds_d2":[80.0],
        },
    }


def cases():
    rows=[
      ("barnhart2000","smoke",fixture_flow([(4,20),(5,15),(3,25)],(5,10))),
      ("bodur2017","smoke",fixture_facility(3,2,2,3)),
      ("cordeau2006","smoke",fixture_darp(5,2,19)),
      ("fischetti1998","smoke",fixture_orienteering(9,4)),
      ("hoffman1993","smoke",fixture_crew(True)),
      ("nagy2015","smoke",fixture_vrp(5,12)),
      ("barnhart2000","stress",fixture_flow([(1,12+i%17) for i in range(100)],(60,60))),
      ("bodur2017","stress",fixture_facility(18,25,6,57)),
      ("cordeau2006","stress",tight_fixture(16,4,1162,15)[0]),
      ("fischetti1998","stress",fixture_orienteering(44,177)),
      ("hoffman1993","stress",large_crew()),
      ("nagy2015","stress",fixture_vrp(180,37)),
    ]
    return rows


def one(image, slug, label, data, seconds):
    with tempfile.TemporaryDirectory(prefix="frontieror-resource-") as tmp:
        wd=Path(tmp)
        wd.chmod(0o755)  # allow unprivileged uid 1000 across mounts
        input_dir=wd/"in"
        output_dir=wd/"out"
        input_dir.mkdir()
        output_dir.mkdir()
        output_dir.chmod(0o777)
        (input_dir/"instance.json").write_text(json.dumps(data),encoding="utf8")
        src=ROOT/"solvers"/slug
        assert (src/"solve.py").is_file(),slug
        command=[
            "docker","run","--rm","--network","none","--cpus","2",
            "--memory","4096m","--memory-swap","4096m",
            "--pids-limit","256","--read-only","--tmpfs","/tmp:rw,nosuid,size=64m",
            "--cap-drop","ALL","--security-opt","no-new-privileges",
            "--ulimit","nofile=1024:1024","--ulimit","core=0:0",
            "--user","1000:1000", "--init",
            "-e","PYTHONDONTWRITEBYTECODE=1","-e","OMP_NUM_THREADS=2",
            "-e","OPENBLAS_NUM_THREADS=1","-e","MKL_NUM_THREADS=1",
            "-e","NUMEXPR_NUM_THREADS=1","-e","HOME=/tmp",
            "-v",f"{src.resolve()}:/work/solver:ro",
            "-v",f"{input_dir.resolve()}:/work/in:ro",
            "-v",f"{output_dir.resolve()}:/work/out:rw",
            "-w","/work/solver",image,
            "python","solve.py","--problem",slug,
            "--instance","/work/in/instance.json",
            "--output","/work/out/solution.json","--time-limit",str(seconds),
        ]
        t=time.monotonic()
        p=subprocess.run(command,capture_output=True,text=True,timeout=seconds+12)
        wall=time.monotonic()-t
        if p.returncode:
            raise AssertionError(f"container exit={p.returncode} wall={wall:.2f} seconds stderr: {p.stderr[-1200:]}")
        if wall >= seconds+5:
            raise AssertionError(f"container exceeded launch+budget wall clock: {wall:.2f}s")
        result_file=output_dir/"solution.json"
        if not result_file.is_file():
            raise AssertionError("No solution.json produced")
        if result_file.stat().st_size>16*1024*1024:
            raise AssertionError(f"Excessive JSON output {result_file.stat().st_size}")
        result=json.loads(result_file.read_text(),parse_constant=lambda c: (_ for _ in ()).throw(ValueError(c)))
        VERIFIERS[slug](data,result)
        return {"slug":slug,"case":label,"status":"PASS","wall_s":round(wall,3),
                "json_bytes":result_file.stat().st_size,"objective":result["objective_value"]}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--image",required=True)
    parser.add_argument("--seconds",type=int,default=22)
    parser.add_argument("--out",default="")
    args=parser.parse_args()
    results=[]
    for slug,label,data in cases():
        try:
            report=one(args.image,slug,label,data,args.seconds)
        except Exception as exc:
            report={"slug":slug,"case":label,"status":"FAIL","error":repr(exc)}
        results.append(report)
        print(json.dumps(report),flush=True)
    report={"kind":"FRONTIEROR_SANDBOX_MATRIX","image":args.image,
            "simulation":"Docker synthetic fixture, not organizer private checker",
            "limits":{"cpu":2,"memory_mb":4096,"network":"none",
                      "solver_dir":"read-only","tmpfs_mb":64,"time_limit_s":args.seconds},
            "results":results}
    if args.out:
        Path(args.out).parent.mkdir(parents=True,exist_ok=True)
        Path(args.out).write_text(json.dumps(report,indent=2)+"\n")
    if any(x["status"]!="PASS" for x in results):
        raise SystemExit(1)


if __name__=="__main__":main()