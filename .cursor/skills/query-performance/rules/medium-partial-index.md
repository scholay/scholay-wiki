---
title: Use Partial Indexes for Filtered Queries on Large Tables
impact: MEDIUM
impactDescription: Full-column indexes on low-cardinality filtered columns are larger and slower than partial indexes
tags: postgresql, partial-index, index, performance, where-clause
source: PostgreSQL Docs - Partial Indexes, Use The Index Luke
---

## Use Partial Indexes for Filtered Queries on Large Tables

When queries consistently filter on a specific subset of rows (e.g., `WHERE status = 'pending'`), a partial index covering only that subset is smaller, faster to maintain, and faster to scan than a full index.

**Impact**: MEDIUM - Index bloat, slower index scans when full index covers mostly-irrelevant rows

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - full index on status, but 95% of rows are "processed"
// Index is huge, mostly wasted on rows never queried
// CREATE INDEX idx_orders_status ON orders(status);
```

### Correct (Best Practice)

```go
// ✅ GOOD - partial index: only indexes the rows you actually query
db.Exec(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_pending
    ON orders(created_at)
    WHERE status = 'pending'
`)
// Tiny index — only pending orders, which is the actionable set
```

### When to Use Partial Indexes

- Soft delete: `WHERE deleted_at IS NULL` — query almost always filters deleted rows
- Status workflows: `WHERE status IN ('pending', 'processing')` — small actionable subset
- Feature flags: `WHERE is_premium = true` — minority of rows

### References

- [PostgreSQL Docs: Partial Indexes](https://www.postgresql.org/docs/16/indexes-partial.html)
- [Use The Index, Luke: Partial Indexes](https://use-the-index-luke.com/sql/where-clause/partial-and-filtered-indexes)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: MEDIUM
**Auto-fixable**: No (requires migration)
