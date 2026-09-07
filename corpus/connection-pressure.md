---
title: Connection Pressure
url: https://www.postgresql.org/docs/current/runtime-config-connection.html
---

# Connection Pressure

Connection pressure appears when active and idle sessions approach configured
limits or when application pools create more database concurrency than the
database can usefully serve. PostgreSQL exposes current activity through
`pg_stat_activity`, while configuration values such as `max_connections` define
hard limits.

The safest recommendation is usually not to increase `max_connections` first.
Investigate pool sizing, connection leaks, transaction duration, idle-in-
transaction sessions, and whether work should be queued upstream.

For an agentic system, this category is a good example of why recommendations
must remain advisory. The same metric can imply different fixes depending on
application architecture.
