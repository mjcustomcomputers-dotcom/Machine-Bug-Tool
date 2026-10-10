"""Reproducible microbenchmark for crew base-bound candidate evaluation.

This isolates candidate screening. It does NOT benchmark total solver wall time.
Run: python frontieror/tests/bench_crew_base_cache.py
"""
import random
import time


def benchmark(branches=12000, depth=24, constraints=8, cols=250, seed=13):
    rng = random.Random(seed)
    d = [[rng.random() * 2 for _ in range(cols)] for _ in range(constraints)]
    paths = [[rng.randrange(cols) for _ in range(depth)] for _ in range(branches)]
    nxt = [rng.randrange(cols) for _ in range(branches)]
    cached = [tuple(sum(d[i][k] for k in p) for i in range(constraints)) for p in paths]

    start = time.perf_counter()
    original = [any(sum(d[i][k] for k in p) + d[i][j] > 100
                    for i in range(constraints)) for p, j in zip(paths, nxt)]
    old_s = time.perf_counter() - start

    start = time.perf_counter()
    revised = [any(totals[i] + d[i][j] > 100
                   for i in range(constraints)) for totals, j in zip(cached, nxt)]
    new_s = time.perf_counter() - start
    assert original == revised
    return {'branches':branches, 'depth':depth, 'base_constraints':constraints,
            'old_candidate_seconds':old_s, 'new_candidate_seconds':new_s,
            'candidate_screen_reduction_pct':100*(1-new_s/old_s),
            'equal_decisions':True,
            'scope':'candidate bound screen, cached parent totals provided as normal search state'}


if __name__ == '__main__':
    print(benchmark())
