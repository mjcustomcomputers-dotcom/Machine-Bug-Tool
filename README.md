# MPC Method Self Scan — Desktop-ready offline artifact

This orphan artifact branch contains the Windows Desktop-ready offline package
built from Machine-Bug-Tool source commit
`8a4f79dc71d0268b07652faca2cc89dfe3401248`.

- Archive: `MPC-Method-Self-Scan-Desktop-Ready.zip`
- SHA-256: `c3072b9b1189f0d341b5756a10832e2cc7db9ed0221a6f50eb8d29e67278f24c`
- Archive size: 2,860,587 bytes
- Scan SHA-256: `532b73304cedfab4c118b015684cbfe1770d9390219e7eb3b75be88ce568511b`
- Database SHA-256: `eb5c4ddceb37aa3f30953278179c98263f72cfd003b0103f2af61863d76a968d`

Download the ZIP to the Windows Desktop, extract it, open the
`MPC-METHOD-LAB-GUI` folder, and double-click `OPEN-MPC-METHOD-LAB.cmd`.
The dark targeted-query GUI opens in the default browser without invoking
PowerShell, running a server, or using the network. It supports method search,
filters, exact two-method comparison, and JSON copy/export over the complete
239-method and 28,680-row static scan. The prebuilt reports and SQLite database
also work offline. Refreshing the static scan requires Node 22.13+, 23.4+, or
24+.

The package contains static analysis only. It performs no deployment, target
action, source authentication, method execution, or canonical promotion.
