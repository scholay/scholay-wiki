---
name: gorm-sql-query-performance
description: GORM query performance review. Use when optimizing slow queries, designing indexes, analyzing N+1 patterns, or configuring connection pools. Trigger on "slow", "optimize", "index", "EXPLAIN", "N+1", or performance degradation. Note: this project uses MySQL, not PostgreSQL.
license: MIT
metadata:
  author: saifoelloh
  version: "1.0.0"
  parent_skill: gorm-sql-best-practices
  sources:
    - "Use The Index, Luke (use-the-index-luke.com)"
    - "PostgreSQL 16 Official Documentation"
    - "GORM Official Documentation (gorm.io/docs)"
  last_updated: "2026-03-13"
---

# Query Performance

Expert-level performance review for GORM queries. Detects N+1 patterns, missing indexes, connection pool misconfigurations, and memory-inefficient data fetching. Adapted for MySQL (originally PostgreSQL — use MySQL EXPLAIN syntax and index strategies).

## When to Apply

Use this skill when:
- An endpoint is slow or degrading under load
- Reviewing repository code for N+1 query patterns
- Designing indexes for new tables or query patterns
- Investigating connection pool exhaustion
- Processing large datasets in background jobs

## Rule Categories

| Priority | Count | Focus |
|---|---|---|
| Critical | 2 | N+1 queries, unindexed foreign keys |
| High | 3 | EXPLAIN ANALYZE, connection pool, batch processing |
| Medium | 2 | COUNT vs len(), partial indexes |

## Rules Covered (7 total)

### Critical Issues (2)
- `critical-n-plus-one` — Detect and eliminate N+1 query patterns using Preload
- `critical-unindexed-fk` — Index foreign keys and all WHERE clause columns

### High-Impact Patterns (3)
- `high-explain-analyze` — Use EXPLAIN (ANALYZE, BUFFERS) before declaring a query optimized
- `high-connection-pool` — Configure connection pool parameters explicitly for production
- `high-find-in-batches` — Use FindInBatches for large dataset processing

### Medium Improvements (2)
- `medium-count-query` — Use db.Count instead of len() on full fetch
- `medium-partial-index` — Use partial indexes for filtered queries on large tables

## Trigger Phrases

- "Why is this query slow?"
- "Optimize this query"
- "Check for N+1"
- "Add an index"
- "EXPLAIN output"
- "Performance issue"
- "Connection pool"
- "Process large dataset"

## Related Skills

- [gorm-query-patterns](../gorm-query-patterns/SKILL.md) — For ORM patterns that cause N+1
- [postgresql-syntax](../postgresql-syntax/SKILL.md) — For ILIKE and index-aware SQL syntax
- [migration-safety](../migration-safety/SKILL.md) — For `CREATE INDEX CONCURRENTLY` in migrations
