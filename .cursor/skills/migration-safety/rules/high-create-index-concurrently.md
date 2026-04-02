---
title: Create Indexes with CONCURRENTLY to Avoid Table Locks
impact: HIGH
impactDescription: Regular CREATE INDEX locks the table for writes — minutes of downtime on large tables
tags: postgresql, index, concurrently, migration, table-lock, zero-downtime
source: PostgreSQL Docs - Building Indexes Concurrently
---

## Create Indexes with CONCURRENTLY to Avoid Table Locks

`CREATE INDEX` acquires a lock that blocks all writes (INSERT, UPDATE, DELETE) until the index build completes. On a table with millions of rows, this can take minutes. `CREATE INDEX CONCURRENTLY` builds the index without a write lock.

**Impact**: HIGH - Write lock on large table = minutes of downtime for all writes

### Detection

- `CREATE INDEX idx_name ON table(column)` without `CONCURRENTLY` in production migrations
- GORM struct tag `gorm:"index"` — AutoMigrate creates indexes without CONCURRENTLY

### Incorrect (Anti-Pattern)

```sql
-- ❌ BAD - locks table for writes during build (could be 5-30 minutes on large table)
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

### Correct (Best Practice)

```sql
-- ✅ GOOD - no write lock, safe in production
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- ✅ GOOD - composite index with CONCURRENTLY
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_status
ON orders(user_id, status)
WHERE deleted_at IS NULL;
```

```go
// ✅ GOOD - in GORM migration (don't use struct tags for production indexes)
db.Exec(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_id ON orders(user_id)`)
```

### Important Constraint

`CONCURRENTLY` **cannot** run inside a transaction block. Run as a standalone statement:

```sql
-- ✅ CORRECT - standalone, no BEGIN/COMMIT wrapper
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- ❌ WRONG - CONCURRENTLY inside transaction fails
BEGIN;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_id ON orders(user_id);
COMMIT;
-- ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

### References

- [PostgreSQL Docs: CREATE INDEX CONCURRENTLY](https://www.postgresql.org/docs/16/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: HIGH
**Auto-fixable**: Yes (add CONCURRENTLY keyword)
