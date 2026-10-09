# MPC Research Workbench v2

Offline Windows bundle built from source commit
`ad364e6ba531382343b8edeb22e3843eaa7d70a9`.

1. Download and verify `MPC-Research-Workbench-v2-ad364e6.zip` against
   `SHA256SUMS.txt`.
2. Extract the ZIP.
3. Double-click `OPEN-MPC-RESEARCH-WORKBENCH.cmd` for zero-install offline
   mode. This launcher opens HTML directly and is not subject to PowerShell
   execution policy.
4. With Node.js 22.13+ installed, optionally run
   `START-MPC-RESEARCH-WORKBENCH-WITH-SQL.cmd` for the loopback-only local
   SQLite workspace.

The bundle contains no credentials. Its connection board keeps current,
historical, unavailable, and provider-setup-required states separate. Output
requests are not sent without a separately approved provider adapter.

Static audit fingerprint:
`532b73304cedfab4c118b015684cbfe1770d9390219e7eb3b75be88ce568511b`.
