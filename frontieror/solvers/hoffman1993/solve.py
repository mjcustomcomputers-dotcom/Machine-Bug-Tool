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


def large_sparse_cover(p, deadline, reduction=None, reverse_bounds=True):
    """Bounded MRV incumbent recovery for large exact-cover models.

    Sparse bitset column masks + persistent parent-pointer paths avoid copying
    full selected schedules into each branch. This is a search heuristic:
    branch caps or deadlines return UNKNOWN (None), never INFEASIBLE.
    Every promoted answer is reconstructed to original IDs and verified with
    all literal floating base constraints.
    """
    if time.monotonic() >= deadline - 0.05:
        return None
    m, n, costs, columns, incidence, d, lo, hi = p
    # The original model may contain 15,000+ rows, yet exact singleton
    # propagation can leave only a few hundred *live* rows. Do not reject
    # a cheap feasibility search using obsolete pre-reduction dimensions.
    if reduction is None:
        reduction = reduce_forced_rotations(p, dominated_rotations(p))
    if reduction is None:
        return None
    forced, uncovered, active = reduction
    if not uncovered:
        return forced if verify(p, forced) else None
    if (len(uncovered)>12000 or len(active)>50000 or
            sum(len(columns[j]) for j in active)>400000):
        return None
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
    # Reverse feasibility: bound what the *uncovered rows can still supply*.
    # Splitting each active column's side effect evenly among its covered
    # rows yields a safe interval relaxation for every complete exact cover.
    # Add independent optional-empty-column bounds to avoid false pruning.
    q=len(d)
    side_envelopes=None
    if (reverse_bounds and 0<q<=8 and len(uncovered)*q<=50000
            and len(active)*q<=150000 and time.monotonic()<deadline-0.12):
        lower_shares=[[math.inf]*len(uncovered) for _ in range(q)]
        upper_shares=[[-math.inf]*len(uncovered) for _ in range(q)]
        empty_lower=[0.]*q
        empty_upper=[0.]*q
        for j in active:
            row_mask=masks.get(j)
            if not row_mask:
                if not columns[j]:
                    for k in range(q):
                        v=d[k][j]
                        empty_lower[k]+=min(0.,v)
                        empty_upper[k]+=max(0.,v)
                continue
            inv=1.0/length[j]
            for k in range(q):
                share=d[k][j]*inv
                remaining=row_mask
                while remaining:
                    bit=remaining & -remaining
                    remaining ^= bit
                    row=bit.bit_length()-1
                    if share<lower_shares[k][row]:
                        lower_shares[k][row]=share
                    if share>upper_shares[k][row]:
                        upper_shares[k][row]=share
        if all(math.isfinite(v) for seq in lower_shares for v in seq) and all(
                math.isfinite(v) for seq in upper_shares for v in seq):
            initial_low=tuple(math.fsum(shares)+empty_lower[k]
                              for k,shares in enumerate(lower_shares))
            initial_high=tuple(math.fsum(shares)+empty_upper[k]
                               for k,shares in enumerate(upper_shares))
            side_envelopes=(lower_shares,upper_shares,initial_low,initial_high)
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
    # Retain verified leaves across all orderings: returning the first feasible
    # cover caused a large private instance to keep an avoidably weak objective.
    best_solution = None
    best_cost = math.inf
    initial_cost = math.fsum(costs[j] for j in forced)
    nonnegative_costs = all(costs[j] >= 0 for j in active)
    for ordering in orderings:
        if time.monotonic() >= deadline - 0.03:
            break
        chain = []  # (parent-index, original column ID)
        envelope_low=side_envelopes[2] if side_envelopes else ()
        envelope_high=side_envelopes[3] if side_envelopes else ()
        stack = [(initial_mask, -1, initial_base, initial_cost,
                  envelope_low,envelope_high)]
        examined = 0
        # The private failure was a no-incumbent exit on the large Crew case.
        # Spend a larger, still bounded feasibility slice before native MIP;
        # persistent parent chains keep this cap well below the memory limit.
        while stack and examined < 24000:
            if (examined & 31) == 0 and time.monotonic() >= deadline - 0.025:
                break
            remain, parent, base_totals, score, remaining_min, remaining_max = stack.pop()
            examined += 1
            if nonnegative_costs and score >= best_cost - 1e-10:
                continue
            if side_envelopes and any(
                    base_totals[k]+remaining_min[k]>hi[k]+1e-6*max(1.,abs(hi[k])) or
                    base_totals[k]+remaining_max[k]<lo[k]-1e-6*max(1.,abs(lo[k]))
                    for k in range(q)):
                continue
            if not remain:
                chosen = list(forced)
                node = parent
                while node != -1:
                    previous, j = chain[node]
                    chosen.append(j)
                    node = previous
                if verify(p, chosen):
                    candidate_cost = objective(p, chosen)
                    if candidate_cost < best_cost - 1e-10:
                        best_solution = sorted(chosen)
                        best_cost = candidate_cost
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
            choices = sorted(best, key=ordering.__getitem__)[:20]
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
                if side_envelopes:
                    lower_shares,upper_shares,_,_=side_envelopes
                    removed=masks[j]
                    row_ids=[]
                    while removed:
                        bit=removed & -removed
                        removed ^= bit
                        row_ids.append(bit.bit_length()-1)
                    next_min=tuple(remaining_min[k]-math.fsum(
                                   lower_shares[k][r] for r in row_ids)
                                   for k in range(q))
                    next_max=tuple(remaining_max[k]-math.fsum(
                                   upper_shares[k][r] for r in row_ids)
                                   for k in range(q))
                    if any(next_base[k]+next_min[k]>hi[k]+1e-6*max(1.,abs(hi[k])) or
                           next_base[k]+next_max[k]<lo[k]-1e-6*max(1.,abs(lo[k]))
                           for k in range(q)):
                        continue
                else:
                    next_min,next_max=(),()
                chain.append((parent, j))
                stack.append((remain ^ masks[j], len(chain) - 1,
                              next_base, score + costs[j],next_min,next_max))
    return best_solution


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
        # Preserve every original feasible schedule under finite decimal
        # quantization. Nearest rounding with a fixed +/-1 scaled allowance
        # can eliminate real solutions after many small errors accumulate.
        values=[Decimal(str(v)) for v in base]
        lower_d=Decimal(str(lo[k]))
        upper_d=Decimal(str(hi[k]))
        if any(not v.is_finite() for v in [lower_d,upper_d,*values]):
            return None
        digits=max((max(0,-v.as_tuple().exponent)
                    for v in [lower_d,upper_d,*values] if v),default=0)
        scale=10**min(8,digits)
        lower_coef=[int((v*scale).to_integral_value(rounding=ROUND_CEILING))
                    for v in values]
        upper_coef=[int((v*scale).to_integral_value(rounding=ROUND_FLOOR))
                    for v in values]
        tol_lo=Decimal("0.000001")*max(Decimal(1),abs(lower_d))
        tol_hi=Decimal("0.000001")*max(Decimal(1),abs(upper_d))
        lower=int(((lower_d-tol_lo)*scale).to_integral_value(
            rounding=ROUND_FLOOR))
        upper=int(((upper_d+tol_hi)*scale).to_integral_value(
            rounding=ROUND_CEILING))
        if (max([abs(lower),abs(upper),*map(abs,lower_coef),
                 *map(abs,upper_coef)],default=0)*max(1,n)>10**15):
            return None
        model.add(sum(c*vars[j] for j,c in enumerate(lower_coef) if c)>=lower)
        model.add(sum(c*vars[j] for j,c in enumerate(upper_coef) if c)<=upper)
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
        # A repeated flight ID in one column violates exact-cover equality
        # whenever that column is selected. It must never dominate a valid
        # column with the same *set* of covered flights.
        if len(rows)!=len(set(rows)):
            dominated.add(j)
            continue
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








def independent_parity_atoms(matrix, lower, upper, max_bits=220,
                             source_tolerance=None):
    """Conservatively project exactly integral binary equalities into GF(2).

    Return independent XOR equations (bitmask, right-hand parity). If
    coefficients, bounds, dimensions, or floating representation cannot be
    established exactly, return no atoms. This is a *supplementary*
    propagation system, never a replacement for the original side bounds.
    """
    q,n=matrix.shape
    if n>max_bits or q>500 or n==0 or len(lower)!=q or len(upper)!=q:
        return []
    basis={}
    if source_tolerance is not None and len(source_tolerance)!=q:
        return []
    for k in range(q):
        if lower[k]!=upper[k]:
            continue
        rhs=lower[k]
        if not math.isfinite(rhs) or abs(rhs)>2**42 or rhs!=int(rhs):
            continue
        # Preserve every assignment accepted by the original magnitude-
        # scaled verifier, not only assignments satisfying ideal equalities.
        if source_tolerance is not None:
            tol=float(source_tolerance[k])
            if (not math.isfinite(tol) or tol<0 or
                    math.ceil(float(lower[k])-tol-1e-8)!=int(rhs) or
                    math.floor(float(upper[k])+tol+1e-8)!=int(rhs)):
                continue
        bits=0
        safe=True
        for z in range(n):
            coeff=float(matrix[k,z])
            if not math.isfinite(coeff) or abs(coeff)>2**36 or coeff!=int(coeff):
                safe=False
                break
            if int(coeff)&1:
                bits|=1<<z
        if not safe or not bits:
            continue
        parity=int(rhs)&1
        while bits:
            pivot=bits.bit_length()-1
            old=basis.get(pivot)
            if old is None:
                basis[pivot]=(bits,parity)
                break
            bits^=old[0]
            parity^=old[1]
        # A contradictory modulo-2 row cannot be used as a global
        # infeasibility certificate: the original verifier accepts
        # source-relative real-number tolerance. Keep the original model.
    return [basis[k] for k in sorted(basis,reverse=True)]


def parity_rank_density_profile(matrix, lower, upper, source_tolerance):
    """Measure independent safe XOR rank and structural coefficient density."""
    q,n=matrix.shape
    if n==0 or q==0:
        return {"n":n,"q":q,"rank":0,"rank_fraction":0.,
                "density":0.,"use_parity":False,"atoms":[]}
    atoms=independent_parity_atoms(matrix,lower,upper,
             source_tolerance=source_tolerance)
    rank=len(atoms)
    fraction=rank/max(1,n)
    density=float((matrix!=0).sum())/max(1,n*q)
    # Routing hypothesis to test on independent seeds, not a proof of speed.
    choose=(n>=12 and q>=8 and rank>=8 and fraction>=0.14 and
            density>=0.65)
    return {"n":n,"q":q,"rank":rank,"rank_fraction":fraction,
            "density":density,"use_parity":choose,"atoms":atoms}



def sonar_echo_classify(plain, parity, prior=False):
    """Two CP methods become a classifier via bounded search receipts."""
    pb=float(plain.get("num_branches",0.))
    xb=float(parity.get("num_branches",0.))
    pc=float(plain.get("num_conflicts",0.))
    xc=float(parity.get("num_conflicts",0.))
    if not all(math.isfinite(v) and v>=0 for v in (pb,xb,pc,xc)):
        return bool(prior),"invalid_counters"
    if min(pb,xb)<100:
        return bool(prior),"insufficient_search_feedback"
    if xb<=0.55*pb and xc<=1.7*max(1.,pc):
        return True,"xor_probe_branches"
    if pb<=0.55*xb and pc<=1.7*max(1.,xc):
        return False,"plain_probe_branches"
    return bool(prior),"rank_density_prior"


def sonar_feedback_cycle_rescue(p, deadline, reduction=None,
                               pulse_fraction=0.045, receipt=None):
    """PULSE method -> ECHO telemetry -> classify -> route -> original verify.

    Both finite probes and final search share one absolute deadline; no
    response is treated as original infeasibility or global optimality.
    """
    if time.monotonic()>deadline-1.5:return None
    if reduction is None:
        reduction=reduce_forced_rotations(p,dominated_rotations(p))
    if reduction is None:return None
    _,_,_,columns,_,d,lo,hi=p
    forced,uncovered,active=reduction
    if (len(uncovered)<24 or len(active)>30000 or not d or len(d)>400
            or any(len(columns[j]) not in (0,2) for j in active)):
        return None
    remaining=deadline-time.monotonic()
    if remaining<1.5:return None
    pulse=max(0.19,min(0.46,remaining*max(0.01,min(0.10,pulse_fraction))))
    echoes={}
    for name,flag in (("plain",False),("xor",True)):
        if time.monotonic()>deadline-0.7:return None
        observation={}
        trial_deadline=min(deadline-0.65,time.monotonic()+pulse)
        solution=coupled_cycle_choice_milp(
            p,trial_deadline,reduction=reduction,
            prefer_cp_feasibility=True,cp_parity=flag,
            telemetry=observation)
        echoes[name]=observation
        if verify(p,solution):
            if receipt is not None:
                receipt.update({"state":"FEASIBLE_PULSE","winner":name,
                                "echoes":echoes})
            return solution
    prior=bool(echoes.get("xor",{}).get("use_parity_prior",False))
    use_xor,reason=sonar_echo_classify(
        echoes.get("plain",{}),echoes.get("xor",{}),prior)
    if receipt is not None:
        receipt.update({"state":"NO_PULSE_WITNESS","winner":
                        "xor" if use_xor else "plain",
                        "reason":reason,"echoes":echoes})
    return coupled_cycle_choice_milp(
        p,deadline,reduction=reduction,
        prefer_cp_feasibility=True,cp_parity=use_xor)


def coupled_cycle_choice_milp(p, deadline, reduction=None,
                             feasibility_only=False, return_certificate=False,
                             rescue_first=False, prefer_cp_feasibility=False,
                             cp_parity=False, telemetry=None):
    """Exact reduction: degree-two pair-cover cycles -> coupled binary choices.

    The original exact-cover rows force exactly one of two alternating
    matchings for every even cycle. Retain every global base-side row by
    expressing its activity as side(A) + (side(B)-side(A))*y[c].
    Optional zero-cover rotations are additional free binary variables with
    their original objective and side effects. Forced rotations are offsets.
    This is a complete equivalent integer model for the certified subclass.
    Never interpret a timeout/absent witness as original infeasibility.
    """
    if time.monotonic()>=deadline-0.16:
        return (None,False) if return_certificate else None
    m,n,costs,columns,incidence,d,lo,hi=p
    if reduction is None:
        reduction=reduce_forced_rotations(p,dominated_rotations(p))
    if reduction is None:
        return (None,False) if return_certificate else None
    forced,uncovered,active=reduction
    if (len(uncovered)<4 or len(uncovered)>12000 or
            len(active)>30000 or len(d)>400 or
            len(d)*len(active)>2400000):
        return (None,False) if return_certificate else None
    rows=set(uncovered)
    incident={r:[] for r in uncovered}
    empties=[]
    for j in active:
        covered=columns[j]
        if not covered:
            empties.append(j)
        elif (len(covered)!=2 or covered[0]==covered[1] or
              covered[0] not in rows or covered[1] not in rows):
            return (None,False) if return_certificate else None
        else:
            incident[covered[0]].append(j)
            incident[covered[1]].append(j)
    if any(len(edges)!=2 for edges in incident.values()):
        return (None,False) if return_certificate else None
    def other_end(j,r):
        a,b=columns[j]
        return b if r==a else a
    def alternate(r,j):
        a,b=incident[r]
        return b if a==j else a
    remaining=set(uncovered)
    cycles=[]
    while remaining:
        if time.monotonic()>deadline-0.16:
            return (None,False) if return_certificate else None
        root=next(iter(remaining))
        cur=root
        chosen=incident[root][0]
        seen=set()
        a=[];b=[]
        while True:
            other=other_end(chosen,cur)
            if cur in seen or other in seen or cur==other:
                return (None,False) if return_certificate else None
            seen.add(cur);seen.add(other)
            a.append(chosen)
            forbidden=alternate(other,chosen)
            b.append(forbidden)
            cur=other_end(forbidden,other)
            if cur==root:break
            if cur in seen:
                return (None,False) if return_certificate else None
            chosen=alternate(cur,forbidden)
        remaining.difference_update(seen)
        cycles.append((a,b))
    if not cycles or 2*sum(len(a) for a,b in cycles)!=len(active)-len(empties):
        return (None,False) if return_certificate else None
    if (any(not math.isfinite(v) for v in costs) or
            any(not math.isfinite(v) for v in lo+hi)):
        return (None,False) if return_certificate else None
    try:
        import numpy as np
        from scipy.optimize import milp,Bounds,LinearConstraint
        from scipy.sparse import csr_matrix
    except ImportError:
        return (None,False) if return_certificate else None
    vars_count=len(cycles)+len(empties)
    if vars_count>10000:
        return (None,False) if return_certificate else None
    # All sums are expressed in the same source binary64 coefficient space
    # as the original scipy.optimize.milp formulation. Independently verify
    # reconstructed exact-cover and literal floating base constraints.
    fixed_cost=math.fsum(costs[j] for j in forced)
    objective=[]
    for a,b in cycles:
        ca=math.fsum(costs[j] for j in a)
        cb=math.fsum(costs[j] for j in b)
        fixed_cost+=ca
        objective.append(cb-ca)
    objective.extend(costs[j] for j in empties)
    if d:
        matrix=np.empty((len(d),vars_count),dtype=float)
        lhs=[]
        rhs=[]
        for k,row in enumerate(d):
            if any(not math.isfinite(row[j]) for j in active+forced):
                return (None,False) if return_certificate else None
            offset=math.fsum(row[j] for j in forced)
            for z,(a,b) in enumerate(cycles):
                aa=math.fsum(row[j] for j in a)
                bb=math.fsum(row[j] for j in b)
                offset+=aa
                matrix[k,z]=bb-aa
            for z,j in enumerate(empties):
                matrix[k,len(cycles)+z]=row[j]
            lhs.append(lo[k]-offset)
            rhs.append(hi[k]-offset)
        constraints=LinearConstraint(csr_matrix(matrix),
                                     np.asarray(lhs),np.asarray(rhs))
    else:
        constraints=None
    # Reverse the coupled constraints to reconstruct a feasible 0/1
    # assignment before a branch-and-bound search. The dense least-squares
    # solve is only attempted on small overdetermined equality systems.
    # It is a source-bound candidate generator, NEVER an optimality proof.
    recovered=None
    if (rescue_first and d and vars_count<=96 and len(d)>=vars_count and
            vars_count>0 and
            all(abs(a-b)<=1.e-12 for a,b in zip(lhs,rhs)) and
            time.monotonic()<deadline-0.22):
        try:
            vector=np.asarray(lhs,dtype=np.float64)
            proposal=np.linalg.lstsq(matrix,vector,rcond=None)[0]
            rounded=np.rint(proposal)
            if (np.isfinite(proposal).all() and
                    ((proposal>=-1.e-5)&(proposal<=1.+1.e-5)).all() and
                    np.max(np.abs(proposal-rounded))<=1.e-5 and
                    ((rounded==0)|(rounded==1)).all()):
                candidate=list(forced)
                for z,(a,b) in enumerate(cycles):
                    candidate.extend(b if rounded[z]>0.5 else a)
                candidate.extend(j for z,j in enumerate(empties)
                                 if rounded[len(cycles)+z]>0.5)
                if verify(p,candidate):
                    recovered=sorted(candidate)
                    if feasibility_only:
                        return ((recovered,False) if return_certificate
                                else recovered)
        except (np.linalg.LinAlgError,ValueError,MemoryError):
            pass
    # Algorithm switch after exact mathematical compression: coupled global
    # side equalities become at most one Boolean per cycle. Search for ANY
    # independently valid original cover before asking the MILP for an optimum.
    # Integer activity only; fractional/ambiguous data stays with original MILP.
    if prefer_cp_feasibility and d and time.monotonic()<deadline-0.10:
        try:
            from ortools.sat.python import cp_model
            if (not np.isfinite(matrix).all() or
                    not (matrix==np.rint(matrix)).all() or
                    (np.abs(matrix)>10**8).any()):
                raise ValueError("Nonintegral cycle choice data")
            model=cp_model.CpModel()
            ys=[model.new_bool_var(f"cycle_choice_{z}")
                for z in range(vars_count)]
            for k in range(len(d)):
                tol=1.e-6*max(1.,abs(lo[k]),abs(hi[k]))
                lower=int(math.ceil(lhs[k]-tol-1.e-8))
                upper=int(math.floor(rhs[k]+tol+1.e-8))
                if abs(lower)>10**13 or abs(upper)>10**13:
                    raise ValueError("Integer CP bound overflow")
                expr=sum(int(matrix[k,z])*ys[z]
                         for z in range(vars_count) if matrix[k,z]!=0.)
                model.add(expr>=lower)
                model.add(expr<=upper)
            if cp_parity:
                # XOR is valid only if original accepted tolerance cannot
                # admit a second integer activity for any transformed row.
                margins=[1.e-6*max(1.,abs(lo[k]),abs(hi[k]))
                         for k in range(len(d))]
                profile=parity_rank_density_profile(
                    matrix,np.asarray(lhs),np.asarray(rhs),margins)
                if telemetry is not None:
                    telemetry["parity_rank"]=profile["rank"]
                    telemetry["parity_fraction"]=profile["rank_fraction"]
                    telemetry["density"]=profile["density"]
                    telemetry["use_parity_prior"]=profile["use_parity"]
                atoms=(profile["atoms"] if cp_parity is True or
                       (cp_parity=="auto" and profile["use_parity"]) else [])
                for mask,bit in atoms:
                    lits=[ys[z] for z in range(vars_count)
                          if (mask>>z)&1]
                    if lits:
                        # AddBoolXOr(lits) enforces ODD parity; invert the
                        # first literal when RHS is even.
                        if bit==0:lits[0]=lits[0].Not()
                        model.add_bool_xor(lits)
            solver=cp_model.CpSolver()
            solver.parameters.num_search_workers=2
            solver.parameters.stop_after_first_solution=True
            solver.parameters.max_time_in_seconds=max(
                0.01,deadline-time.monotonic()-0.08)
            solver.parameters.random_seed=64103
            status=solver.solve(model)
            if telemetry is not None:
                telemetry["status"]=int(status)
                telemetry["method"]="xor" if cp_parity else "plain"
                for key in ("num_conflicts","num_branches","wall_time"):
                    try:
                        value=getattr(solver,key)
                        telemetry[key]=float(value() if callable(value) else value)
                    except (AttributeError,TypeError,ValueError,RuntimeError):
                        pass
            if status in (cp_model.OPTIMAL,cp_model.FEASIBLE):
                candidate=list(forced)
                for z,(a,b) in enumerate(cycles):
                    candidate.extend(b if solver.value(ys[z]) else a)
                candidate.extend(j for z,j in enumerate(empties)
                                 if solver.value(ys[len(cycles)+z]))
                if verify(p,candidate):
                    accepted=sorted(candidate)
                    return ((accepted,False) if return_certificate
                            else accepted)
        except (ImportError,ValueError,RuntimeError,OverflowError,MemoryError):
            pass
        return (recovered,False) if return_certificate else recovered
    try:
        left=max(0.05,deadline-time.monotonic()-0.10)
        result=milp(c=(np.zeros(vars_count) if feasibility_only else
                       np.asarray(objective,dtype=float)),
                    integrality=np.ones(vars_count,dtype=np.int32),
                    bounds=Bounds(np.zeros(vars_count),np.ones(vars_count)),
                    constraints=constraints,
                    options={'time_limit':left,'mip_rel_gap':(
                        0.0 if return_certificate else 0.01),
                             'presolve':True})
    except (ValueError,RuntimeError,MemoryError):
        return (recovered,False) if return_certificate else recovered
    if result.x is None:
        return (recovered,False) if return_certificate else recovered
    chosen=list(forced)
    for z,(a,b) in enumerate(cycles):
        chosen.extend(b if result.x[z]>0.5 else a)
    chosen.extend(j for z,j in enumerate(empties)
                  if result.x[len(cycles)+z]>0.5)
    checked=sorted(chosen) if verify(p,chosen) else None
    if (recovered is not None and
            (checked is None or objective(p,recovered)<objective(p,checked)-1e-8)):
        checked=recovered
        # The following certificate must be disabled if the independent
        # reconstruction, not the globally optimized MILP, wins.
        used_recovery=True
    else:
        used_recovery=False
    if not return_certificate:return checked
    try:
        certified=bool(checked is not None and not used_recovery and
                       not feasibility_only and result.status==0 and
                       float(result.mip_gap)<=1e-8 and
                       math.isfinite(float(result.mip_dual_bound)) and
                       abs(float(result.fun)-float(result.mip_dual_bound))<=
                       1e-8*max(1.,abs(float(result.fun))))
    except (AttributeError,TypeError,ValueError,OverflowError):
        certified=False
    return checked,certified

def exact_cycle_cover(p, deadline, reduction=None):
    """Finite exact-cover inversion for degree-two pair-rotation graphs.

    Every residual row is incident to exactly two available pair columns.
    Every connected component is then a cycle in the multigraph; a feasible
    even cycle has precisely two alternating perfect matchings. Compare both
    side-effect vectors exactly as bounded integers. If ALL components have
    identical side activity under both alternatives, choosing the cheaper
    perfect matching separately in each component proves global optimality.
    A failed condition is UNKNOWN to the full MILP, never an infeasibility
    certificate. The complete original model independently verifies output.
    """
    if time.monotonic() >= deadline-0.03:return None,False
    m,n,costs,columns,incidence,d,lo,hi=p
    if reduction is None:
        reduction=reduce_forced_rotations(p,dominated_rotations(p))
    if reduction is None:return None,False
    forced,uncovered,active=reduction
    if (len(uncovered)<4 or len(uncovered)>12000 or len(active)>30000 or
            len(d)>400 or len(d)*len(active)>2_000_000):
        return None,False
    open_rows=set(uncovered)
    incident={r:[] for r in uncovered}
    empties=[]
    for j in active:
        rr=columns[j]
        if not rr:
            empties.append(j)
        elif (len(rr)!=2 or rr[0]==rr[1] or
              rr[0] not in open_rows or rr[1] not in open_rows):
            return None,False
        else:
            incident[rr[0]].append(j)
            incident[rr[1]].append(j)
    if any(len(js)!=2 for js in incident.values()):
        return None,False
    if any(not math.isfinite(costs[j]) for j in active+forced):
        return None,False
    def other_end(j,r):
        a,b=columns[j]
        return b if a==r else a
    def alternative(r,j):
        a,b=incident[r]
        return b if a==j else a
    # A degree-two graph is entirely a union of cycles. One alternating
    # walk reconstructs BOTH perfect matching alternatives simultaneously:
    # accepted edge A, rejected neighbor edge B, advance, repeat.
    # A second BFS and two trial matching traversals are unnecessary.
    pending=set(uncovered)
    components=[]
    while pending:
        if time.monotonic() >= deadline-0.03:return None,False
        root=next(iter(pending))
        chosen=incident[root][0]
        current=root
        visited=set()
        a=[];b=[]
        while True:
            other=other_end(chosen,current)
            if current in visited or other in visited or current==other:
                return None,False
            visited.add(current);visited.add(other)
            a.append(chosen)
            forbidden=alternative(other,chosen)
            b.append(forbidden)
            current=other_end(forbidden,other)
            if current==root:
                break
            if current in visited:
                return None,False
            chosen=alternative(current,forbidden)
        # Counterexample-first inversion: check the first side row before
        # constructing any further graph components. A disagreement in one
        # cycle already falsifies the entire invariance proof.
        if d and (math.fsum(d[0][j] for j in a) !=
                  math.fsum(d[0][j] for j in b)):
            return None,False
        pending.difference_update(visited)
        components.append((a,b))
    if not components:return None,False
    # Inverse conservation oracle: reduce an entire component's two
    # alternating choices in a single batched matrix operation, independent
    # of graph traversal. Keep the small-q Python path for tiny microcases
    # where importing NumPy would cost more than the proof.
    if d:
        all_relevant=active+forced
        if len(d)*len(active)>=1500:
            try:
                import numpy as np
                matrix=np.asarray(d,dtype=np.float64)
                samples=matrix[:,all_relevant]
                if not (np.isfinite(samples).all() and
                        (np.abs(samples)<=float(2**27)).all() and
                        (samples==np.rint(samples)).all()):
                    return None,False
                if empties and not (matrix[:,empties]==0).all():
                    return None,False
                first=[];second=[];starts=[];position=0
                for a,b in components:
                    starts.append(position)
                    first.extend(a);second.extend(b)
                    position+=len(a)
                # A and B have the same cardinality per component. Every
                # original pair column occurs in exactly one alternative.
                # Each pair edge belongs to exactly one of the two
                # alternating matchings within its degree-two cycle.
                if (2*position!=len(active)-len(empties) or
                        position!=len(first) or position!=len(second)):
                    return None,False
                # np.rint+int64 is exact for our bounded integral inputs;
                # 12k rows * 2**27 stays strictly inside signed int64.
                left=np.add.reduceat(
                    matrix[:,first].astype(np.int64),starts,axis=1)
                right=np.add.reduceat(
                    matrix[:,second].astype(np.int64),starts,axis=1)
                if not np.array_equal(left,right):
                    return None,False
                total=left.sum(axis=1,dtype=np.int64)
                if forced:
                    total+=matrix[:,forced].astype(np.int64).sum(
                        axis=1,dtype=np.int64)
                if not (np.abs(total)<2**50).all() or not (
                        (total>=np.asarray(lo,dtype=np.float64)) &
                        (total<=np.asarray(hi,dtype=np.float64))).all():
                    return None,False
            except (ValueError,TypeError,OverflowError,MemoryError,ImportError):
                return None,False
        else:
            for k,row in enumerate(d):
                if any(not math.isfinite(row[j]) or
                       abs(row[j])>2**27 or row[j]!=int(row[j])
                       for j in all_relevant):
                    return None,False
                if any(row[j]!=0 for j in empties):
                    return None,False
                total=sum(int(row[j]) for j in forced)
                for a,b in components:
                    av=sum(int(row[j]) for j in a)
                    bv=sum(int(row[j]) for j in b)
                    if av!=bv:return None,False
                    total+=av
                if abs(total)>=2**50 or not lo[k]<=float(total)<=hi[k]:
                    return None,False
    selected=list(forced)
    for a,b in components:
        if math.fsum(costs[j] for j in a) <= math.fsum(costs[j] for j in b):
            selected.extend(a)
        else:
            selected.extend(b)
    selected.extend(j for j in empties if costs[j]<0)
    if not verify(p,selected):
        return None,False
    return sorted(selected),True


def pair_conserved_side_rows(p, reduction):
    """Exact parity-aware pair conservation, vectorized across side rows.

    Each pair edge enforces t[u]+t[v]=2*b[edge], with t=2*row potential.
    The graph/tree is traversed once and numpy int64 vector arithmetic
    checks every side row. Bipartite components need balanced partitions;
    odd-cycle components fix the root gauge. All accepted rows use strictly
    integral coefficients within conservative int64/float64 exact bounds.
    """
    _,_,_,columns,_,d,lo,hi=p
    if not d or reduction is None:return []
    forced,uncovered,active=reduction
    nrows=len(uncovered)
    q=len(d)
    if (nrows<2 or nrows>1600 or q>120 or
            q*len(active)>160000):return []
    index={r:i for i,r in enumerate(uncovered)}
    graph=[[] for _ in uncovered]
    edges=[]
    empties=[]
    for j in active:
        rows=columns[j]
        if not rows:
            empties.append(j)
            continue
        if len(rows)!=2 or rows[0]==rows[1]:return []
        u=index.get(rows[0]);v=index.get(rows[1])
        if u is None or v is None:return []
        graph[u].append((v,j));graph[v].append((u,j))
        edges.append(j)
    if not edges or any(not row for row in graph):return []
    try:
        import numpy as np
        # 2**27 keeps all component path sums far inside signed int64
        # under the row cap, including odd-cycle gauge corrections.
        chosen=edges+forced+empties
        values=np.asarray([[d[k][j] for j in chosen] for k in range(q)],
                          dtype=np.float64)
        safe=np.isfinite(values).all(axis=1)
        safe &= (np.abs(values)<=float(2**27)).all(axis=1)
        safe &= (values==np.rint(values)).all(axis=1)
        if empties:
            safe &= (values[:,-len(empties):]==0).all(axis=1)
        # Replace invalid values only inside the conservative classifier;
        # those source rows remain retained by the full model.
        values=np.where(np.isfinite(values) &
                        (np.abs(values)<=float(2**27)) &
                        (values==np.rint(values)),values,0).astype(np.int64)
        lookup={j:i for i,j in enumerate(chosen)}
        sign=[0]*nrows
        offsets=np.zeros((nrows,q),dtype=np.int64)
        totals=np.zeros(q,dtype=np.int64)
        for root in range(nrows):
            if sign[root]:continue
            sign[root]=1
            queue=[root]
            pos=0
            gauge=np.zeros(q,dtype=np.int64)
            anchored=np.zeros(q,dtype=bool)
            while pos<len(queue):
                u=queue[pos];pos+=1
                for v,j in graph[u]:
                    rhs=2*values[:,lookup[j]]
                    if not sign[v]:
                        sign[v]=-sign[u]
                        offsets[v]=rhs-offsets[u]
                        queue.append(v)
                    else:
                        residual=rhs-offsets[u]-offsets[v]
                        den=sign[u]+sign[v]
                        if den==0:
                            safe &= residual==0
                        else:
                            safe &= residual%den==0
                            value=residual//den
                            safe &= (~anchored)|(gauge==value)
                            gauge=np.where(anchored,gauge,value)
                            anchored[:]=True
                        # Counterexample-driven short circuit: all candidate
                        # side rows have failed an exact graph equation. No
                        # future graph edge can restore any certificate.
                        if not safe.any():
                            return []
            balance=sum(sign[v] for v in queue)
            if balance:
                safe &= anchored
            totals += offsets[queue].sum(axis=0,dtype=np.int64)
            totals += balance*gauge
        safe &= totals%2==0
        totals=totals//2
        if forced:
            first=len(edges)
            totals+=values[:,first:first+len(forced)].sum(axis=1,dtype=np.int64)
        safe &= (np.abs(totals)<2**50)
        safe &= (totals>=np.asarray(lo,dtype=np.float64))
        safe &= (totals<=np.asarray(hi,dtype=np.float64))
        return [int(k) for k in np.flatnonzero(safe)]
    except (ValueError,TypeError,OverflowError,MemoryError):
        return []


def conserved_side_rows(p, reduction):
    """Vectorized *exact integer* conservation identity over exact-cover rows.

    Determine each residual row's price from all singleton alternatives.
    Use compiled NumPy coefficient checks to establish b_j == sum(price[r]
    for r in column_j) for EVERY residual rotation, including empty columns.
    Each integer sum is bounded below 2**50, so float64 operations represent
    these integers exactly; non-integers, mismatches and larger values remain
    in the original MILP. Never infer a certificate from approximate equality.
    """
    m,n,costs,columns,incidence,d,lo,hi=p
    if not d or reduction is None:return []
    forced,uncovered,active=reduction
    if not uncovered or len(active)*len(d)>2500000:return []
    # Cross-direction graph proof: pair-only cover has no singleton basis,
    # but signed edge potentials may still fix the entire side activity.
    if all(len(columns[j]) in (0,2) and
           (len(columns[j])!=2 or columns[j][0]!=columns[j][1])
           for j in active):
        # Measured objective-preserving router: micro-sized side work often
        # costs less to leave with native MILP than to certify separately.
        # The exact graph proof remains independently callable.
        if len(active)*len(d)<8000:
            return []
        return pair_conserved_side_rows(p,reduction)
    row_id={r:i for i,r in enumerate(uncovered)}
    singles=[None]*len(uncovered)
    duplicate_singles=[]
    for j in active:
        rows=columns[j]
        if len(rows)==1:
            z=row_id.get(rows[0])
            if z is None:return []
            if singles[z] is None:singles[z]=j
            else:duplicate_singles.append((z,j))
    if any(j is None for j in singles):
        return []
    try:
        import numpy as np
    except ImportError:
        return []
    try:
        # This is one contiguous q by n block, reused for all row tests.
        matrix=np.asarray(d,dtype=np.float64)
        potentials=matrix[:,singles]
        safe=np.isfinite(potentials).all(axis=1)
        safe &= (np.abs(potentials)<=float(2**40)).all(axis=1)
        safe &= (potentials==np.rint(potentials)).all(axis=1)
        safe &= (np.abs(potentials).sum(axis=1)<float(2**50))
        for z,j in duplicate_singles:
            safe &= matrix[:,j]==potentials[:,z]
        # Traverse each coverage column once. The inner q-vector operations
        # run in compiled array code rather than Python nested q*m*n loops.
        for j in active:
            rows=columns[j]
            if len(rows)!=len(set(rows)):return []
            ids=[row_id.get(r) for r in rows]
            if any(z is None for z in ids):return []
            expected=(potentials[:,ids].sum(axis=1)
                      if ids else np.zeros(len(d),dtype=np.float64))
            safe &= np.isfinite(matrix[:,j])
            safe &= matrix[:,j]==expected
        if forced:
            chosen=matrix[:,forced]
            safe &= np.isfinite(chosen).all(axis=1)
            safe &= (chosen==np.rint(chosen)).all(axis=1)
            safe &= (np.abs(chosen).sum(axis=1)<float(2**50))
            totals=potentials.sum(axis=1)+chosen.sum(axis=1)
        else:
            totals=potentials.sum(axis=1)
        safe &= np.isfinite(totals)
        safe &= np.abs(totals)<float(2**50)
        safe &= totals>=np.asarray(lo,dtype=np.float64)
        safe &= totals<=np.asarray(hi,dtype=np.float64)
        return [int(k) for k in np.flatnonzero(safe)]
    except (ValueError,TypeError,OverflowError,MemoryError):
        return []


def redundant_side_rows(p, reduction):
    """Exact-cover side-constraint redundancy via per-row activity envelopes.

    With each covered row used exactly once, splitting every active column's
    side coefficient equally over its rows gives a valid interval for every
    complete cover. Optional empty columns contribute [min(0,a), max(0,a)].
    Only delete a side inequality if that entire interval lies strictly
    inside its literal bounds with a conservative numeric safety margin.
    Return source row indices; an UNKNOWN result retains all inequalities.
    This test is only applied after exact forced/duplicate reductions.
    """
    m,n,costs,columns,incidence,d,lo,hi=p
    if not d or reduction is None:
        return []
    forced,uncovered,active=reduction
    if not uncovered or not active or len(uncovered)>20000:
        return []
    row_id={r:z for z,r in enumerate(uncovered)}
    # Exact-cover shares are invalid when a column repeats a row or crosses a
    # forced-covered row. Such a case retains the literal original side rows.
    for j in active:
        rows=columns[j]
        if len(rows)!=len(set(rows)) or any(r not in row_id for r in rows):
            return []
    # First remove proven integer conservation equalities. Their activity
    # can be fixed by coverage even when the row-wise envelope is wide.
    redundant=conserved_side_rows(p,reduction)
    fixed=set(redundant)
    for k,base in enumerate(d):
        if k in fixed:continue
        if not (math.isfinite(lo[k]) and math.isfinite(hi[k])):
            continue
        if all(base[j]==0. for j in forced+active):
            if lo[k]<=0.<=hi[k]:
                redundant.append(k)
            continue
        minimum=[math.inf]*len(uncovered)
        maximum=[-math.inf]*len(uncovered)
        empty_min=empty_max=0.
        for j in active:
            rows=columns[j]
            coeff=base[j]
            if not math.isfinite(coeff):
                return []
            if not rows:
                empty_min+=min(0.,coeff)
                empty_max+=max(0.,coeff)
                continue
            share=coeff/len(rows)
            for r in rows:
                z=row_id[r]
                if share<minimum[z]:
                    minimum[z]=share
                if share>maximum[z]:
                    maximum[z]=share
        if any(not math.isfinite(x) for x in minimum+maximum):
            continue
        offset=math.fsum(base[j] for j in forced)
        lower=math.fsum(minimum)+offset+empty_min
        upper=math.fsum(maximum)+offset+empty_max
        if not (math.isfinite(lower) and math.isfinite(upper)):
            continue
        guard=1.e-7*max(1.,abs(lower),abs(upper),
                         abs(lo[k]),abs(hi[k]))+1.e-12*len(active)
        if lower-guard>=lo[k] and upper+guard<=hi[k]:
            redundant.append(k)
    return redundant


def exact_residual_components(p, deadline, reduction=None):
    """Solve side-independent residual exact-cover components with finite DP.

    A side inequality may be dropped only when the established exact-cover
    envelope proves it redundant (or its active effect is identically zero).
    Otherwise global coupling remains and the full MILP takes control.
    Component DP enumerates all disjoint covers via memoized uncovered-row
    masks, including every eligible original rotation; it may prove optimum.
    Negative-cost optional empty columns are retained independently.
    """
    if time.monotonic()>deadline-0.15:return None,False
    m,n,costs,columns,incidence,d,lo,hi=p
    if reduction is None:
        reduction=reduce_forced_rotations(p,dominated_rotations(p))
    if reduction is None:return None,False
    forced,uncovered,active=reduction
    if not uncovered or len(active)<12 or len(active)>30000:
        return None,False
    row_id={r:z for z,r in enumerate(uncovered)}
    # Disjoint-set of residual rows using each surviving nonempty column as a
    # hyperedge. No coverage edge may be cut by the component split.
    parent=list(range(len(uncovered)))
    def find(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]]
            i=parent[i]
        return i
    def union(a,b):
        a,b=find(a),find(b)
        if a!=b:parent[b]=a
    for j in active:
        rows=columns[j]
        if not rows:continue
        if len(rows)!=len(set(rows)) or any(r not in row_id for r in rows):
            return None,False
        first=row_id[rows[0]]
        for r in rows[1:]:union(first,row_id[r])
    comp_rows={}
    for r in uncovered:
        comp_rows.setdefault(find(row_id[r]),[]).append(r)
    if len(comp_rows)<2:return None,False
    # Invert the expensive work order: first prove coverage is disconnected,
    # THEN scan the base-side matrix. Connected coverage cannot benefit from
    # this shortcut regardless of how many side rows may later disappear.
    if len(d)*len(active)>4000000:
        return None,False
    redundant=set(redundant_side_rows(p,reduction))
    for k in range(len(d)):
        if k in redundant:continue
        offset=math.fsum(d[k][j] for j in forced)
        if any(d[k][j]!=0. for j in active) or not lo[k]<=offset<=hi[k]:
            return None,False
    comp_columns={k:[] for k in comp_rows}
    selected=list(forced)
    for j in active:
        if not columns[j]:
            if costs[j]<0:selected.append(j)
            continue
        comp_columns[find(row_id[columns[j][0]])].append(j)
    # Guard pathological state counts; a broad coupled problem remains for
    # the existing HiGHS/CP-SAT portfolio rather than losing its deadline.
    for root,rows in comp_rows.items():
        if (len(rows)>20 or len(comp_columns[root])>250 or
                time.monotonic()>deadline-0.12):
            return None,False
        local={r:i for i,r in enumerate(rows)}
        eligible=[[] for _ in rows]
        mask={}
        for j in comp_columns[root]:
            bits=0
            for r in columns[j]:
                bits|=1<<local[r]
            mask[j]=bits
            for r in columns[j]:eligible[local[r]].append(j)
        if any(not choices for choices in eligible):return None,False
        memo={0:(0.,())}
        visited=[0]
        def best_cover(remain):
            cached=memo.get(remain)
            if cached is not None:return cached
            visited[0]+=1
            if visited[0]>50000 or (visited[0]&127)==0 and (
                    time.monotonic()>deadline-0.12):
                raise TimeoutError
            pivot=(remain&-remain).bit_length()-1
            best=(math.inf,())
            for j in eligible[pivot]:
                bits=mask[j]
                if bits&remain!=bits:continue
                subcost,tail=best_cover(remain^bits)
                value=costs[j]+subcost
                if value<best[0]:best=(value,(j,)+tail)
            memo[remain]=best
            return best
        try:
            value,choice=best_cover((1<<len(rows))-1)
        except (TimeoutError,RecursionError,MemoryError):
            return None,False
        if not math.isfinite(value):return None,False
        selected.extend(choice)
    if not verify(p,selected):return None,False
    return sorted(selected),True



def compact_side_atoms(p, reduction, exclude=()):
    """Lossless residual side-row atom compression.

    After forced columns are fixed, identical or sign-inverted active
    coefficient vectors describe the *same scalar activity*. Intersect
    their intervals and retain one representative row. Never merge
    approximate proportional rows: float rounding could alter feasibility.
    Missing or inconsistent bounds retain original rows for solver handling.
    Every returned solution is checked against the untouched full model.

    Output: (original row id, residual lower, residual upper) records.
    """
    _,_,_,_,_,d,lo,hi=p
    if not d:return []
    forced,uncovered,active=reduction
    excluded=set(exclude)
    records=[]
    if len(active)*len(d)>3_000_000 or len(d)<2:
        for k in range(len(d)):
            if k in excluded:continue
            offset=math.fsum(d[k][j] for j in forced)
            records.append((k,lo[k]-offset,hi[k]-offset))
        return records
    # Necessary-condition prefilter: identical or sign-inverted vectors
    # must have identical sums of absolute active coefficients. If every
    # fingerprint is distinct, skip building full sparse atom signatures.
    # Collisions merely trigger exact checks; they never justify merging.
    if len(active)>32 and len(d)>=8:
        sums=set()
        maybe_repeated=False
        for k,base in enumerate(d):
            if k in excluded:continue
            checksum=sum(abs(base[j]) for j in active)
            if checksum in sums:
                maybe_repeated=True
                break
            sums.add(checksum)
        if not maybe_repeated:
            for k,base in enumerate(d):
                if k in excluded:continue
                offset=math.fsum(base[j] for j in forced)
                records.append((k,lo[k]-offset,hi[k]-offset))
            return records
    seen={}
    for k,base in enumerate(d):
        if k in excluded:continue
        offset=math.fsum(base[j] for j in forced)
        lower=lo[k]-offset
        upper=hi[k]-offset
        # Keep malformed/non-finite constraint rows unchanged, allowing
        # the previous optimizer to decide, rather than invent a rounding
        # or missing-data equivalence.
        if not all(math.isfinite(x) for x in (lower,upper)):
            records.append((k,lower,upper))
            continue
        signed=[]
        for z,j in enumerate(active):
            x=base[j]
            if not math.isfinite(x):
                signed=None
                break
            if x!=0.:signed.append((z,x))
        if signed is None:
            records.append((k,lower,upper))
            continue
        inverse=bool(signed and signed[0][1]<0.)
        if inverse:
            key=tuple((z,-v) for z,v in signed)
            lower,upper=-upper,-lower
        else:
            key=tuple(signed)
        group=seen.get(key)
        if group is None:
            seen[key]=(len(records),inverse)
            # Bounds must be stored in the original representative row's
            # coefficient orientation, not the canonical positive signature.
            records.append((k,-upper if inverse else lower,
                            -lower if inverse else upper))
        else:
            position,representative_inverse=group
            representative,old_lower,old_upper=records[position]
            # Transform canonical activity bounds back into the chosen
            # representative's coefficient direction before intersecting.
            if representative_inverse:
                lower,upper=-upper,-lower
            records[position]=(representative,max(old_lower,lower),
                               min(old_upper,upper))
    return records

def sparse_milp(p, deadline, reduction=None, feasibility_only=False, return_certificate=False):
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
        result=forced if verify(p,forced) else None
        return (result,bool(result is not None and not feasibility_only)) if return_certificate else result
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
        redundant=redundant_side_rows(p,reduced)
        atoms=compact_side_atoms(p,reduced,redundant)
        if atoms:
            A=vstack([A,csr_matrix(np.asarray(
                [[d[k][j] for j in active] for k,_,_ in atoms],dtype=float))],
                format="csr")
            lhs += [lower for _,lower,_ in atoms]
            rhs += [upper for _,_,upper in atoms]
    try:
        result = milp(
            c=(np.zeros(len(active),dtype=float) if feasibility_only
               else np.asarray([costs[j] for j in active],dtype=float)),
            integrality=np.ones(len(active), dtype=np.int32),
            bounds=Bounds(np.zeros(len(active)), np.ones(len(active))),
            constraints=LinearConstraint(A, np.asarray(lhs), np.asarray(rhs)),
            options={"time_limit": max(0.1, deadline - time.monotonic() - 0.15),
                     "mip_rel_gap": (0.0 if return_certificate and
                                       len(active)<=1800 and
                                       len(uncovered)<=1800 else 0.005),
                     "presolve": True}
        )
    except (ValueError, RuntimeError, MemoryError):
        return None
    if result.x is None:
        return None
    selected = forced + [active[z] for z, x in enumerate(result.x) if x > 0.5]
    checked = selected if verify(p,selected) else None
    if not return_certificate:
        return checked
    # Only a zero-gap objective solve over the complete exact-safe reduction
    # can certify optimum. A feasibility-only MILP never yields this signal.
    try:
        bound=float(getattr(result,'mip_dual_bound',math.nan))
        val=float(getattr(result,'fun',math.nan))
        gap=float(getattr(result,'mip_gap',math.inf))
        proof=bool(checked is not None and not feasibility_only and
                   result.status==0 and math.isfinite(bound) and
                   math.isfinite(val) and gap<=1e-8 and
                   abs(val-bound)<=1e-8*max(1.0,abs(val)))
    except (TypeError,ValueError,OverflowError):
        proof=False
    return checked,proof



def _highs_stream_incumbents(p, deadline, reduction, sender, incumbent=None,
                            decision=False, lower_bound=None):
    """Use HiGHS' improving-MIP-solution callback as an anytime witness stream.

    Only parent-confirmed original-instance solutions affect the submission.
    The optional threshold mode *inverts objective optimization* into finding
    any feasible assignment with cost below an independently checked incumbent.
    If the highspy interface is unavailable, callers retain their SciPy path.
    """
    try:
        import numpy as np
        import highspy
        from scipy.sparse import coo_matrix, vstack, csr_matrix
    except ImportError:
        return None
    m,n,costs,columns,incidence,d,lo,hi=p
    if reduction is None:
        reduction=reduce_forced_rotations(p,dominated_rotations(p))
    if reduction is None:
        return None
    forced,uncovered,active=reduction
    if not active:
        return forced if verify(p,forced) else None
    if (len(active)>30000 or len(uncovered)>15000 or
            sum(len(columns[j]) for j in active)>800000 or
            time.monotonic()>deadline-0.7):
        return None
    idx={row:z for z,row in enumerate(uncovered)}
    rr=[];cc=[]
    for z,j in enumerate(active):
        for row in columns[j]:
            if row in idx:
                rr.append(idx[row]);cc.append(z)
    mat=coo_matrix((np.ones(len(rr),dtype=np.double),(rr,cc)),
                   shape=(len(uncovered),len(active))).tocsr()
    lbs=np.ones(len(uncovered),dtype=np.double)
    ubs=np.ones(len(uncovered),dtype=np.double)
    if d:
        # Share the same exact compressed side atoms with SciPy and native
        # HiGHS; both retain original-model verification and original IDs.
        atoms=compact_side_atoms(
            p,reduction,redundant_side_rows(p,reduction))
        if atoms:
            side=csr_matrix(np.asarray(
                [[d[k][j] for j in active] for k,_,_ in atoms],
                dtype=np.double))
            mat=vstack((mat,side),format='csr')
            lbs=np.concatenate((lbs,np.asarray(
                [low for _,low,_ in atoms])))
            ubs=np.concatenate((ubs,np.asarray(
                [high for _,_,high in atoms])))
    selected_fixed=math.fsum(costs[j] for j in forced)
    if decision:
        if not verify(p,incumbent) or not math.isfinite(lower_bound):
            return None
        upper_cost=objective(p,incumbent)
        if lower_bound >= upper_cost - 1e-7:
            return None
        gap=upper_cost-lower_bound
        target=upper_cost-max(1e-6,0.06*gap)
        # The full original costs become an exact, globally valid feasibility
        # constraint. Nothing is permanently removed from the candidate pool.
        costs_row=csr_matrix(np.asarray([[costs[j] for j in active]],
                                        dtype=np.double))
        mat=vstack((mat,costs_row),format='csr')
        lbs=np.concatenate((lbs,np.asarray([-np.inf])))
        ubs=np.concatenate((ubs,np.asarray([target-selected_fixed])))
    if time.monotonic()>deadline-0.5:
        return None
    model=highspy.Highs()
    model.setOptionValue('output_flag',False)
    model.setOptionValue('threads',2)
    model.setOptionValue('time_limit',max(0.2,deadline-time.monotonic()-0.15))
    model.setOptionValue('mip_rel_gap',0.01 if not decision else 0.05)
    model.addVars(len(active),np.zeros(len(active),dtype=np.double),
                  np.ones(len(active),dtype=np.double))
    ids=np.arange(len(active),dtype=np.int32)
    model.changeColsIntegrality(len(active),ids,
        np.array([highspy.HighsVarType.kInteger]*len(active)))
    col_cost=np.zeros(len(active),dtype=np.double) if decision else np.asarray(
        [costs[j] for j in active],dtype=np.double)
    model.changeColsCost(len(active),ids,col_cost)
    mat.sort_indices()
    model.addRows(mat.shape[0],np.asarray(lbs,dtype=np.double),
        np.asarray(ubs,dtype=np.double),len(mat.data),
        np.asarray(mat.indptr[:-1],dtype=np.int32),
        np.asarray(mat.indices,dtype=np.int32),
        np.asarray(mat.data,dtype=np.double))
    # Native MIP start: a checked incumbent is not merely a comparison bound.
    # Warm-starting HiGHS gives its internal branch-and-bound an admissible
    # upper objective bound from the first node, avoiding redundant discovery.
    # The decision variant has a stricter cost row; that incumbent is NOT a
    # valid warm-start there. If reduction excluded any selected column, skip.
    if not decision and verify(p,incumbent):
        active_set=set(active)
        incumbent_set=set(incumbent)
        if (set(forced).issubset(incumbent_set) and
                incumbent_set.issubset(active_set | set(forced))):
            try:
                primal=np.asarray([float(j in incumbent_set) for j in active],
                                  dtype=np.double)
                model.setSolution(len(active),ids,primal)
            except (AttributeError,TypeError,ValueError,RuntimeError):
                pass  # Optional accelerator; never change baseline feasibility.
    best_cost=objective(p,incumbent) if verify(p,incumbent) else math.inf
    best=None
    last_emit=0.0
    submitted=0
    def on_incumbent(kind,message,values,data_in,user_data):
        nonlocal best,best_cost,last_emit,submitted
        if kind != highspy.cb.HighsCallbackType.kCallbackMipImprovingSolution:
            return
        try:
            sol=values.mip_solution
            if sol is None:
                return
            original=forced+[j for z,j in enumerate(active) if sol[z]>0.5]
            if verify(p,original):
                candidate_cost=objective(p,original)
                if candidate_cost<best_cost-1e-7:
                    best=original
                    best_cost=candidate_cost
                    # Keep callback lightweight; the parent independently
                    # checks all constraints and compares objective once more.
                    now=time.monotonic()
                    if submitted==0 or now-last_emit>=0.40:
                        sender.send(('improving',original))
                        last_emit=now
                        submitted+=1
                    if decision:
                        data_in.user_interrupt=True
        except (BrokenPipeError,EOFError,OSError):
            pass
    model.setCallback(on_incumbent,None)
    model.startCallback(highspy.cb.HighsCallbackType.kCallbackMipImprovingSolution)
    model.run()
    try:
        values=model.getSolution().col_value
        if len(values)==len(active):
            result=forced+[j for z,j in enumerate(active) if values[z]>.5]
            if verify(p,result) and objective(p,result)<best_cost-1e-7:
                best=result
    except (TypeError,ValueError,RuntimeError):
        pass
    return best


def _cover_dual_lower_bound(p):
    """Exact-cover row-price dual, safe for signed costs and empty columns.

    Each row receives the cheapest per-row share of every incident rotation;
    summing these prices cannot exceed the cost of any nonempty selected
    rotation. Empty rotations contribute their most negative possible cost.
    This is a provable (possibly weak) global objective lower bound.
    """
    m,n,costs,columns,incidence,d,lo,hi=p
    if any(not math.isfinite(v) for v in costs):
        return -math.inf
    weights=[]
    for choices in incidence:
        if not choices:
            return -math.inf
        prices=[costs[j]/len(columns[j]) for j in choices if columns[j]]
        if not prices:
            return -math.inf
        weights.append(min(prices))
    # Empty rotations have no cover rows and may be selected independently.
    # They are never silently assumed absent merely because they are costly.
    return math.fsum(weights)+math.fsum(
        min(0.,costs[j]) for j,rows in enumerate(columns) if not rows)


def _bound_proves_optimum(p, incumbent, lower_bound):
    if not verify(p,incumbent) or not math.isfinite(lower_bound):
        return False
    return objective(p,incumbent)<=lower_bound+1e-8*max(1.,abs(lower_bound))


def _crew_result(p, incumbent):
    chosen=sorted(incumbent)
    selected=set(chosen)
    return {'objective_value':objective(p,chosen),
            'selected_rotations':chosen,
            'variable_values':{str(j):float(j in selected)
                               for j in range(p[1])}}


def _objective_neighborhood(p, incumbent, deadline):
    """Restricted exact-cover MILP neighborhood, fixed outside freed rows.

    Selected rotations whose legs lie in a selected neighborhood are freed;
    alternate columns must fit wholly inside it. All original side-window
    residuals remain exact. Never promote unverified or more expensive choices.
    """
    if not verify(p, incumbent) or time.monotonic() >= deadline - 0.15:
        return incumbent
    try:
        import numpy as np
        from scipy.optimize import milp, Bounds, LinearConstraint
        from scipy.sparse import coo_matrix, vstack, csr_matrix
    except ImportError:
        return incumbent
    m,n,costs,columns,incidence,d,lo,hi=p
    original=list(incumbent)
    best=sorted(original)
    best_score=objective(p,best)
    selected_nonempty=[j for j in original if columns[j]]
    if len(selected_nonempty)<2:
        return best
    # Rank expensive incumbent rotations first; subsequent windows reach
    # different sparse neighborhoods rather than just repeating one search.
    for turn in range(4):
        if time.monotonic()>=deadline-0.3:
            break
        # Reclassify the objective frontier after each accepted replacement.
        priority=sorted((j for j in best if columns[j]),
                        key=lambda j:(-costs[j]/max(1,len(columns[j])),j))
        width=min(len(priority),max(4,min(35,(len(priority)+11)//12)))
        if width<2:
            break
        if turn==0:
            freeing=priority[:width]
        elif turn==1:
            freeing=priority[-width:]
        else:
            offset=(turn*len(priority)//5)%len(priority)
            freeing=[priority[(offset+k)%len(priority)] for k in range(width)]
        freed=set(freeing)
        rows={r for j in freeing for r in columns[j]}
        if not rows or len(rows)>550:
            continue
        # Empty selected columns, if required by base lower bounds, remain
        # fixed and retain all original IDs. No outside row may change.
        fixed=[j for j in best if j not in freed]
        # The former 7,000-column cap discarded the ENTIRE neighborhood
        # once it filled. A high-degree row could therefore suppress all
        # objective improvements even though a tiny affordable core existed.
        # Keep a bounded, cost-ranked reversible proposal set, including
        # every freed incumbent column to guarantee the old witness remains
        # feasible inside the restricted MILP.
        from heapq import nsmallest
        candidates=set(freeing)
        for row in sorted(rows,key=lambda r:(len(incidence[r]),r)):
            if time.monotonic()>=deadline-0.65:
                break
            ranked=nsmallest(6,
                (j for j in incidence[row] if columns[j] and
                 all(k in rows for k in columns[j])),
                key=lambda j:(costs[j]/max(1,len(columns[j])),
                              costs[j],j))
            candidates.update(ranked)
            if len(candidates)>=1800:
                break
        candidates=sorted(candidates)
        if len(candidates)<len(freeing) or not candidates:
            continue
        row_list=sorted(rows)
        row_index={r:i for i,r in enumerate(row_list)}
        ii,jj=[],[]
        for k,j in enumerate(candidates):
            for r in columns[j]:
                ii.append(row_index[r]);jj.append(k)
        A=coo_matrix((np.ones(len(ii)),(ii,jj)),shape=(len(rows),len(candidates))).tocsr()
        lower=np.ones(len(rows),dtype=float)
        upper=np.ones(len(rows),dtype=float)
        if d:
            base=np.asarray([[row[j] for j in candidates] for row in d],dtype=float)
            residual=[math.fsum(row[j] for j in fixed) for row in d]
            A=vstack([A,csr_matrix(base)],format='csr')
            lower=np.concatenate([lower,np.asarray([v-z for v,z in zip(lo,residual)])])
            upper=np.concatenate([upper,np.asarray([v-z for v,z in zip(hi,residual)])])
        allowance=min(1.65,deadline-time.monotonic()-0.20)
        if allowance<0.25:
            break
        try:
            result=milp(c=np.asarray([costs[j] for j in candidates],dtype=float),
                        integrality=np.ones(len(candidates),dtype=np.int32),
                        bounds=Bounds(np.zeros(len(candidates)),np.ones(len(candidates))),
                        constraints=LinearConstraint(A,lower,upper),
                        options={'time_limit':allowance,'mip_rel_gap':0.015,'presolve':True})
        except (ValueError,RuntimeError,MemoryError):
            continue
        if result.x is None:
            continue
        candidate=fixed+[j for k,j in enumerate(candidates) if result.x[k]>.5]
        if verify(p,candidate):
            value=objective(p,candidate)
            if value<best_score-1e-8:
                best,best_score=sorted(candidate),value
    return best



def pair_graph_incumbent(p, deadline, incumbent=None):
    """Reclassify singleton/two-row crew rotations as weighted graph matching.

    The two-row-only, no-side-constraint subclass is polynomially solvable:
    first pay every row's cheapest singleton, then select vertex-disjoint
    two-row rotations with maximum positive savings. With larger rotations
    or global side bounds, this remains a *verified candidate* rather than
    a certificate, and the unrestricted integer optimizer remains available.

    NetworkX is present in the published Python 3.12 environment. The graph
    size guard caps pure-Python matching; termination occurs in its own
    bounded parent-controlled worker, so no long Blossom run threatens exit.
    """
    m, n, costs, columns, incidence, d, lo, hi = p
    if m > 12000 or n > 60000 or time.monotonic() > deadline - 0.3:
        return None
    try:
        import networkx as nx
    except ImportError:
        return None
    single = [None] * m
    pair = {}
    all_two = True
    empties = []
    for j, rows in enumerate(columns):
        if not rows:
            if costs[j] < 0 and not d:
                empties.append(j)
        elif len(rows) == 1:
            r = rows[0]
            if single[r] is None or costs[j] < costs[single[r]]:
                single[r] = j
        elif len(rows) == 2 and rows[0] != rows[1]:
            u, v = sorted(rows)
            key = (u, v)
            if key not in pair or costs[j] < costs[pair[key]]:
                pair[key] = j
        else:
            all_two = False
    # Missing singleton rotations are temporary, prohibitively expensive
    # *virtual* vertices, not fabricated columns in the output. Penalized
    # matching is an exact minimum-cost cover if every column covers at most
    # two rows and no base side constraints couple its choices. The penalty
    # exceeds the maximum total absolute real-column-cost difference.
    cost_bound = math.fsum(abs(v) for v in costs)
    virtual_cost = 2.0*cost_bound+1.0
    if (not math.isfinite(virtual_cost) or
            virtual_cost*max(1,m)>=2**50):
        return None
    baseline = [costs[j] if j is not None else virtual_cost
                for j in single]
    if not pair:
        if any(j is None for j in single):
            return None
        selected = list(single) + empties
        return selected if verify(p, selected) else None
    if len(pair) > 100000:
        return None
    graph = nx.Graph()
    for (u,v),j in pair.items():
        saving = baseline[u] + baseline[v] - costs[j]
        if saving > 1e-9:
            graph.add_edge(u, v, weight=float(saving), column=j)
    if time.monotonic() > deadline - 0.08:
        return None
    # Exact graph factorization: connected components share no eligible pair
    # rotations. Solve each independent component with Blossom, not a single
    # massive Python graph. The union is an optimal matching on the full graph.
    # The original coverage/side model still owns the final feasibility check.
    chosen = []
    used = set()
    for component_nodes in nx.connected_components(graph):
        if time.monotonic() > deadline - 0.06:
            return None
        if len(component_nodes) > 850:
            return None  # general full-size optimizers remain the fallback
        subgraph = graph.subgraph(component_nodes)
        if subgraph.number_of_edges() > 10000:
            return None
        for u,v in nx.max_weight_matching(subgraph, maxcardinality=False,
                                           weight='weight'):
            chosen.append(graph[u][v]['column'])
            used.add(u);used.add(v)
    for r in range(m):
        if r not in used:
            if single[r] is None:
                return None
            chosen.append(single[r])
    chosen.extend(empties)
    if not verify(p, chosen):
        return None
    if incumbent is not None and verify(p, incumbent) and (
            objective(p,chosen) >= objective(p,incumbent) - 1e-8):
        return None
    return chosen


def lp_priced_integer_core(p, deadline, incumbent=None, reduction=None):
    """LP-dual-priced, reversible integer search over existing rotations.

    The root LP estimates which already-enumerated crew rotations are worth
    retaining. A reduced-cost-ranked *temporary* integer core is created,
    retaining every selected column from an existing feasible incumbent, plus
    LP-positive columns and multiple legal alternatives per uncovered row.
    The incumbent and original full model remain available; restricted-core
    infeasibility never proves original infeasibility.
    """
    if time.monotonic() >= deadline - 0.9:
        return None
    try:
        import numpy as np
        from scipy.optimize import linprog, milp, Bounds, LinearConstraint
        from scipy.sparse import coo_matrix, csr_matrix, vstack
    except ImportError:
        return None
    m, n, costs, columns, incidence, d, lo, hi = p
    if reduction is None:
        reduction = reduce_forced_rotations(p, dominated_rotations(p))
    if reduction is None:
        return None
    forced, uncovered, active = reduction
    if not uncovered:
        return forced if verify(p, forced) else None
    nz = sum(len(columns[j]) for j in active)
    if (not active or nz > 600000 or len(active) > 28000 or
            len(uncovered) > 10000):
        return None
    row_pos = {r: k for k,r in enumerate(uncovered)}
    col_pos = {j: z for z,j in enumerate(active)}
    rr, cc = [], []
    for z,j in enumerate(active):
        for r in columns[j]:
            if r in row_pos:
                rr.append(row_pos[r]); cc.append(z)
    if not rr:
        return None
    Aeq = coo_matrix((np.ones(len(rr), dtype=float), (rr,cc)),
                     shape=(len(uncovered),len(active))).tocsr()
    full_cost = np.asarray([costs[j] for j in active], dtype=float)
    if not np.all(np.isfinite(full_cost)):
        return None
    q = len(d)
    side = None
    lower = upper = None
    if q:
        offsets = np.asarray([math.fsum(base[j] for j in forced)
                              for base in d],dtype=float)
        side = csr_matrix(np.asarray([[base[j] for j in active]
                                      for base in d], dtype=float))
        lower = np.asarray(lo,dtype=float)-offsets
        upper = np.asarray(hi,dtype=float)-offsets
    A_ub = vstack((side,-side), format='csr') if q else None
    b_ub = np.concatenate((upper,-lower)) if q else None
    first_budget = min(2.3, deadline-time.monotonic()-0.65)
    if first_budget < 0.25:
        return None
    try:
        relaxed=linprog(full_cost, A_eq=Aeq,
                        b_eq=np.ones(len(uncovered)), A_ub=A_ub,
                        b_ub=b_ub, bounds=(0,1), method='highs',
                        options={'time_limit':first_budget,'presolve':True})
    except (ValueError,RuntimeError,MemoryError):
        return None
    if relaxed.x is None:
        return None
    fractional = np.asarray(relaxed.x,dtype=float)
    if len(fractional) != len(active):
        return None
    # A genuinely integral LP solution is globally optimal for this reduced
    # exact objective if checked on the original model. No extra MILP needed.
    active_integral = [active[z] for z,x in enumerate(fractional) if x > 0.5]
    candidate = forced + active_integral
    if verify(p,candidate):
        if incumbent is None or not verify(p,incumbent) or (
                objective(p,candidate)<objective(p,incumbent)-1e-8):
            return candidate
        return None
    if deadline-time.monotonic()<0.75:
        return None
    # Use actual equality and inequality LP marginals: pricing is only a
    # ranking heuristic, not a certificate of safely removable columns.
    reduced_cost = np.asarray(full_cost,dtype=float)
    try:
        reduced_cost -= np.asarray(Aeq.T @ relaxed.eqlin.marginals).reshape(-1)
        if q:
            side_price = (np.asarray(relaxed.ineqlin.marginals[:q])-
                          np.asarray(relaxed.ineqlin.marginals[q:]))
            reduced_cost -= np.asarray(side.T @ side_price).reshape(-1)
    except (AttributeError,ValueError,TypeError):
        pass
    keep = set()
    if verify(p,incumbent):
        keep.update(j for j in incumbent if j in col_pos)
    keep.update(active[z] for z,x in enumerate(fractional) if x>0.04)
    by_row = [[] for _ in uncovered]
    for z,j in enumerate(active):
        for row in columns[j]:
            pos=row_pos.get(row)
            if pos is not None:
                by_row[pos].append(z)
    # One mandatory candidate and up to three cheap/marginal alternatives per
    # row. Add negative-cost empty columns, and base-diverse columns already
    # present in a verified incumbent, so the neighborhood can retain it.
    for variants in by_row:
        if not variants:
            return None
        ranked = sorted(variants,
                        key=lambda z:(-fractional[z],
                                      float(reduced_cost[z]),
                                      costs[active[z]]/max(1,len(columns[active[z]]))))
        keep.update(active[z] for z in ranked[:4])
    keep.update(j for j in active if not columns[j] and costs[j] < 0)
    if len(keep)>=len(active)*0.92 or len(keep)>9000:
        return None
    core=sorted(keep)
    subidx=np.asarray([col_pos[j] for j in core],dtype=np.int32)
    cover=Aeq[:,subidx]
    constraint=cover
    low=np.ones(len(uncovered),dtype=float)
    high=low.copy()
    if q:
        constraint=vstack([cover,side[:,subidx]],format='csr')
        low=np.concatenate((low,lower))
        high=np.concatenate((high,upper))
    remain=min(5.5,deadline-time.monotonic()-0.2)
    if remain<0.5:
        return None
    try:
        result=milp(c=full_cost[subidx],
                    integrality=np.ones(len(core),dtype=np.int32),
                    bounds=Bounds(np.zeros(len(core)),np.ones(len(core))),
                    constraints=LinearConstraint(constraint,low,high),
                    options={'time_limit':remain,'mip_rel_gap':0.03,
                             'presolve':True})
    except (ValueError,RuntimeError,MemoryError):
        return None
    if result.x is None:
        return None
    answer=forced+[j for z,j in enumerate(core) if result.x[z]>0.5]
    if verify(p,answer) and (not verify(p,incumbent) or
            objective(p,answer)<objective(p,incumbent)-1e-8):
        return answer
    return None

def _native_method_worker(sender,p,method,allowed,reduction,incumbent,lower_bound):
    """Isolated candidate producer; HiGHS may send several incumbents."""
    try:
        deadline=time.monotonic()+max(0.15,float(allowed)-0.65)
        if method=='pair_match':
            answer=pair_graph_incumbent(p,deadline,incumbent=incumbent)
        elif method=='lp_core':
            answer=lp_priced_integer_core(p,deadline,incumbent=incumbent,reduction=reduction)
        elif method in ('stream','decision'):
            answer=_highs_stream_incumbents(p,deadline,reduction,sender,
                  incumbent=incumbent,decision=(method=='decision'),
                  lower_bound=lower_bound)
        elif method=='components':
            answer,proven=exact_residual_components(p,deadline,reduction=reduction)
        elif method=='mip':
            answer,proven=sparse_milp(p,deadline,reduction=reduction,
                                      return_certificate=True)
        elif method=='mip_feasible':
            answer=sparse_milp(p,deadline,reduction=reduction,feasibility_only=True)
        elif method=='cp_feasible':
            answer=cp_sat_side_compact(p,deadline,feasibility_only=True,
                                       reduction=reduction)
            if answer is None and deadline-time.monotonic()>0.75:
                answer=cp_sat_side(p,deadline,feasibility_only=True)
        elif method=='cp_objective':
            answer=(cp_sat_side_compact(p,deadline,incumbent=incumbent,
                                       feasibility_only=False,reduction=reduction)
                    if p[5] else cp_sat(p,deadline,incumbent))
        elif method=='neighborhood':
            answer=_objective_neighborhood(p,incumbent,deadline)
        else:
            answer=None
        sender.send(('proven' if method in ('mip','components') and proven and verify(p,answer)
                     else 'end',answer if verify(p,answer) else None))
    except BaseException:
        try: sender.send(('end',None))
        except BaseException: pass
    finally:
        sender.close()


def _bounded_native(p,method,seconds,reduction=None,incumbent=None,
                    lower_bound=None,with_certificate=False):
    """Interruptible native search with streamed, parent-verified witnesses.

    The parent never depends on the worker reaching its final optimality
    proof or on its memory surviving. A deadline-aborted worker can already
    have transmitted a valid incumbent. All output still comes from parent.
    """
    seconds=float(seconds)
    if seconds<0.45:
        return (None,False) if with_certificate else None
    child=None
    try:
        import multiprocessing as mp
        ctx=mp.get_context('fork')
        recv,send=ctx.Pipe(duplex=False)
        child=ctx.Process(target=_native_method_worker,
                          args=(send,p,method,seconds,reduction,
                                incumbent,lower_bound))
        child.daemon=True
        child.start()
        send.close()
    except (OSError,ValueError,RuntimeError):
        return (None,False) if with_certificate else None
    deadline=time.monotonic()+seconds
    best=None
    best_cost=objective(p,incumbent) if verify(p,incumbent) else math.inf
    certified=None
    try:
        while time.monotonic()<deadline:
            if recv.poll(min(0.08,max(0.,deadline-time.monotonic()))):
                try:
                    msg=recv.recv()
                except (EOFError,OSError):
                    break
                if isinstance(msg,tuple) and len(msg)==2:
                    kind,answer=msg
                else:
                    kind,answer='end',msg
                if verify(p,answer):
                    new_cost=objective(p,answer)
                    if new_cost<best_cost-1e-8:
                        best,best_cost=answer,new_cost
                    if kind=='proven':
                        certified=answer
                        if best is None and abs(new_cost-best_cost)<1e-7:
                            best=answer
                if kind in ('end','proven'):
                    break
            if not child.is_alive() and not recv.poll():
                break
    finally:
        recv.close()
        if child.is_alive():
            child.terminate()
            child.join(timeout=0.3)
            if child.is_alive():
                child.kill()
        child.join(timeout=0.5)
    result=best if verify(p,best) else None
    if with_certificate:
        cert=bool(certified is not None and verify(p,certified) and
                  result is not None and
                  abs(objective(p,result)-objective(p,certified))<1e-7)
        return result,cert
    return result


def solve(instance, time_limit_s):
    start=time.monotonic()
    p=parse(instance)
    m,n,costs,columns,incidence,d,lo,hi=p
    # Startup, parsing, serialization and /work/out writes all count toward
    # the organizer's wall-clock limit. Reserve extra time when n is large.
    seconds=max(0.5,float(time_limit_s))
    reserve=min(7.0,max(1.5,seconds*0.115))
    until=start+max(0.1,seconds-reserve)
    # Exact structural shortcut: if every meaningful rotation covers at most
    # two rows and all singleton alternatives exist, matching solves the
    # entire side-constraint-free set partitioning instance, not an approximation.
    # A high-level optimization engine is unnecessary for this subclass.
    if (not d and m <= 12000 and n <= 60000 and
            all(len(rows) <= 2 for rows in columns) and
            until-time.monotonic() > 5.0):
        matched=_bounded_native(p,'pair_match',min(4.2,until-time.monotonic()-0.7))
        if verify(p,matched):
            return _crew_result(p,matched)
    backup=None
    reduced=None
    # Compute the exact safe reduction *once*, then route computational
    # methods using the residual incidence matrix rather than original size.
    # There is no speculative pruning in these effective dimensions.
    if time.monotonic()<until-0.7:
        reduced=reduce_forced_rotations(p,dominated_rotations(p))
    effective_rows = len(reduced[1]) if reduced is not None else m
    effective_cols = len(reduced[2]) if reduced is not None else n
    effective_nz = (sum(len(columns[j]) for j in reduced[2])
                    if reduced is not None else sum(map(len,columns)))
    side_work = len(d)*effective_cols
    if (reduced and not reduced[1]
            and all(costs[j]>=0 for j in reduced[2])
            and verify(p,reduced[0])):
        return _crew_result(p,reduced[0])
    # Invert solver role: when a degree-two residual cover is a union of
    # cycles and every side row is constant across the two choices per cycle,
    # compare just those two choices directly. An original-model verified
    # result is globally optimal without MILP/HiGHS imports or branching.
    if (reduced is not None and effective_rows>=80 and
            effective_cols>=80 and 0<len(d)<=400 and
            side_work>=7000 and until-time.monotonic()>0.8):
        candidate,cycle_proven=exact_cycle_cover(
            p,min(until,time.monotonic()+2.5),reduction=reduced)
        if cycle_proven and verify(p,candidate):
            return _crew_result(p,candidate)
    if m<=180 and n<=6500 and time.monotonic()<until-0.5:
        option=forced_greedy(p,min(until,time.monotonic()+0.7))
        if verify(p,option):backup=option
    if (backup is None and reduced is not None and effective_rows>0
            and effective_rows<=6000 and effective_cols<=22000
            and effective_nz<=400000 and side_work<=24000
            and time.monotonic()<until-1.1):
        option=large_sparse_cover(p,min(until,time.monotonic()+1.5),
                                  reduction=reduced)
        if verify(p,option):backup=option
    # MPC graph/reduction hook: when every side inequality is proven
    # inactive on the residual, exact-cover components may be solved with
    # native Python DP and a global optimality witness before heavy imports.
    if (reduced is not None and effective_rows>=240 and effective_cols>=400
            and until-time.monotonic()>3.0):
        fast,certified=_bounded_native(p,'components',
            min(4.0,until-time.monotonic()-0.7),
            reduction=reduced,with_certificate=True)
        if verify(p,fast):
            if backup is None or objective(p,fast)<objective(p,backup)-1e-8:
                backup=fast
            if certified and objective(p,backup)<=objective(p,fast)+1e-8:
                return _crew_result(p,backup)
    # Before any high-cost MIP/CP search, test a rigorously dual-feasible
    # row-price bound. A matching feasible incumbent certifies global optimum.
    lower_bound=_cover_dual_lower_bound(p)
    if _bound_proves_optimum(p,backup,lower_bound):
        return _crew_result(p,backup)
    def keep(option):
        nonlocal backup
        if verify(p,option) and (backup is None or
                objective(p,option)<objective(p,backup)-1e-8):
            backup=option
    # Python-level graph reclassification: when crew rotations cover only
    # one or two rows this is a maximum-savings graph matching problem, not
    # a general set-partitioning MILP. Check even larger-cover instances as a
    # candidate, without assuming matching solves the original problem.
    if (not d and m<=12000 and n<=60000
            and until-time.monotonic()>10.0
            and all(len(rows)<=2 for rows in columns)):
        keep(_bounded_native(p,'pair_match',min(2.1,until-time.monotonic()-7.0),
                             reduction=reduced,incumbent=backup))
    if _bound_proves_optimum(p,backup,lower_bound):
        return _crew_result(p,backup)
    # LP root marginals are cheap approximate information about promising
    # pre-existing rotations. Reversibly price down to an integer core,
    # retaining full-model optimization for all difficult instances.
    # A 15k-column input that collapses to 500 columns is not a large LP.
    # Reserve the LP-priced restricted master for genuinely large residuals.
    if (effective_cols>=3500 and effective_rows>=350
            and effective_nz<=600000 and side_work<=2400000
            and until-time.monotonic()>23.0):
        keep(_bounded_native(p,'lp_core',min(5.3,until-time.monotonic()-14.0),
                             reduction=reduced,incumbent=backup))
    if _bound_proves_optimum(p,backup,lower_bound):
        return _crew_result(p,backup)
    # V5 objective-first control: native sparse HiGHS receives the longest
    # uninterrupted phase, rather than being starved by repeated CP-SAT runs.
    # On very large instances, try a short compact CP-SAT feasibility probe
    # first to avoid spending the whole MIP budget without an incumbent.
    if (backup is None and (effective_rows>2500 or effective_cols>14000)
            and d and until-time.monotonic()>12.0):
        keep(_bounded_native(p,'cp_feasible',min(8.0,until-time.monotonic()-5),
                             reduction=reduced))
    # If an enormous coupled model still has no incumbent, run a short
    # *feasibility-only* exact MILP before paying for global cost minimization.
    # This distinguishes the known fifth-instance zero-risk from mere quality.
    if (backup is None and (effective_rows>2500 or effective_cols>10000)
            and until-time.monotonic()>20):
        keep(_bounded_native(p,'mip_feasible',
             min(10.,until-time.monotonic()-13.),reduction=reduced))
    # Positive inverse: before asking the integer optimizer to prove a
    # minimum, ask whether a significantly cheaper *feasible* answer exists.
    # Budget this step tightly; its oracle is the unchanged original model.
    if (backup is not None and effective_rows>1500
            and effective_cols>3500 and until-time.monotonic()>20.0):
        keep(_bounded_native(p,'decision',min(5.5,until-time.monotonic()-11.),
                             reduction=reduced,incumbent=backup,
                             lower_bound=lower_bound))
    remaining=until-time.monotonic()
    # Portfolio dispatch is based on native matrix structure, never public
    # instance labels. Preserve the high-scoring older SciPy-first method on
    # moderate matrices; use incumbent streaming on larger coupled cases.
    # Side rows enter the actual sparse matrix even after coverage reduction.
    # Effective size, not the input's historic shape, controls solver choice.
    modest_core=(effective_rows<=1800 and effective_cols<=9000
                 and side_work<=1800000 and effective_nz<=280000)
    if remaining>2.0 and modest_core:
        option,certified=_bounded_native(p,'mip',
             min(39.0,max(0.7,remaining-(10.0 if backup is None else 6.0))),
             reduction=reduced,incumbent=backup,with_certificate=True)
        keep(option)
        if certified and verify(p,backup) and (
                objective(p,backup)<=objective(p,option)+1e-7):
            return _crew_result(p,backup)
    remaining=until-time.monotonic()
    if remaining>3.0 and not _bound_proves_optimum(p,backup,lower_bound):
        # Unlike scipy.optimize.milp, native HiGHS callbacks deliver improving
        # integer witnesses *during* search. A terminated child cannot discard
        # previously streamed and independently verified solutions.
        budget=min(36.0,max(0.7,remaining-(7.0 if backup is None else 3.0)))
        keep(_bounded_native(p,'stream',budget,reduction=reduced,
                             incumbent=backup,lower_bound=lower_bound))
    remaining=until-time.monotonic()
    if remaining>2.0 and not _bound_proves_optimum(p,backup,lower_bound):
        # Always keep the known SciPy baseline available for large instances;
        # whichever solver returns the lowest verified original cost wins.
        keep(_bounded_native(p,'mip',min(remaining-0.65,22.0),
                             reduction=reduced,incumbent=backup))
    # If no exact-cover incumbent survived, prioritise feasibility over
    # objective and preserve all existing original-ID constraint checks.
    if _bound_proves_optimum(p,backup,lower_bound):
        return _crew_result(p,backup)
    remaining=until-time.monotonic()
    if backup is None and remaining>5.0:
        keep(_bounded_native(p,'mip_feasible',
                             min(3.0,remaining-4.0),reduction=reduced))
    remaining=until-time.monotonic()
    if backup is None and remaining>0.8:
        keep(_bounded_native(p,'cp_feasible',min(remaining-0.30,8.5),reduction=reduced))
    remaining=until-time.monotonic()
    if backup is not None and remaining>0.9:
        # True objective improvement on the same instance, using a localized
        # set-partitioning MILP instead of a second global native search.
        keep(_bounded_native(p,'neighborhood',min(4.5,remaining-0.35),
                             reduction=reduced,incumbent=backup))
    remaining=until-time.monotonic()
    if backup is not None and remaining>2.0 and effective_rows<1500:
        keep(_bounded_native(p,'cp_objective',min(remaining-0.3,3.0),
                             reduction=reduced,incumbent=backup))
    if not verify(p,backup):
        raise RuntimeError('No verified exact crew cover within bounded search')
    return _crew_result(p,backup)


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--problem", default="hoffman1993")
    a.add_argument("--instance", required=True)
    a.add_argument("--output", required=True)
    a.add_argument("--time-limit", type=float, default=60)
    args = a.parse_args()
    command_started=time.monotonic()
    with open(args.instance, encoding="utf-8") as f:
        raw = json.load(f)
    remaining=max(0.5,float(args.time_limit)-(time.monotonic()-command_started))
    result = solve(raw, remaining)
    from _runtime_core import write_solution
    write_solution(args.output, result)


if __name__ == "__main__":
    main()
