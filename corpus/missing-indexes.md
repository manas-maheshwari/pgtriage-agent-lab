---
title: Missing Indexes
url: https://www.postgresql.org/docs/current/indexes.html
---

# Missing Indexes

Large sequential scans can be appropriate for small tables or broad analytical queries.
They become suspicious when a high-volume table is repeatedly filtered by stable
predicates and the same access pattern appears in slow query evidence.

Use `pg_stat_statements` to identify repeated queries by total time, mean time,
calls, and rows. Use `EXPLAIN (ANALYZE, BUFFERS)` on a safe fixture or bounded
read-only session to confirm whether the planner is scanning too much data.

For a production system, an index recommendation should include the predicate
columns, expected selectivity, write overhead, and a validation plan. PostgreSQL
supports `CREATE INDEX CONCURRENTLY`, which avoids blocking normal writes but
takes longer and has its own operational constraints.

Recommended operator stance: advisory first, validate with representative data,
and require human approval before creating or dropping an index.
