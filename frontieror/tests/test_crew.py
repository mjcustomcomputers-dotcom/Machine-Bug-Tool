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

    def test_literal_sparse_milp(self):
        data = example(True)
        p = crew.parse(data)
        import time
        option = crew.sparse_milp(p, time.monotonic() + 4)
        self.assertTrue(crew.verify(p, option))
        self.assertEqual(crew.objective(p, option), 14)


if __name__ == "__main__":
    unittest.main()
