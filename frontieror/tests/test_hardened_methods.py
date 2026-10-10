"""Proof-preserving fast stops and bounded searches for FrontierOR."""
from __future__ import annotations
import os
import time
import unittest
from unittest.mock import patch
from test_multicommodity import instance as flow_fixture, verify_output as check_flow, solver as flow
from test_orienteering import fixture as op_fixture, independent_check as check_op, op
from test_vrpddp import fixture as vrp_fixture, vrp


class HardenedMethods(unittest.TestCase):
    def test_flow_zero_is_optimal_so_avoid_cp_sat(self):
        data=flow_fixture([(1, 20+i%5) for i in range(80)],(80,80))
        with patch.object(flow,"optimize",side_effect=AssertionError("Unnecessary CP-SAT on optimal zero objective")):
            t=time.monotonic()
            ans=flow.solve(data,8)
        check_flow(data,ans)
        self.assertEqual(ans["objective_value"],0)
        self.assertLess(time.monotonic()-t,5)

    def test_flow_negative_physical_cost_does_not_change_rejection_bound(self):
        data=flow_fixture([(1,10)],(2,2))
        data["network"]["arcs"][0]["cost"]=-1
        with patch.object(flow,"optimize",side_effect=AssertionError(
                "Physical arc cost is outside the published objective")):
            ans=flow.solve(data,3)
        check_flow(data,ans)
        self.assertEqual(ans["objective_value"],0)

    def test_orienteering_full_prize_ends_without_more_search(self):
        data=op_fixture(10,17)
        data["t0"]=100000
        with patch.object(op,"exact_dp",side_effect=AssertionError("DP is redundant")), \
             patch.object(op,"multistart",side_effect=AssertionError("Restart is redundant")), \
             patch.object(op,"beam_construct",side_effect=AssertionError("Beam is redundant")), \
             patch.object(op,"cp_sat_circuit",side_effect=AssertionError("CP-SAT is redundant")):
            ans=op.solve(data,8)
        check_op(data,ans)
        self.assertEqual(ans["objective_value"],sum(data["prizes"].values()))

    def test_vrp_still_improves_bounded_search(self):
        data=vrp_fixture(25,29)
        p=vrp.parse(data)
        ans=vrp.solve(data,8)
        self.assertTrue(vrp.verify(p,ans["routes"]))
        self.assertLessEqual(ans["objective_value"],vrp.score(p,vrp.separate_routes(p))+1e-7)

    def test_scipy_numerical_thread_caps_declared(self):
        from test_crew import crew
        from test_facility import solver as facility
        self.assertTrue(crew and facility)
        self.assertEqual(os.environ.get("OPENBLAS_NUM_THREADS"),"1")
        self.assertEqual(os.environ.get("MKL_NUM_THREADS"),"1")


if __name__=="__main__":
    unittest.main()
