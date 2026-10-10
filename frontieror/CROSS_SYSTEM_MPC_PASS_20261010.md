# FrontierOR MPC virtual cache / isolated runtime (2026-10-10)

Base Crew V6 commit: ba8c2ce5174e83b57b43223a27128db94902dc45.
Only this competition development branch changes; all original MPC source and registries are preserved.

- Reuses MPC V20 virtual cache as instance-scoped bounded LRU for exact Orienteering tour costs. No stale cross-instance state, network, or persistent cache.
- Reuses MPC atomic/contract methodology as one canonical micro-runtime copied byte-identically into all six physically isolated solver folders. Guarded finite JSON, 16MB max, atomic write in /work/out, monotonic time helper. Source builder rejects stale clones.
- Reuses V7 residual capacity routing/ejection as a **reversible** Flow candidate expansion. V6 route pool and baseline remain intact; only independently validated strictly lower-cost solutions replace current incumbents.
- Retains V6 Crew forced-column reduction / original-rotation reconstruction and signed base constraints. No solver imports MPC Node runtime or another problem folder.
- Zip has exactly 12 files (6 solve.py + 6 _runtime_core.py) under six root slugs; no secrets or bundled shared top-level directory.
- One consolidated Python 3.12 CI stage + independent checks + synthetic objectives + 2-vCPU/4GB/no-network Docker verification gates before publishing a direct ZIP on GitHub.
- Official public/private checker results, hidden objective and 1.8 score are NOT established by CI. No submission occurs.

Official rule: https://frontieror-challenge.com/docs/main/submission-format
MPC design sources:
feature/mpc-osi-methods-on-methods-20261009 docs/MPC-VIRTUAL-OSI-META-V20.md;
feature/solid-state-optimization-micro-router-20261010 lib/optimization-micro-router.mjs;
feature/mpc-network-meta-methods-v24 docs/MPC-NETWORK-METHOD-SCIENCE-V24.md.
