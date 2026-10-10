"""FrontierOR hoffman1993: exact-cover method router with verified bounded fallbacks.

Problem structure -> sparse integer programming (HiGHS) / CP-SAT / bounded
constraint propagation. No API access or language model at solver runtime.
"""
from __future__ import annotations

import os
# Limit BLAS thread amplification under the organizer's two-vCPU cap.
# SciPy/NumPy are imported lazily after this module-level configuration.
os.environ["OPENBLAS_NUM_THREADS"]="1"
os.environ["MKL_NUM_THREADS"]="1"
os.environ["NUMEXPR_NUM_THREADS"]="1"

import argparse
import json
import math
import time
from decimal import Decimal, ROUND_FLOOR, ROUND_CEILING


def parse(raw):
    m = int(raw["dimensions"]["num_rows"])
    n = int(raw["dimensions"]["num_cols"])
    costs = [float(x) for x in raw["cost_vector"]]
    columns = [tuple(int(r) for r in rows) for rows in raw["constraint_matrix_A"]["columns"]]
    if len(columns) != n or len(costs) != n or m < 1:
        raise ValueError("Invalid exact-cover dimensions")
    incidence = [[] for _ in range(m)]
    for j, rows in enumerate(columns):
        for r in set(rows):
            if not 0 <= r < m:
                raise ValueError("Invalid row index")
            incidence[r].append(j)
    bases = raw.get("base_constraints", {}) if raw.get("has_base_constraints", False) else {}
    d = bases.get("D_matrix", {}).get("rows", []) if bases else []
    lo = bases.get("lower_bounds_d1", []) if bases else []
    hi = bases.get("upper_bounds_d2", []) if bases else []
    if len(d) != len(lo) or len(d) != len(hi) or any(len(row) != n for row in d):
        raise ValueError("Invalid crew base constraints")
    return m, n, costs, columns, incidence, [[float(x) for x in row] for row in d], [float(x) for x in lo], [float(x) for x in hi]


def verify(p, selected):
    m, n, costs, columns, _, d, lo, hi = p
    if selected is None:
        return False
    selected = list(selected)
    if len(selected) != len(set(selected)) or any(not 0 <= j < n for j in selected):
        return False
    counts = [0] * m
    for j in selected:
        for row in columns[j]:
            counts[row] += 1
    if any(x != 1 for x in counts):
        return False
    for i, row in enumerate(d):
        total = math.fsum(row[j] for j in selected)
        if total < lo[i] - 1e-6 * max(1, abs(lo[i])):
            return False
        if total > hi[i] + 1e-6 * max(1, abs(hi[i])):
            return False
    return True


def objective(p, selected):
    return math.fsum(p[2][j] for j in selected)


def forced_greedy(p, deadline):
    """Constraint propagation -> rarest uncovered row -> bounded branching."""
    m, n, costs, columns, incidence, d, lo, hi = p
    if any(not candidates for candidates in incidence):
        return None
    if m > 180 or n > 6500:
        return None
    colsets = [frozenset(rows) for rows in columns]
    # Atomic bitmask representation: integer subset checks are native C operations.
    # Retain the original column and incidence records for independent verification.
    colmasks = [sum(1 << r for r in rows) for rows in colsets]
    initial_mask = (1 << m) - 1
    best = None
    best_cost = math.inf
    start = time.monotonic()
    nodes = 0
    # Incremental base totals: avoid re-summing every selected column per child.
    # Upper-bound pruning is sound only if all remaining contributions are nonnegative.
    nonnegative_base = [all(v >= 0 for v in row) for row in d]
    nonnegative_costs = all(x >= 0 for x in costs)
    # Predetermine the three static candidate orderings once, instead of sorting
    # the same candidate alternatives at every search node.
    priority_keys = [
        [(costs[j] / max(len(columns[j]), 1), costs[j], j) for j in range(n)],
        [(costs[j], -len(columns[j]), j) for j in range(n)],
        [(-len(columns[j]), costs[j], j) for j in range(n)],
    ]
    zero_base = (0.0,) * len(d)
    for mode in range(3):
        if time.monotonic() > deadline - 0.005:
            break
        stack = [(initial_mask, tuple(), 0.0, zero_base)]
        while stack and time.monotonic() < deadline - 0.004 and nodes < 25000:
            remain, path, score, base_totals = stack.pop()
            nodes += 1
            if score >= best_cost and nonnegative_costs:
                continue
            if not remain:
                if verify(p, path) and score < best_cost:
                    best, best_cost = sorted(path), score
                continue
            pivot = None
            choices = None
            remaining_rows = remain
            while remaining_rows:
                lowest_bit = remaining_rows & -remaining_rows
                r = lowest_bit.bit_length() - 1
                remaining_rows ^= lowest_bit
                # Every chosen column covers at least one removed row; a column
                # wholly contained in remain cannot already be selected.
                options = [j for j in incidence[r] if colmasks[j] and (colmasks[j] & remain) == colmasks[j]]
                if not options:
                    choices = []
                    break
                if choices is None or len(options) < len(choices):
                    choices, pivot = options, r
                    if len(choices) == 1:
                        break
            if not choices:
                continue
            choices.sort(key=priority_keys[mode].__getitem__)
            # Least promising first on a LIFO stack, so best candidates are visited first.
            for j in reversed(choices[:18]):
                next_base = tuple(base_totals[i] + d[i][j] for i in range(len(d)))
                if any(nonnegative_base[i] and next_base[i] > hi[i] + 1e-7 for i in range(len(d))):
                    continue
                stack.append((remain ^ colmasks[j], path + (j,), score + costs[j], next_base))
        if time.monotonic() - start > 2.0:
            break
    return best


def cp_sat(p, deadline, incumbent=None):
    """Exact-cover integer model; base constraints handled by floating MILP."""
    if p[5] or deadline - time.monotonic() < 0.7:
        return None
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        return None
    m, n, costs, _, incidence, _, _, _ = p
    model = cp_model.CpModel()
    vars = [model.new_bool_var(f"x_{j}") for j in range(n)]
    for row in incidence:
        model.add_exactly_one(vars[j] for j in row)
    # Cost vector is integral in the official formulation.
    model.minimize(sum(int(round(costs[j])) * vars[j] for j in range(n)))
    if incumbent:
        chosen = set(incumbent)
        for j, v in enumerate(vars):
            model.add_hint(v, int(j in chosen))
    s = cp_model.CpSolver()
    s.parameters.num_search_workers = 2
    s.parameters.max_time_in_seconds = max(0.1, deadline - time.monotonic() - 0.12)
    s.parameters.relative_gap_limit = 0.005
    s.parameters.random_seed = 72
    try:
        status = s.solve(model)
    except Exception:
        return None
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None
    chosen = [j for j in range(n) if s.value(vars[j])]
    return chosen if verify(p, chosen) else None


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
        # A single coefficient scale preserves the objective ranking.
        # Mixed non-integral costs remain with the exact floating MILP path.
        if any(not math.isfinite(v) or abs(v-round(v))>1e-8 for v in costs):
            return None
        obj=[int(round(v)) for v in costs]
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



def dominated_rotations(p):
    """Exact cost dominance for duplicate nonempty coverage and base effects."""
    m,n,costs,columns,incidence,d,lo,hi=p
    cheapest={}
    dominated=set()
    for j,rows in enumerate(columns):
        # An empty-cover rotation can still satisfy a base lower bound.
        # Only remove it if its base-effect vector is identically zero and
        # selecting it cannot reduce the objective.
        if not rows:
            if costs[j]>=0 and all(base[j]==0 for base in d):
                dominated.add(j)
            continue
        key=(tuple(sorted(set(rows))),tuple(base[j] for base in d))
        prev=cheapest.get(key)
        if prev is None:
            cheapest[key]=j
        elif (costs[j],j)<(costs[prev],prev):
            dominated.add(prev)
            cheapest[key]=j
        else:
            dominated.add(j)
    return dominated


def reduce_forced_rotations(p, disabled):
    """Exact-cover singleton propagation with original-column identity."""
    m,n,costs,columns,incidence,d,lo,hi=p
    active=set(range(n))-set(disabled)
    uncovered=set(range(m))
    forced=set()
    while True:
        singleton=None
        for row in sorted(uncovered):
            candidates=[j for j in incidence[row] if j in active]
            if not candidates:
                return None
            if len(candidates)==1:
                singleton=candidates[0]
                break
        if singleton is None:
            break
        if singleton in forced:
            return None
        forced.add(singleton)
        covered=set(columns[singleton])
        if not covered.issubset(uncovered):
            return None
        uncovered.difference_update(covered)
        # Every competing column touching a covered row must be zero.
        forbidden={j for row in covered for j in incidence[row]}
        active.difference_update(forbidden)
    # Columns touching a solved row are already excluded. Empty columns remain
    # available when their original cost or base effects can matter.
    remaining=sorted(active)
    return sorted(forced), sorted(uncovered), remaining


def sparse_milp(p, deadline):
    """SCIP/HiGHS-style sparse 0-1 exact cover with literal real base bounds."""
    if deadline - time.monotonic() < 0.5:
        return None
    try:
        import numpy as np
        from scipy.optimize import milp, Bounds, LinearConstraint
        from scipy.sparse import coo_matrix, vstack, csr_matrix
    except ImportError:
        return None
    m, n, costs, columns, _, d, lo, hi = p
    disabled=dominated_rotations(p)
    reduced=reduce_forced_rotations(p,disabled)
    if reduced is None:
        return None
    forced,uncovered,active=reduced
    if not active:
        return forced if verify(p,forced) else None
    offset=[math.fsum(row[j] for j in forced) for row in d]
    rr, cc = [], []
    row_id={row:z for z,row in enumerate(uncovered)}
    for z,j in enumerate(active):
        for row in columns[j]:
            if row in row_id:
                rr.append(row_id[row])
                cc.append(z)
    entries=np.ones(len(rr),dtype=float)
    A=coo_matrix((entries,(rr,cc)),shape=(len(uncovered),len(active))).tocsr()
    lhs=[1.0]*len(uncovered)
    rhs=[1.0]*len(uncovered)
    if d:
        A=vstack([A,csr_matrix(np.asarray([[row[j] for j in active] for row in d],dtype=float))],format="csr")
        lhs += [lo[k]-offset[k] for k in range(len(d))]
        rhs += [hi[k]-offset[k] for k in range(len(d))]
    try:
        result = milp(
            c=np.asarray([costs[j] for j in active]),
            integrality=np.ones(len(active), dtype=np.int32),
            bounds=Bounds(np.zeros(len(active)), np.ones(len(active))),
            constraints=LinearConstraint(A, np.asarray(lhs), np.asarray(rhs)),
            options={"time_limit": max(0.1, deadline - time.monotonic() - 0.15),
                     "mip_rel_gap": 0.005, "presolve": True}
        )
    except (ValueError, RuntimeError, MemoryError):
        return None
    if result.x is None:
        return None
    selected = forced + [active[z] for z, x in enumerate(result.x) if x > 0.5]
    return selected if verify(p, selected) else None


def solve(instance, time_limit_s):
    p = parse(instance)
    until = time.monotonic() + max(0.25, float(time_limit_s) - 2.5)
    m, n = p[:2]
    backup = forced_greedy(p, min(until, time.monotonic() + 1.5))
    # Method selection by structure: integer exact cover -> CP-SAT;
    # real-valued base constraints -> sparse MILP with numerical validation.
    if not p[5] and time.monotonic() < until - 0.8:
        option = cp_sat(p, min(until, time.monotonic() + 22.0), backup)
        if verify(p, option) and (backup is None or objective(p, option) < objective(p, backup) - 1e-8):
            backup = option
    # Recovery path for large, base-constrained exact covers: the existing
    # V6 side-constraint model was independently tested, but never wired here.
    if p[5] and backup is None and time.monotonic() < until - 1.0:
        option = cp_sat_side(p, min(until, time.monotonic() + 12.0), feasibility_only=True)
        if verify(p, option):
            backup = option
    # Cost-optimization mirror with a verified shared incumbent; reserve MILP time.
    if p[5] and backup is not None and time.monotonic() < until - 2.0:
        option = cp_sat_side(p, min(until - 1.0, time.monotonic() + 4.0),
                             incumbent=backup, feasibility_only=False)
        if verify(p, option) and objective(p, option) < objective(p, backup) - 1e-8:
            backup = option
    if time.monotonic() < until - 0.8:
        option = sparse_milp(p, until)
        if verify(p, option) and (backup is None or objective(p, option) < objective(p, backup) - 1e-8):
            backup = option
    if not verify(p, backup):
        raise RuntimeError("No verified crew exact-cover solution within budget")
    chosen = sorted(backup)
    selected = set(chosen)
    return {
        "objective_value": objective(p, chosen),
        "selected_rotations": chosen,
        "variable_values": {str(j): float(j in selected) for j in range(n)}
    }


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--problem", default="hoffman1993")
    a.add_argument("--instance", required=True)
    a.add_argument("--output", required=True)
    a.add_argument("--time-limit", type=float, default=60)
    args = a.parse_args()
    with open(args.instance, encoding="utf-8") as f:
        raw = json.load(f)
    result = solve(raw, args.time_limit)
    from _runtime_core import write_solution
    write_solution(args.output, result)


if __name__ == "__main__":
    main()
