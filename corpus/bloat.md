---
title: Dead Tuple Bloat
url: https://www.postgresql.org/docs/current/routine-vacuuming.html
---

# Dead Tuple Bloat

PostgreSQL uses MVCC, so updates and deletes can leave dead tuples behind until
vacuum can reclaim them. `pg_stat_user_tables` includes `n_dead_tup`,
`last_vacuum`, `last_autovacuum`, and related counters that help identify tables
where cleanup may be lagging.

Bloat recommendations should avoid jumping straight to disruptive operations.
The first step is usually to review autovacuum behavior, table churn, long-lived
transactions, and whether the observed dead tuples are persistent or transient.

`VACUUM FULL` can reclaim more space but rewrites the table and requires stronger
locking. Treat it as an operator decision, not an automated remediation.
