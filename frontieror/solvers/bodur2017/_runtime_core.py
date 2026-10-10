"""MPC-derived bounded, instance-local runtime mirrored into each isolated solver.
No external caches, sockets, persistent state, or cross-problem imports.
"""
from __future__ import annotations
from collections import OrderedDict
import json
import math
import os
from pathlib import Path
import time

MAX_JSON_BYTES = 16_000_000
_MISSING = object()

class BoundedMemo:
    """A finite, per-instance full-key cache for deterministic pure computations."""
    __slots__ = ("limit", "entries")
    def __init__(self, limit=2048):
        if not isinstance(limit, int) or not 1 <= limit <= 8192:
            raise ValueError("Invalid bounded cache limit")
        self.limit = limit
        self.entries = OrderedDict()
    def get(self, key, default=None):
        value = self.entries.pop(key, _MISSING)
        if value is _MISSING:
            return default
        self.entries[key] = value
        return value
    def set(self, key, value):
        self.entries.pop(key, None)
        self.entries[key] = value
        if len(self.entries) > self.limit:
            self.entries.popitem(last=False)
        return value
    def clear(self):
        self.entries.clear()
    def __len__(self):
        return len(self.entries)

class RunBudget:
    """Monotonic finite optimizer budget with a separate cleanup reserve."""
    __slots__ = ("deadline",)
    def __init__(self, seconds, reserve=3.0):
        self.deadline = time.monotonic()+max(0.0,float(seconds)-max(0.0,float(reserve)))
    def left(self):
        return max(0.0,self.deadline-time.monotonic())
    def can_start(self, minimum=0.0):
        return self.left()>max(0.0,float(minimum))

def write_solution(output, solution):
    """Reject malformed objectives, cap JSON size and atomically replace output."""
    if not isinstance(solution,dict):
        raise ValueError("Solution must be a JSON object")
    objective=solution.get("objective_value")
    if isinstance(objective,bool) or not isinstance(objective,(int,float)):
        raise ValueError("Missing or nonnumeric objective")
    if not math.isfinite(float(objective)):
        raise ValueError("Non-finite objective")
    data=json.dumps(solution,allow_nan=False,separators=(",",":")).encode("utf-8")
    if len(data)>MAX_JSON_BYTES:
        raise ValueError("Solution JSON exceeds 16 MB")
    output=Path(output)
    output.parent.mkdir(parents=True,exist_ok=True)
    temporary=output.with_name(output.name+".mpc-pending")
    try:
        with temporary.open("wb") as stream:
            stream.write(data)
        os.replace(temporary,output)
    finally:
        if temporary.exists():
            temporary.unlink()
    return len(data)
