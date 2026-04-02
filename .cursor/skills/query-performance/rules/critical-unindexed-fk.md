---
title: Index Foreign Keys and All WHERE Clause Columns
impact: CRITICAL
impactDescription: Unindexed foreign keys cause full table scans on every JOIN — O(n) per query
tags: postgresql, index, foreign-key, where-clause, performance, full-scan
source: Use The Index Luke - Index for WHERE Clauses
---

## Index Foreign Keys and All WHERE Clause Columns

PostgreSQL does not automatically create indexes on foreign key columns (unlike MySQL). Every JOIN and WHERE on an unindexed column performs a full sequential scan, which is O(n) and grows with table size.

**Impact**: CRITICAL - Full table scans on JOINs, query time grows linearly with data volume

### Detection

- Foreign key columns (`user_id`, `order_id`, `tenant_id`) without an explicit index in migration
- Columns used in `.Where()`, `.Joins()`, or `.Order()` without a corresponding index
- `EXPLAIN ANALYZE` output showing `Seq Scan` on large tables

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - orders.user_id has no index, every JOIN is a full scan
type Order struct {
    ID     uint
    UserID uint    // No index tag — full scan on every user's orders lookup
    Status string
}

// In migration:
// CREATE TABLE orders (id bigserial, user_id bigint, status varchar);
// Missing: CREATE INDEX idx_orders_user_id ON orders(user_id);
```

### Correct (Best Practice)

```go
// ✅ GOOD - index FK and common filter column
type Order struct {
    ID     uint
    UserID uint   `gorm:"index:idx_orders_user_status"`   // Composite index
    Status string `gorm:"index:idx_orders_user_status"`
}

// ✅ GOOD - explicit migration (preferred for production control)
db.Exec(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_id ON orders(user_id)`)
db.Exec(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_status ON orders(user_id, status)`)

// Verify with EXPLAIN:
db.Raw("EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = ?", userID).Scan(&result)
// Look for: "Index Scan" instead of "Seq Scan"
```

### Index Design Quick Rules

1. **Always** index foreign keys (`user_id`, `order_id`, `tenant_id`)
2. **Always** index columns in `WHERE`, `JOIN ON`, `ORDER BY`
3. For `WHERE col1 = ? AND col2 = ?` → composite index `(col1, col2)` (most selective first)
4. Use `CONCURRENTLY` in production migrations to avoid table locks

### References

- [Use The Index, Luke: Index for WHERE](https://use-the-index-luke.com/sql/where-clause)
- [PostgreSQL Docs: Indexes](https://www.postgresql.org/docs/16/indexes.html)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: CRITICAL
**Auto-fixable**: No (requires migration)
