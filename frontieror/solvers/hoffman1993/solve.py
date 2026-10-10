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


def large_sparse_cover(p, deadline, reduction=None):
    """Feasibility-first bounded MRV recovery for large exact-cover models.

    Sparse bitset column masks + persistent parent-pointer paths avoid copying
    full selected schedules into each branch. This is a search heuristic:
    branch caps or deadlines return UNKNOWN (None), never INFEASIBLE.
    Every promoted answer is reconstructed to original IDs and verified with
    all literal floating base constraints.
    """
    if time.monotonic() >= deadline - 0.05:
        return None
    m, n, costs, columns, incidence, d, lo, hi = p
    if (m <= 180 or m > 12000 or n > 50000 or
            sum(len(rows) for rows in columns) > 400000):
        return None
    if reduction is None:
        reduction = reduce_forced_rotations(p, dominated_rotations(p))
    if reduction is None:
        return None
    forced, uncovered, active = reduction
    if not uncovered:
        return forced if verify(p, forced) else None
    # Build only the remaining coverage incidence, with temporary dense
    # bit positions; original column indices are never renumbered in output.
    row_id = {row: k for k, row in enumerate(uncovered)}
    row_candidates = [[] for _ in uncovered]
    masks = {}
    length = {}
    for j in active:
        if not columns[j]:
            continue  # Optional empty columns remain for CP-SAT / MILP.
        mask = 0
        for original_row in columns[j]:
            k = row_id.get(original_row)
            if k is None:
                mask = 0
                break
            mask |= (1 << k)
        if not mask:
            continue
        masks[j] = mask
        length[j] = mask.bit_count()
        remaining_bits = mask
        while remaining_bits:
            bit = remaining_bits & -remaining_bits
            remaining_bits ^= bit
            row_candidates[bit.bit_length() - 1].append(j)
    if any(not row for row in row_candidates):
        return None
    # Static row scarcity is cheap; dynamic eligibility is checked with
    # native integer masks before branching, not inferred from this ranking.
    rarest = sorted(range(len(uncovered)),
                    key=lambda k: (len(row_candidates[k]), k))
    initial_mask = (1 << len(uncovered)) - 1
    initial_base = tuple(math.fsum(base[j] for j in forced) for base in d)
    nonnegative = tuple(all(base[j] >= 0 for j in active) for base in d)
    nonpositive = tuple(all(base[j] <= 0 for j in active) for base in d)
    orderings = (
        {j: (costs[j] / max(1, length[j]), costs[j], j)
         for j in masks},
        {j: (-length[j], costs[j], j) for j in masks},
        {j: (costs[j], -length[j], j) for j in masks},
    )
    # A persistent parent-index chain reduces memory from O(nodes*depth)
    # to O(nodes). The complete schedule is materialized only at a leaf.
    for ordering in orderings:
        if time.monotonic() >= deadline - 0.03:
            break
        chain = []  # (parent-index, original column ID)
        stack = [(initial_mask, -1, initial_base)]
        examined = 0
        while stack and examined < 8000:
            if (examined & 31) == 0 and time.monotonic() >= deadline - 0.025:
                break
            remain, parent, base_totals = stack.pop()
            examined += 1
            if not remain:
                chosen = list(forced)
                node = parent
                while node != -1:
                    previous, j = chain[node]
                    chosen.append(j)
                    node = previous
                if verify(p, chosen):
                    return sorted(chosen)
                # Empty-cover base repairs and fractional edge cases remain
                # for the original CP-SAT / HiGHS fallback.
                continue
            best = None
            scanned = 0
            for k in rarest:
                if not (remain & (1 << k)):
                    continue
                eligible = [j for j in row_candidates[k]
                            if masks[j] & remain == masks[j]]
                if not eligible:
                    best = []
                    break
                if best is None or len(eligible) < len(best):
                    best = eligible
                scanned += 1
                if len(best) == 1 or scanned >= 48:
                    break
            if not best:
                continue
            choices = sorted(best, key=ordering.__getitem__)[:16]
            for j in reversed(choices):
                next_base = tuple(base_totals[k] + d[k][j]
                                  for k in range(len(d)))
                if any(
                        (nonnegative[k] and next_base[k] >
                         hi[k] + 1e-6 * max(1, abs(hi[k]))) or
                        (nonpositive[k] and next_base[k] <
                         lo[k] - 1e-6 * max(1, abs(lo[k])))
                        for k in range(len(d))):
                    continue
                chain.append((parent, j))
                stack.append((remain ^ masks[j], len(chain) - 1,
                              next_base))
    return None


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
    """Queue-driven exact singleton propagation with original column IDs.

    Every active rotation is invalidated at most once; coverage counts for
    other uncovered rows update only along its incidence edges. Empty
    rotations remain eligible for separate base bounds or negative costs.
    This replaces repeated global sorted-row rescans with O(nnz+m+n) work.
    """
    from collections import deque
    m, n, costs, columns, incidence, d, lo, hi = p
    active = bytearray(b"\x01") * n
    for j in disabled:
        if 0 <= j < n:
            active[j] = 0
    row_remaining = [sum(active[j] for j in incidence[row])
                     for row in range(m)]
    if any(count == 0 for count in row_remaining):
        return None
    uncovered = bytearray(b"\x01") * m
    pending = deque(i for i, count in enumerate(row_remaining) if count == 1)
    forced = []
    while pending:
        row = pending.popleft()
        if not uncovered[row] or row_remaining[row] != 1:
            continue
        singleton = next((j for j in incidence[row] if active[j]), None)
        if singleton is None:
            return None
        # Mark the selected rotation's covered rows before removing every
        # conflicting column, so counts are updated only for still-open rows.
        covered = set(columns[singleton])
        if not covered or any(not uncovered[r] for r in covered):
            return None
        forced.append(singleton)
        for r in covered:
            uncovered[r] = 0
        for r in covered:
            for j in incidence[r]:
                if not active[j]:
                    continue
                active[j] = 0
                for affected in set(columns[j]):
                    if not uncovered[affected]:
                        continue
                    row_remaining[affected] -= 1
                    if row_remaining[affected] == 0:
                        return None
                    if row_remaining[affected] == 1:
                        pending.append(affected)
    return sorted(forced), [r for r in range(m) if uncovered[r]], [
        j for j in range(n) if active[j]]


def cp_sat_side_compact(p, deadline, incumbent=None, feasibility_only=True,
                        reduction=None):
    """Exact-cover CP-SAT in physically compacted original-index space.

    Forced columns are carried into the objective and side-bound offsets.
    Fractional side coefficients use outward-rounded *relaxations*, so a
    genuine feasible schedule cannot be removed by decimal quantization.
    Every returned original-ID schedule passes the original independent check.
    An unhelpful reduction returns None to preserve time for the existing CP/MILP.
    """
    if time.monotonic() >= deadline - 0.75:
        return None
    m, n, costs, columns, incidence, d, lo, hi = p
    if reduction is None:
        reduction = reduce_forced_rotations(p, dominated_rotations(p))
    if reduction is None:
        return None
    forced, uncovered, active = reduction
    if not active:
        return forced if verify(p, forced) else None
    # Use the compact model only when actual variables or constraints disappear.
    # An unhelpful reduction never costs a second full CP-SAT search.
    if (len(active) * 100 > n * 92 and
            len(uncovered) * 100 > m * 92):
        return None
    if (len(active) > 25000 or len(uncovered) > 12000 or
            sum(len(columns[j]) for j in active) > 1000000):
        return None
    try:
        from ortools.sat.python import cp_model
    except ImportError:
        return None
    if not feasibility_only and any(
            not math.isfinite(v) or abs(v - round(v)) > 1e-8
            for v in costs):
        # Fractional objective remains in original floating HiGHS MILP.
        return None
    index = {j: z for z, j in enumerate(active)}
    model = cp_model.CpModel()
    variables = [model.new_bool_var(f"orig_{j}") for j in active]
    for count, row in enumerate(uncovered):
        eligible = [variables[index[j]] for j in incidence[row] if j in index]
        if not eligible:
            return None
        model.add_exactly_one(eligible)
        if count % 1000 == 0 and time.monotonic() > deadline - 0.7:
            return None
    for k, base in enumerate(d):
        if time.monotonic() > deadline - 0.7:
            return None
        values = [Decimal(str(base[j])) for j in active]
        original = [Decimal(str(base[j])) for j in forced]
        bound_lo, bound_hi = Decimal(str(lo[k])), Decimal(str(hi[k]))
        if any(not v.is_finite() for v in
               [bound_lo, bound_hi, *values, *original]):
            return None
        digits = max((max(0, -v.as_tuple().exponent)
                      for v in [bound_lo, bound_hi, *values, *original]
                      if v), default=0)
        # High-precision coefficients are safely *relaxed* by outward
        # rounding; rounding to nearest with a fixed +/- 1 tolerance is
        # not safe when many tiny coefficient errors accumulate.
        scale = 10 ** min(8, digits)
        scaled = [v * scale for v in values]
        lower_coef = [int(v.to_integral_value(rounding=ROUND_CEILING))
                      for v in scaled]
        upper_coef = [int(v.to_integral_value(rounding=ROUND_FLOOR))
                      for v in scaled]
        offset = sum(original, Decimal(0))
        tol_lo = Decimal("0.000001") * max(Decimal(1), abs(bound_lo))
        tol_hi = Decimal("0.000001") * max(Decimal(1), abs(bound_hi))
        lower_rhs = int(((bound_lo - tol_lo - offset) * scale)
                        .to_integral_value(rounding=ROUND_FLOOR))
        upper_rhs = int(((bound_hi + tol_hi - offset) * scale)
                        .to_integral_value(rounding=ROUND_CEILING))
        # CP-SAT requires safe int64 linear activity ranges.
        if (max([abs(lower_rhs), abs(upper_rhs),
                 *map(abs, lower_coef), *map(abs, upper_coef)],
                default=0) * max(1, len(active)) > 10**15):
            return None
        model.add(sum(a * v for a, v in zip(lower_coef, variables)
                      if a) >= lower_rhs)
        model.add(sum(a * v for a, v in zip(upper_coef, variables)
                      if a) <= upper_rhs)
    if incumbent is not None and verify(p, incumbent):
        incumbent_ids = set(incumbent)
        for j, v in zip(active, variables):
            model.add_hint(v, int(j in incumbent_ids))
    if not feasibility_only:
        model.minimize(sum(int(round(costs[j])) * v
                           for j, v in zip(active, variables)))
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 2
    solver.parameters.max_time_in_seconds = max(
        0.1, deadline - time.monotonic() - 0.25)
    solver.parameters.stop_after_first_solution = feasibility_only
    solver.parameters.random_seed = 31103
    try:
        status = solver.solve(model)
    except Exception:
        return None
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None
    selected = forced + [j for j, v in zip(active, variables)
                         if solver.value(v)]
    return selected if verify(p, selected) else None


def sparse_milp(p, deadline, reduction=None):
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
    if reduction is None:
        reduction=reduce_forced_rotations(p,dominated_rotations(p))
    reduced=reduction
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
    # MPC CEGAR repair: the legacy MRV fallback completely disabled itself
    # above 180 rows. A separate bounded sparse search now tries to obtain a
    # valid large-instance incumbent before any expensive native optimizer.
    reduced = None
    reduction_ready = False
    if backup is None and m > 180 and time.monotonic() < until - 2.0:
        reduced = reduce_forced_rotations(p, dominated_rotations(p))
        reduction_ready = True
        if reduced is not None:
            option = large_sparse_cover(
                p, min(until, time.monotonic() + 1.5), reduction=reduced)
            if verify(p, option):
                backup = option
    # Method selection by structure: integer exact cover -> CP-SAT;
    # real-valued base constraints -> sparse MILP with numerical validation.
    if not p[5] and time.monotonic() < until - 0.8:
        option = cp_sat(p, min(until, time.monotonic() + 22.0), backup)
        if verify(p, option) and (backup is None or objective(p, option) < objective(p, backup) - 1e-8):
            backup = option
    # One version-bound exact reduction shared by side CP and HiGHS MILP.
    # This avoids repeating column elimination/matrix recovery in each method.
    if p[5] and not reduction_ready and time.monotonic() < until - 1.3:
        reduced = reduce_forced_rotations(p, dominated_rotations(p))
        reduction_ready = True
    # First try the physically smaller, proof-preserving CP model; retain
    # the original full CP-SAT as an independently structured rescue.
    if p[5] and backup is None and time.monotonic() < until - 1.0:
        option = cp_sat_side_compact(
            p, min(until, time.monotonic() + 7.0),
            reduction=reduced, feasibility_only=True)
        if verify(p, option):
            backup = option
        elif time.monotonic() < until - 1.0:
            option = cp_sat_side(
                p, min(until, time.monotonic() + 9.0),
                feasibility_only=True)
            if verify(p, option):
                backup = option
    # Objective mirror runs on the reduced matrix only if it materially
    # shrank. If no gain is demonstrated, the original CP/MILP remain.
    if p[5] and backup is not None and time.monotonic() < until - 2.0:
        option = cp_sat_side_compact(
            p, min(until - 1.0, time.monotonic() + 4.0),
            incumbent=backup, feasibility_only=False, reduction=reduced)
        if verify(p, option) and objective(p, option) < objective(p, backup) - 1e-8:
            backup = option
        elif option is None and time.monotonic() < until - 1.0:
            option = cp_sat_side(
                p, min(until - 1.0, time.monotonic() + 4.0),
                incumbent=backup, feasibility_only=False)
            if verify(p, option) and objective(p, option) < objective(p, backup) - 1e-8:
                backup = option
    if time.monotonic() < until - 0.8:
        option = sparse_milp(p, until, reduction=reduced)
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
