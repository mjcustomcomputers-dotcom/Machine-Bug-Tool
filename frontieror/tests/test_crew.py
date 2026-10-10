"""FrontierOR hoffman1993: independent exact-cover, exact optimum and base-window checks."""
import importlib.util
import itertools
import pathlib
import unittest

PATH = pathlib.Path(__file__).resolve().parents[1] / "solvers" / "hoffman1993" / "solve.py"
spec = importlib.util.spec_from_file_location("crew_solver", PATH)
crew = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crew)


def example(has_base):
    cols = [[0], [1], [2], [3], [0, 1], [2, 3], [0, 2], [1, 3]]
    base = {"num_bases": 1, "num_constraints": 1,
            "D_matrix": {"rows": [[1.0,1.0,1.0,1.0,2.5,1.8,0.9,0.4]]},
            "lower_bounds_d1": [3.8], "upper_bounds_d2": [4.5]}
    return {"dimensions": {"num_rows": 4, "num_cols": len(cols)},
            "cost_vector": [5,5,5,5,7,7,9,9],
            "constraint_matrix_A": {"columns": cols},
            "has_base_constraints": has_base, "base_constraints": base}


def independently_check(data, sol):
    m, n = data["dimensions"]["num_rows"], data["dimensions"]["num_cols"]
    assert set(sol) == {"objective_value", "selected_rotations", "variable_values"}
    selected = sol["selected_rotations"]
    assert len(set(selected)) == len(selected)
    cover = [0] * m
    for j in selected:
        for r in data["constraint_matrix_A"]["columns"][j]:
            cover[r] += 1
    assert cover == [1] * m
    assert set(sol["variable_values"]) == {str(i) for i in range(n)}
    assert all(sol["variable_values"][str(i)] == (1.0 if i in selected else 0.0) for i in range(n))
    assert abs(sol["objective_value"] - sum(data["cost_vector"][j] for j in selected)) < 1e-6
    if data["has_base_constraints"]:
        bc = data["base_constraints"]
        for row, low, high in zip(bc["D_matrix"]["rows"], bc["lower_bounds_d1"], bc["upper_bounds_d2"]):
            val = sum(row[j] for j in selected)
            assert low - 1e-6 <= val <= high + 1e-6


class CrewTests(unittest.TestCase):
    def test_no_base_proven_small_optimum(self):
        data = example(False)
        result = crew.solve(data, 8)
        independently_check(data, result)
        self.assertEqual(result["objective_value"], 14)

    def test_with_base_exact_feasibility(self):
        data = example(True)
        result = crew.solve(data, 8)
        independently_check(data, result)
        best = None
        for mask in itertools.product((0, 1), repeat=data["dimensions"]["num_cols"]):
            chosen = [i for i, x in enumerate(mask) if x]
            if crew.verify(crew.parse(data), chosen):
                cost = sum(data["cost_vector"][i] for i in chosen)
                best = cost if best is None else min(cost, best)
        self.assertEqual(result["objective_value"], best)

    def test_no_coverage_refused(self):
        data = example(False)
        data["constraint_matrix_A"]["columns"] = [
            [r for r in col if r != 3] for col in data["constraint_matrix_A"]["columns"]]
        with self.assertRaises(RuntimeError):
            crew.solve(data, 2)

    def test_incremental_base_sums_with_negative_contribution(self):
        # A temporary upper-bound excess can be repaired by a negative D coefficient.
        # This protects exact-cover feasibility while caching partial sums.
        import time
        data = {"dimensions": {"num_rows": 2, "num_cols": 3},
                "cost_vector": [1, 1, 10],
                "constraint_matrix_A": {"columns": [[0], [1], [0, 1]]},
                "has_base_constraints": True,
                "base_constraints": {"D_matrix": {"rows": [[5.0, -5.0, 0.0]]},
                                     "lower_bounds_d1": [-0.1],
                                     "upper_bounds_d2": [0.1]}}
        p = crew.parse(data)
        chosen = crew.forced_greedy(p, time.monotonic() + 1.0)
        self.assertTrue(crew.verify(p, chosen))
        self.assertEqual(crew.objective(p, chosen), 2.0)

    def test_incremental_totals_preserve_independent_exact_cover(self):
        import time
        data = example(True)
        p = crew.parse(data)
        selected = crew.forced_greedy(p, time.monotonic() + 1.0)
        self.assertTrue(crew.verify(p, selected))
        self.assertEqual(crew.objective(p, selected), 14)

    def test_side_constrained_cp_rescue_uses_actual_solver(self):
        import time
        from unittest.mock import patch
        # Force greedy and MILP unavailable to exercise the wired side CP-SAT.
        data=example(True)
        with patch.object(crew,"forced_greedy",return_value=None), patch.object(crew,"sparse_milp",return_value=None):
            result=crew.solve(data,8)
        independently_check(data,result)
        self.assertEqual(result["objective_value"],14)

    def test_side_cp_infeasible_model_not_promoted(self):
        import time
        data=example(True)
        data["base_constraints"]["lower_bounds_d1"]=[999.0]
        p=crew.parse(data)
        self.assertIsNone(crew.cp_sat_side(p,time.monotonic()+3,feasibility_only=True))

    def test_objective_mirror_from_verified_incumbent(self):
        import time
        data=example(True)
        p=crew.parse(data)
        incumbent=[0,1,2,3]
        self.assertTrue(crew.verify(p,incumbent))
        result=crew.cp_sat_side(p,time.monotonic()+3,incumbent=incumbent,feasibility_only=False)
        self.assertTrue(crew.verify(p,result))
        self.assertLess(crew.objective(p,result),crew.objective(p,incumbent))

    def test_objective_mirror_rejects_mixed_fractional_coefficients(self):
        import time
        data=example(True)
        data["cost_vector"][0]=5.25
        p=crew.parse(data)
        self.assertIsNone(crew.cp_sat_side(p,time.monotonic()+2,
                                           feasibility_only=False))

    def test_literal_sparse_milp(self):
        data = example(True)
        p = crew.parse(data)
        import time
        option = crew.sparse_milp(p, time.monotonic() + 4)
        self.assertTrue(crew.verify(p, option))
        self.assertEqual(crew.objective(p, option), 14)


if __name__ == "__main__":
    unittest.main()
