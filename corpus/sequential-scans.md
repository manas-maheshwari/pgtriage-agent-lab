---
title: Sequential Scans
url: https://www.postgresql.org/docs/current/monitoring-stats.html
---

# Sequential Scans

`pg_stat_user_tables` exposes table-level counters such as sequential scans,
index scans, live tuple estimates, and dead tuple estimates. A high sequential
scan count on a large table is not automatically a bug, but it is a strong signal
when paired with slow query evidence and narrow filtering predicates.

The useful investigation pattern is to connect table statistics to query-level
evidence, then inspect the execution plan. Look for filters that remove many
rows, join conditions without supporting indexes, and type casts that prevent
index use.

A good recommendation should explain why the scan is expensive, what evidence
supports that conclusion, and how to measure improvement after a change.
