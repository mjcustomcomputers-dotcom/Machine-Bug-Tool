"""Build an auditable, minimal FrontierOR Main submission ZIP from current source.

Only six standalone, syntax-verified solver scripts are included. No .env,
API keys, tests, data, research documents or other MPC source code.
"""
from __future__ import annotations
import argparse
import ast
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

SLUGS=(
    "barnhart2000",
    "bodur2017",
    "cordeau2006",
    "fischetti1998",
    "hoffman1993",
    "nagy2015",
)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--out",default="frontieror/artifacts/FrontierOR-Main.zip")
    args=parser.parse_args()
    root=Path(__file__).resolve().parent
    dest=Path(args.out)
    dest.parent.mkdir(parents=True,exist_ok=True)
    source_records=[]
    for slug in SLUGS:
        path=root/"solvers"/slug/"solve.py"
        data=path.read_bytes()
        tree=ast.parse(data.decode("utf-8"),filename=str(path))
        funcs={x.name for x in tree.body if isinstance(x,(ast.FunctionDef,ast.AsyncFunctionDef))}
        if "solve" not in funcs:
            raise RuntimeError(f"{slug} lacks solve(instance,time_limit_s)")
        if len(data)>600_000:
            raise RuntimeError("Solver code exceeds accepted per-file budget")
        source_records.append({"slug":slug,"file":path,"sha256":hashlib.sha256(data).hexdigest(),
                               "size_bytes":len(data),"data":data})
    with ZipFile(dest,"w",compression=ZIP_DEFLATED,compresslevel=8) as z:
        for obj in source_records:
            z.writestr(obj["slug"]+"/solve.py",obj["data"])
    with ZipFile(dest,"r") as z:
        expected={slug+"/solve.py" for slug in SLUGS}
        if set(z.namelist())!=expected or z.testzip():
            raise RuntimeError("Submission failed exact coverage or ZIP integrity")
        if any(z.read(rec["slug"]+"/solve.py")!=rec["data"] for rec in source_records):
            raise RuntimeError("Submission readback mismatch")
    if dest.stat().st_size>=4*1024*1024:
        raise RuntimeError("FrontierOR upload exceeds 4 MiB")
    manifest={
        "track":"Main",
        "stage":"Testing",
        "scope":"all six published testing problems",
        "official_score":None,
        "zip_sha256":hashlib.sha256(dest.read_bytes()).hexdigest(),
        "zip_bytes":dest.stat().st_size,
        "sources":[{k:v for k,v in rec.items() if k not in ("file","data")} for rec in source_records],
        "status":"READY_FOR_OFFICIAL_PUBLIC_TEST_NOT_SCORED"
    }
    target=dest.parent/"manifest.json"
    target.write_text(json.dumps(manifest,indent=2)+"\n")
    print("Prepared",dest,"\n",json.dumps({k:v for k,v in manifest.items() if k!="sources"},indent=2))


if __name__=="__main__":
    main()
