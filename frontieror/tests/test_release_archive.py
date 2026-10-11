"""Submission ZIP round-trip: six isolated standalone folders and real CLI."""
from pathlib import Path
import json,subprocess,os,sys,tempfile,zipfile,unittest
from test_official_cli import CASES
ROOT=Path(__file__).resolve().parents[1]
ZIP=ROOT/"artifacts"/"FrontierOR-Main-Johnny5-Verified.zip"
class ReleaseArchive(unittest.TestCase):
 def test_exact_entries_and_direct_sandbox_launch(self):
  self.assertTrue(ZIP.is_file())
  self.assertLessEqual(ZIP.stat().st_size,4_000_000)
  slugs=set(CASES)
  with zipfile.ZipFile(ZIP) as z:
   names=set(z.namelist())
   self.assertEqual(names,{s+"/"+f for s in slugs for f in ("solve.py","_runtime_core.py")})
   self.assertIsNone(z.testzip())
   self.assertTrue(all((z.getinfo(n).external_attr>>16)&0o170000 != 0o120000 for n in names))
   with tempfile.TemporaryDirectory(prefix="frontieror-zip-preflight-") as temp:
    z.extractall(temp)
    for slug,(make,verify) in CASES.items():
     with self.subTest(slug=slug):
      folder=Path(temp)/slug
      instance=Path(temp)/("input_"+slug+".json")
      output=Path(temp)/("output_"+slug+".json")
      raw=make();instance.write_text(json.dumps(raw))
      env=os.environ.copy()
      env.update({"OMP_NUM_THREADS":"2","OPENBLAS_NUM_THREADS":"1",
           "MKL_NUM_THREADS":"1","PYTHONDONTWRITEBYTECODE":"1"})
      cmd=[sys.executable,"solve.py","--problem",slug,
           "--instance",str(instance),"--output",str(output),
           "--time-limit","10"]
      done=subprocess.run(cmd,cwd=folder,env=env,stdin=subprocess.DEVNULL,
                          capture_output=True,text=True,timeout=12)
      self.assertEqual(done.returncode,0,slug+":"+done.stderr[-1000:])
      self.assertTrue(output.is_file(),slug)
      self.assertLess(output.stat().st_size,16*1024*1024)
      ans=json.loads(output.read_text(),
        parse_constant=lambda v: (_ for _ in ()).throw(ValueError(v)))
      self.assertTrue(isinstance(ans.get("objective_value"),(int,float)))
      verify(raw,ans)
if __name__=="__main__":unittest.main()
