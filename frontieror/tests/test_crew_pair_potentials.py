"""Adversarial graph-potential conservation for pair-only exact-cover models."""
import itertools, importlib.util, random, time, unittest
from pathlib import Path
SRC=Path(__file__).resolve().parents[1]/"solvers"/"hoffman1993"/"solve.py"
spec=importlib.util.spec_from_file_location("pair_potential",SRC)
crew=importlib.util.module_from_spec(spec);spec.loader.exec_module(crew)

def model(seed=0, odd=False, perturb=False, invert=False, empty=False):
    rng=random.Random(seed)
    m=4
    edges=([[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]]
           if odd else [[0,1],[2,3],[0,3],[1,2]])
    potential=[rng.randint(-5,5) for _ in range(m)]
    if invert:potential=[-x for x in potential]
    side=[float(sum(potential[r] for r in e)) for e in edges]
    if perturb:side[-1]+=1.0
    cols=edges+([[]] if empty else [])
    if empty:side.append(0.)
    cost=[rng.randint(-2,9) for _ in edges]+([-3] if empty else [])
    total=float(sum(potential))
    return {"dimensions":{"num_rows":4,"num_cols":len(cols)},
        "cost_vector":cost,"constraint_matrix_A":{"columns":cols},
        "has_base_constraints":True,"base_constraints":{
          "D_matrix":{"rows":[side]},
          "lower_bounds_d1":[total],"upper_bounds_d2":[total]}}
def brute(p):
    sols=[]
    for bits in itertools.product((0,1),repeat=p[1]):
        ans=[i for i,v in enumerate(bits) if v]
        if crew.verify(p,ans):sols.append(crew.objective(p,ans))
    return min(sols) if sols else None

class PairPotentials(unittest.TestCase):
    def test_bipartite_pairs_without_singletons(self):
        p=crew.parse(model(11))
        self.assertFalse(any(len(r)==1 for r in p[3]))
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.pair_conserved_side_rows(p,red),[0])
        # Small-q routing leaves mathematically removable constraints with
        # MILP when the proof would cost more than it saves.
        self.assertEqual(crew.conserved_side_rows(p,red),[])
        ans=crew.sparse_milp(p,time.monotonic()+4,reduction=red)
        self.assertTrue(crew.verify(p,ans))
        self.assertEqual(crew.objective(p,ans),brute(p))

    def test_odd_cycle_fixes_potential_gauge(self):
        p=crew.parse(model(12,odd=True,empty=True))
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.pair_conserved_side_rows(p,red),[0])
        ans=crew.sparse_milp(p,time.monotonic()+4,reduction=red)
        self.assertTrue(crew.verify(p,ans))
        self.assertEqual(crew.objective(p,ans),brute(p))

    def test_one_corrupted_edge_refuses_certificate(self):
        for odd in (False,True):
            p=crew.parse(model(9,odd=odd,perturb=True))
            red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
            self.assertEqual(crew.pair_conserved_side_rows(p,red),[])
            ans=crew.sparse_milp(p,time.monotonic()+4,reduction=red)
            ref=brute(p)
            if ref is None:self.assertIsNone(ans)
            else:
                self.assertTrue(crew.verify(p,ans))
                self.assertEqual(crew.objective(p,ans),ref)

    def test_bipartite_imbalanced_graph_cannot_fake_certificate(self):
        p=crew.parse({"dimensions":{"num_rows":4,"num_cols":3},
          "cost_vector":[1,2,3],
          "constraint_matrix_A":{"columns":[[0,1],[0,2],[0,3]]},
          "has_base_constraints":True,
          "base_constraints":{"D_matrix":{"rows":[[5.,6.,7.]]},
              "lower_bounds_d1":[10.],"upper_bounds_d2":[10.]}})
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        if red is not None:
            self.assertEqual(crew.pair_conserved_side_rows(p,red),[])

    def test_near_integer_edge_never_certifies(self):
        data=model(7,odd=True)
        data["base_constraints"]["D_matrix"]["rows"][0][0]+=1e-8
        p=crew.parse(data)
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.pair_conserved_side_rows(p,red),[])

    def test_conserved_total_outside_bounds_stays_required(self):
        data=model(21,odd=False)
        bc=data["base_constraints"]
        bc["lower_bounds_d1"][0]+=1.
        bc["upper_bounds_d2"][0]+=1.
        p=crew.parse(data)
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.pair_conserved_side_rows(p,red),[])
        self.assertIsNone(crew.sparse_milp(
            p,time.monotonic()+3,reduction=red))

    def test_too_large_integer_preserves_original_side_constraint(self):
        data=model(15)
        data["base_constraints"]["D_matrix"]["rows"][0][0]=float(2**40)
        p=crew.parse(data)
        red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
        self.assertEqual(crew.pair_conserved_side_rows(p,red),[])

    def test_200_random_permutations_sign_inversions_negative_costs(self):
        for seed in range(200):
            with self.subTest(seed=seed):
                data=model(seed,odd=bool(seed%2),invert=bool(seed%3),
                           empty=bool(seed%5==0),perturb=bool(seed%7==0))
                rng=random.Random(seed*43+11)
                order=list(range(data["dimensions"]["num_cols"]))
                rng.shuffle(order)
                data["cost_vector"]=[data["cost_vector"][j] for j in order]
                data["constraint_matrix_A"]["columns"]=[
                  data["constraint_matrix_A"]["columns"][j] for j in order]
                data["base_constraints"]["D_matrix"]["rows"][0]=[
                  data["base_constraints"]["D_matrix"]["rows"][0][j] for j in order]
                p=crew.parse(data)
                red=crew.reduce_forced_rotations(p,crew.dominated_rotations(p))
                if red is None:continue
                certified=crew.pair_conserved_side_rows(p,red)
                if certified:
                    # Exhaustively enumerate ALL exact covers, independent of
                    # objective and verify equality on the original side row.
                    totals=set()
                    for bits in itertools.product((0,1),repeat=p[1]):
                        choice=[j for j,v in enumerate(bits) if v]
                        counts=[0]*p[0]
                        for j in choice:
                            for r in p[3][j]:counts[r]+=1
                        if counts!=[1]*p[0]:continue
                        totals.add(sum(p[5][0][j] for j in choice))
                    self.assertEqual(totals,{p[6][0]})
                ans=crew.sparse_milp(p,time.monotonic()+3,reduction=red)
                ref=brute(p)
                if ref is None:self.assertIsNone(ans)
                else:
                    self.assertTrue(crew.verify(p,ans))
                    self.assertAlmostEqual(crew.objective(p,ans),ref)

if __name__=="__main__":unittest.main()
