"""MPC shared-runtime build: isolate all six Python solvers independently."""
from __future__ import annotations
import argparse
import ast
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

SLUGS=("barnhart2000","bodur2017","cordeau2006",
       "fischetti1998","hoffman1993","nagy2015")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--out",default="frontieror/artifacts/FrontierOR-Main.zip")
    arg=ap.parse_args()
    root=Path(__file__).resolve().parent
    out=Path(arg.out)
    out.parent.mkdir(parents=True,exist_ok=True)
    shared=(root/"shared"/"runtime_core.py").read_bytes()
    ast.parse(shared.decode(),filename="shared/runtime_core.py")
    records=[]
    for slug in SLUGS:
        path=root/"solvers"/slug/"solve.py"
        helper=root/"solvers"/slug/"_runtime_core.py"
        if path.is_symlink() or helper.is_symlink() or helper.read_bytes()!=shared:
            raise RuntimeError("Unsafe or stale per-folder runtime: "+slug)
        data=path.read_bytes()
        funcs={node.name for node in ast.parse(data.decode(),filename=str(path)).body
               if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef))}
        if not {"solve","main"}.issubset(funcs) or len(data)>600_000:
            raise RuntimeError("Missing or oversized solver entrypoint: "+slug)
        records.append((slug,data,hashlib.sha256(data).hexdigest()))
    with ZipFile(out,"w",compression=ZIP_DEFLATED,compresslevel=8) as z:
        for slug,data,_ in records:
            z.writestr(slug+"/solve.py",data)
            z.writestr(slug+"/_runtime_core.py",shared)
    with ZipFile(out,"r") as z:
        names=z.namelist()
        required={slug+"/"+part for slug in SLUGS
                  for part in ("solve.py","_runtime_core.py")}
        if len(names)!=12 or set(names)!=required or z.testzip():
            raise RuntimeError("ZIP integrity or archive coverage failed")
        for slug,data,_ in records:
            if z.read(slug+"/solve.py")!=data or z.read(slug+"/_runtime_core.py")!=shared:
                raise RuntimeError("ZIP byte readback failed: "+slug)
    if out.stat().st_size>4_000_000:
        raise RuntimeError("Competition 4MB ZIP limit exceeded")
    manifest={"track":"Main","stage":"Testing","official_score":None,
              "state":"HOSTED_VERIFICATION_ONLY",
              "zip_sha256":hashlib.sha256(out.read_bytes()).hexdigest(),
              "zip_bytes":out.stat().st_size,
              "shared_runtime_sha256":hashlib.sha256(shared).hexdigest(),
              "solvers":[{"slug":slug,"sha256":digest,"bytes":len(data)}
                         for slug,data,digest in records]}
    (out.parent/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps(manifest,sort_keys=True))

if __name__=="__main__":
    main()
