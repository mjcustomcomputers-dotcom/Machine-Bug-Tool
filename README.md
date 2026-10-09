# MPC Method Self Scan — Desktop-ready offline artifact

This orphan artifact branch contains the Windows Desktop-ready offline package
built from Machine-Bug-Tool source commit
`e3a8f15806388d9c0d3705970ec7fd18c44d3439`.

- Archive: `MPC-Method-Self-Scan-Desktop-Ready.zip`
- SHA-256: `7312cc9851095f184a02ef307e7935eb591254645fa58316217aa729bcba0207`
- Archive size: 2,631,473 bytes
- Scan SHA-256: `532b73304cedfab4c118b015684cbfe1770d9390219e7eb3b75be88ce568511b`
- Database SHA-256: `eb5c4ddceb37aa3f30953278179c98263f72cfd003b0103f2af61863d76a968d`

Download the ZIP to the Windows Desktop, extract it, and double-click
`MPC-Method-Self-Scan.cmd`. The prebuilt reports and SQLite database work
offline. Refreshing the static scan requires Node 22.13+, 23.4+, or 24+.

The package contains static analysis only. It performs no deployment, target
action, source authentication, method execution, or canonical promotion.
