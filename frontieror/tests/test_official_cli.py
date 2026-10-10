"""Official FrontierOR Main sandbox *interface* audit using independent fixtures.

This does not claim private-checker equivalence. It executes all six actual
subprocess entrypoints with the published CLI argument names, reads each output
file, checks JSON shape, and runs a different independent numerical verifier.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from test_crew import example as crew_fixture, independently_check as crew_check
from test_darp import fixture as darp_fixture, independent_check as darp_check
from test_facility import fixture as facility_fixture, independent as facility_check
from test_multicommodity import instance as flow_fixture, verify_output as flow_check
from test_orienteering import fixture as op_fixture, independent_check as op_check
from test_vrpddp import fixture as vrp_fixture, independent as vrp_check

BASE=Path(__file__).resolve().parents[1]/"solvers"

CASES={
    "barnhart2000":(lambda:flow_fixture([(4,20),(5,15),(3,25)],(5,10)),flow_check),
    "bodur2017":(lambda:facility_fixture(3,2,2,3),facility_check),
    "cordeau2006":(lambda:darp_fixture(5,2,19),darp_check),
    "fischetti1998":(lambda:op_fixture(9,4),op_check),
    "hoffman1993":(lambda:crew_fixture(True),crew_check),
    "nagy2015":(lambda:vrp_fixture(5,12),vrp_check)
}


class OrganizerCommandContractTests(unittest.TestCase):
    def test_six_real_cli_entrypoints(self):
        self.assertEqual(len(CASES),6)
        for slug,(make_instance,verify) in CASES.items():
            with self.subTest(problem=slug):
                source=BASE/slug/"solve.py"
                self.assertTrue(source.is_file(),source)
                with tempfile.TemporaryDirectory(prefix="frontieror-main-cli-") as root:
                    workspace=Path(root)
                    inp=workspace/"instance.json"
                    out=workspace/"solution.json"
                    data=make_instance()
                    inp.write_text(json.dumps(data),encoding="utf-8")
                    # Invoke exactly the same flags as the organizer's published
                    # Main-track sandbox; only the local absolute paths differ.
                    command=[sys.executable,str(source),
                             "--problem",slug,
                             "--instance",str(inp),
                             "--output",str(out),
                             "--time-limit","10"]
                    environment=os.environ.copy()
                    environment.update({
                        "PYTHONDONTWRITEBYTECODE":"1",
                        "OMP_NUM_THREADS":"2",
                        "SANDBOX_PROBLEM":slug,
                        "SANDBOX_TIMEOUT_S":"10",
                    })
                    completed=subprocess.run(
                        command,cwd=workspace,env=environment,
                        stdin=subprocess.DEVNULL,capture_output=True,text=True,
                        timeout=12,check=False)
                    self.assertEqual(completed.returncode,0,
                                     f"{slug}: {completed.stderr[-1200:]}")
                    self.assertTrue(out.is_file(),f"{slug}: no output JSON")
                    self.assertLess(out.stat().st_size,16*1024*1024,
                                    f"{slug}: output exceeds organizer limit")
                    answer=json.loads(out.read_text(encoding="utf-8"),
                                      parse_constant=lambda x:(_ for _ in ()).throw(
                                          ValueError("non-finite JSON token")))
                    self.assertIsInstance(answer,dict)
                    self.assertIn("objective_value",answer)
                    self.assertIsInstance(answer["objective_value"],(float,int))
                    # Independent of the solver's self-declared validation.
                    verify(data,answer)


if __name__=="__main__":
    unittest.main()
