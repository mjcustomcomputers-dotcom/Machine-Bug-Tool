"""Isolated equivalence and latency benchmark: frozenset vs native integer masks.
Does not claim whole-solver speedup. Run via Python 3.12 CI.
"""
import random
import time

def bench(rows=120, columns=1800, trials=120, seed=19):
    rng=random.Random(seed)
    colsets=[frozenset(rng.sample(range(rows),rng.randrange(1,9))) for _ in range(columns)]
    masks=[sum(1<<k for k in col) for col in colsets]
    remaining=[frozenset(rng.sample(range(rows),rng.randrange(25,rows+1))) for _ in range(trials)]
    rem_masks=[sum(1<<k for k in rem) for rem in remaining]
    t=time.perf_counter()
    original=[[j for j,subset in enumerate(colsets) if subset.issubset(rem)] for rem in remaining]
    original_s=time.perf_counter()-t
    t=time.perf_counter()
    optimized=[[j for j,mask in enumerate(masks) if (mask & rem)==mask] for rem in rem_masks]
    optimized_s=time.perf_counter()-t
    assert original==optimized
    reduction=100*(1-optimized_s/original_s)
    return dict(rows=rows,columns=columns,trials=trials,original_seconds=original_s,
                bitset_seconds=optimized_s,reduction_pct=reduction,equal_results=True,
                scope="isolated subset-check computation, masks precomputed")
if __name__=="__main__":
    print(bench())
