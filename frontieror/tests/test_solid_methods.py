"""Fast structural, metamorphic and Pareto nonregression tests for DARP router.

All instances are synthetic; not a substitute for organizer-owned feasibility.
"""
import math
import random
import time
import unittest
from unittest.mock import patch

from test_darp import darp, independent_check
from test_darp_tight import tight_fixture


class SolidMethodsTests(unittest.TestCase):
    def test_constant_time_pair_delta_exactness(self):
        for n, v, seed, width in ((8, 2, 1080, 5), (12, 3, 1120, 10),
                                  (24, 4, 1240, 30)):
            raw, planted = tight_fixture(n, v, seed, width)
            p = darp._problem(raw)
            for user in (0, n//2, n-1):
                # Remove a complete request, then compare algebraic delta to
                # full route recomputation for ALL legal insertion positions.
                pu, dr = p['pickup'][user], p['dropoff'][user]
                base = [[nd for nd in r if nd not in (pu, dr)] for r in planted]
                for delta, veh, i, j in darp._pair_moves(p, base, user):
                    trial = darp._insert_pair_route(p, base[veh], user, i, j)
                    exact = darp._route_cost(p, trial)-darp._route_cost(p, base[veh])
                    self.assertAlmostEqual(delta, exact, places=7)

    def test_reject_necessary_constraint_violations(self):
        raw, planted = tight_fixture(12, 3, 1122, 10)
        p = darp._problem(raw)
        # Every planted independently feasible route must pass the cheap gate.
        for route in planted:
            self.assertIsNotNone(darp._schedule(p, route))
            self.assertTrue(darp._fast_feasible_bounds(p, route))
        # But a premature drop-off always violates capacity.
        pickup = p['pickup'][0]
        dropoff = p['dropoff'][0]
        self.assertFalse(darp._fast_feasible_bounds(
            p, [p['start'], dropoff, pickup, p['end']]))

    def test_local_relocation_never_promotes_worse_candidate(self):
        for n, v, seed, width in ((12, 3, 1122, 10), (16, 4, 1162, 15),
                                  (24, 4, 1240, 30)):
            with self.subTest(n=n):
                raw, planted = tight_fixture(n, v, seed, width)
                p = darp._problem(raw)
                times = [darp._schedule(p, r) for r in planted]
                self.assertTrue(darp._verify(p, planted, times))
                old_cost = darp._cost(p, planted)
                candidate = darp._solid_improve(
                    p, (planted, times), time.monotonic() + 0.8)
                self.assertTrue(darp._verify(p, *candidate))
                self.assertLessEqual(darp._cost(p, candidate[0]), old_cost + 1e-7)

    def test_synthetic_twenty_case_comparison(self):
        improved = ties = rescued = 0
        for n, v, width in ((8, 2, 5), (12, 3, 10),
                            (16, 4, 15), (24, 4, 30)):
            for offset in range(5):
                seed = 1000 + 10*n + offset
                raw, _ = tight_fixture(n, v, seed, width)
                p = darp._problem(raw)
                # This test is the deterministic, dependency-free method
                # router; OR-Tools branch has a separate real-library test.
                with patch.object(darp, '_ortools', return_value=None):
                    candidate = darp.solve(raw, 9)
                independent_check(raw, candidate)
                candidate_cost = candidate['objective_value']
                prior = darp._fast_append(p, time.monotonic() + 0.5)
                if prior is None:
                    rescued += 1
                    continue
                old_cost = darp._cost(p, prior[0])
                if candidate_cost + 1e-6 < old_cost:
                    improved += 1
                elif abs(candidate_cost-old_cost) <= 1e-6:
                    ties += 1
                else:
                    # A validated multi-method solver must not regress
                    # behind a strictly feasible fast fallback.
                    self.fail(f"Regression: {n=} {seed=} {candidate_cost=} > {old_cost=}")
        print(f'SOLID_20_COMPARISON improved={improved} ties={ties} rescued={rescued}', flush=True)


if __name__ == '__main__':
    unittest.main()
