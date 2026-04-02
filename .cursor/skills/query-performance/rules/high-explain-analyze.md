---
title: Use EXPLAIN ANALYZE Before Declaring a Query Optimized
impact: HIGH
impactDescription: Assumed-fast queries may do Seq Scan — always verify with query plan
tags: postgresql, explain, analyze, query-plan, seq-scan, performance
source: PostgreSQL Docs - EXPLAIN
---

## Use EXPLAIN ANALYZE Before Declaring a Query Optimized

A query that *looks* optimal may still perform a sequential scan due to missing indexes, type mismatches, or poor statistics. Always run `EXPLAIN (ANALYZE, BUFFERS)` before marking a query as optimized.

**Impact**: HIGH - Undetected performance issues in production

### Key Output to Watch

| Output | Meaning | Action |
|---|---|---|
| `Seq Scan` on large table | No index used | Add index |
| `Nested Loop` with high row estimates | Cartesian explosion possible | Check JOIN conditions |
| `actual rows >> estimated rows` | Stale statistics | `ANALYZE table_name` |
| `Buffers: shared read=X hit=0` | Cold cache / no index | Check index existence |

### Usage Pattern

```go
// Run this in development/staging to analyze slow queries
var plan []map[string]interface{}
r.db.Raw(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT * FROM orders WHERE user_id = ? AND status = ?
`, userID, "pending").Scan(&plan)

// Or run in psql:
// EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```

### References

- [PostgreSQL Docs: EXPLAIN](https://www.postgresql.org/docs/16/sql-explain.html)
- [Postgres EXPLAIN Visualizer](https://explain.dalibo.com)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: HIGH
**Auto-fixable**: No (diagnostic tool, not a code fix)
