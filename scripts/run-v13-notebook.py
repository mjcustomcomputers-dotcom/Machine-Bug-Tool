#!/usr/bin/env python3
"""Execute the checked-out V13 notebook without installing a Jupyter kernel.

The five unchanged Python cells share one namespace and invoke the existing
Node CLI. This is an offline source-work runner, not a sandbox or connector.
Output directories are exclusively created; existing outputs are never reused.
"""

import argparse
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone
from uuid import uuid4


MODE = "SHARED_PYTHON_NAMESPACE_NOT_JUPYTER_KERNEL"
NOTEBOOK = Path("notebooks/MPC-Noahs-Ark-Reasoning-V13.ipynb")
EXPECTED_CODE_CELLS = 5


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def command_text(root, args):
    return subprocess.run(
        args, cwd=root, stdin=subprocess.DEVNULL, capture_output=True,
        encoding="utf-8", errors="strict", timeout=30, check=True, shell=False,
    ).stdout.rstrip("\r\n")


def git_snapshot(root):
    status = command_text(root, ["git", "status", "--porcelain=v1", "--untracked-files=normal"])
    return {
        "commit": command_text(root, ["git", "rev-parse", "HEAD"]),
        "tree": command_text(root, ["git", "rev-parse", "HEAD^{tree}"]),
        "working_tree_dirty": bool(status),
        "working_tree_status": status.splitlines(),
    }


def load_notebook(path):
    raw = path.read_bytes()
    notebook = json.loads(raw.decode("utf-8"))
    if not isinstance(notebook, dict) or notebook.get("nbformat") != 4:
        raise ValueError("EXPECTED_NOTEBOOK_FORMAT_4")
    cells = notebook.get("cells")
    if not isinstance(cells, list) or any(not isinstance(cell, dict) for cell in cells):
        raise ValueError("INVALID_NOTEBOOK_CELLS")
    code_cells = [(index, cell) for index, cell in enumerate(cells) if cell.get("cell_type") == "code"]
    if len(code_cells) != EXPECTED_CODE_CELLS:
        raise ValueError("EXPECTED_FIVE_V13_CODE_CELLS")
    for _, cell in code_cells:
        source = cell.get("source")
        if not isinstance(source, str) and not (
            isinstance(source, list) and all(isinstance(line, str) for line in source)
        ):
            raise ValueError("INVALID_NOTEBOOK_CELL_SOURCE")
        # Only the new executed artifact changes; the source file is never saved.
        cell["outputs"] = []
        cell["execution_count"] = None
    return raw, notebook, code_cells


@contextlib.contextmanager
def record_subprocesses(records):
    original = subprocess.run

    def recorded_run(args, *positional, **options):
        if options.get("shell") or not isinstance(args, (list, tuple)):
            raise ValueError("NOTEBOOK_SUBPROCESS_REQUIRES_ARGV_WITHOUT_SHELL")
        if any(not isinstance(item, (str, os.PathLike)) for item in args):
            raise ValueError("INVALID_NOTEBOOK_SUBPROCESS_ARGUMENT")
        options["shell"] = False
        if options.get("text") or options.get("universal_newlines"):
            options.setdefault("encoding", "utf-8")
            options.setdefault("errors", "strict")
        if "input" not in options and "stdin" not in options:
            options["stdin"] = subprocess.DEVNULL
        record = {
            "argv": [os.fspath(item) for item in args],
            "cwd": os.fspath(options.get("cwd", Path.cwd())),
            "shell": False, "started_at_utc": utc_now(),
        }
        started = time.perf_counter()
        try:
            result = original(args, *positional, **options)
            record.update(returncode=result.returncode, stdout=result.stdout, stderr=result.stderr)
            return result
        except subprocess.CalledProcessError as error:
            record.update(returncode=error.returncode, stdout=error.stdout, stderr=error.stderr)
            raise
        except Exception as error:
            record.update(returncode=None, error_type=type(error).__name__, error=str(error))
            raise
        finally:
            # Actual notebook commands use text=True. Retain a lossless form if
            # a future local command explicitly returns bytes instead.
            for key in ("stdout", "stderr"):
                if isinstance(record.get(key), bytes):
                    record[key + "_hex"] = record.pop(key).hex()
            record["completed_at_utc"] = utc_now()
            record["elapsed_seconds"] = time.perf_counter() - started
            records.append(record)

    subprocess.run = recorded_run
    try:
        yield
    finally:
        subprocess.run = original


def runtime_path(root, value):
    path = Path(value).resolve()
    if not path.is_relative_to((root / ".sites-runtime").resolve()):
        raise ValueError("NOTEBOOK_ARTIFACT_OUTSIDE_CHECKOUT_RUNTIME")
    return path


def run(root, output):
    source_path = root / NOTEBOOK
    source_bytes, notebook, code_cells = load_notebook(source_path)
    try:
        output.mkdir(parents=True, exist_ok=False)
    except FileExistsError as error:
        raise ValueError("OUTPUT_DIRECTORY_ALREADY_EXISTS") from error

    record = {
        "kind": "MPC_V13_OFFLINE_NOTEBOOK_EXECUTION",
        "version": 1, "execution_mode": MODE, "status": "FAIL",
        "started_at_utc": utc_now(), "output_directory": str(output),
        "repository": str(root), "notebook": NOTEBOOK.as_posix(),
        "notebook_source_sha256": sha256(source_bytes),
        "runner_sha256": sha256(Path(__file__).read_bytes()),
        "python_version": platform.python_version(), "python_executable": sys.executable,
        "python_utf8_mode": bool(sys.flags.utf8_mode),
        "platform": platform.platform(), "code_cells_total": len(code_cells),
        "cells": [], "subprocesses": [], "errors": [], "artifacts": [],
        "source_authentication": False, "canonical_promotion": False,
        "execution_scope": "OFFLINE_CHECKED_OUT_NOTEBOOK_NOT_A_SANDBOX_OR_CONNECTOR",
    }
    namespace = {"__name__": "__main__", "__file__": str(source_path)}
    previous_cwd = Path.cwd()
    cache_before = None
    try:
        record["source_before"] = git_snapshot(root)
        record["node_version"] = command_text(root, ["node", "--version"])
        os.chdir(root)
        with record_subprocesses(record["subprocesses"]):
            for count, (index, cell) in enumerate(code_cells, start=1):
                stdout, stderr = io.StringIO(), io.StringIO()
                started = time.perf_counter()
                cell_record = {"cell_index": index, "execution_count": count, "status": "PASS"}
                error = None
                try:
                    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                        text = cell["source"] if isinstance(cell["source"], str) else "".join(cell["source"])
                        exec(compile(text, f"{source_path}:cell-{index}", "exec"), namespace)
                except BaseException as exception:
                    error = {
                        "type": type(exception).__name__, "message": str(exception),
                        "traceback": traceback.format_exc().splitlines(),
                    }
                    cell_record["status"] = "FAIL"
                cell_record.update(
                    elapsed_seconds=time.perf_counter() - started,
                    stdout=stdout.getvalue(), stderr=stderr.getvalue(), error=error,
                )
                cell["execution_count"] = count
                for stream in ("stdout", "stderr"):
                    if cell_record[stream]:
                        cell["outputs"].append({
                            "output_type": "stream", "name": stream,
                            "text": cell_record[stream].splitlines(True),
                        })
                if error:
                    cell["outputs"].append({
                        "output_type": "error", "ename": error["type"],
                        "evalue": error["message"], "traceback": error["traceback"],
                    })
                record["cells"].append(cell_record)
                if error:
                    break
                # The notebook declares its source-derived cache before it is
                # opened by Node. Existing bytes must survive this read-only run.
                if cache_before is None and "cache_path" in namespace:
                    path = runtime_path(root, namespace["cache_path"])
                    cache_before = {
                        "path": str(path), "existed_before_open": path.exists(),
                        "sha256_before": sha256(path.read_bytes()) if path.exists() else None,
                    }
        record["source_after"] = git_snapshot(root)
        if record["source_before"]["commit"] != record["source_after"]["commit"]:
            record["errors"].append("GIT_HEAD_CHANGED_DURING_NOTEBOOK_EXECUTION")
        record["notebook_source_unchanged"] = source_path.read_bytes() == source_bytes
        if not record["notebook_source_unchanged"]:
            record["errors"].append("NOTEBOOK_SOURCE_CHANGED_DURING_EXECUTION")
        if cache_before is not None:
            path = Path(cache_before["path"])
            cache_before["sha256_after"] = sha256(path.read_bytes()) if path.exists() else None
            cache_before["existing_cache_bytes_unchanged"] = (
                cache_before["sha256_before"] == cache_before["sha256_after"]
                if cache_before["existed_before_open"] else None
            )
            if cache_before["existing_cache_bytes_unchanged"] is False:
                record["errors"].append("EXISTING_CACHE_BYTES_CHANGED")
            record["cache"] = cache_before
    except Exception as error:
        record["errors"].append({"type": type(error).__name__, "message": str(error)})
    finally:
        os.chdir(previous_cwd)

    def artifact_json(name, value):
        path = output / name
        write_json(path, value)
        record["artifacts"].append({"path": name, "sha256": sha256(path.read_bytes()), "bytes": path.stat().st_size})

    def artifact_copy(name, value):
        path = runtime_path(root, value)
        raw = path.read_bytes()
        with (output / name).open("xb") as handle:
            handle.write(raw)
        record["artifacts"].append({"path": name, "sha256": sha256(raw), "bytes": len(raw), "copied_from": str(path)})

    try:
        artifact_json("MPC-Noahs-Ark-Reasoning-V13.executed.ipynb", notebook)
        if "run_context" in namespace:
            artifact_json("notebook-run-context.json", namespace["run_context"])
        if "results" in namespace:
            artifact_json("v13-scenario-results.json", namespace["results"])
        for key, name in (
            ("out", "noahs-ark-v13-synthetic-outcomes.csv"),
            ("receipt_path", "notebook-native-execution-receipt.json"),
        ):
            if key in namespace and Path(namespace[key]).is_file():
                artifact_copy(name, namespace[key])
    except Exception as error:
        record["errors"].append({"type": type(error).__name__, "message": str(error)})
    record["code_cells_executed"] = len(record["cells"])
    record["code_cells_passed"] = sum(cell["status"] == "PASS" for cell in record["cells"])
    record["code_cells_failed"] = sum(cell["status"] == "FAIL" for cell in record["cells"])
    record["code_cells_not_run"] = len(code_cells) - len(record["cells"])
    if record["code_cells_passed"] == len(code_cells) and not record["errors"]:
        record["status"] = "PASS"
    record["completed_at_utc"] = utc_now()
    receipt = output / "v13-notebook-execution.json"
    write_json(receipt, record)
    print(json.dumps({
        key: record[key] for key in (
            "status", "execution_mode", "code_cells_total", "code_cells_executed",
            "code_cells_passed", "code_cells_failed", "code_cells_not_run", "errors",
        )
    } | {"receipt": str(receipt)}, ensure_ascii=False, indent=2))
    return 0 if record["status"] == "PASS" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, help="New output directory; an existing directory is rejected.")
    args = parser.parse_args()
    # Python's UTF-8 mode also covers the unchanged notebook's read_text and
    # text subprocess defaults on Windows. No shell or package installation.
    if not sys.flags.utf8_mode:
        return subprocess.run(
            [sys.executable, "-X", "utf8", str(Path(__file__).resolve()), *sys.argv[1:]],
            shell=False,
        ).returncode
    root = Path(__file__).resolve().parents[1]
    suffix = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + "-" + uuid4().hex[:8]
    output = (args.output_dir or root / ".sites-runtime" / "notebook-runs" / suffix).expanduser().resolve()
    try:
        return run(root, output)
    except Exception as error:
        print(json.dumps({"status": "ERROR", "error_type": type(error).__name__, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
