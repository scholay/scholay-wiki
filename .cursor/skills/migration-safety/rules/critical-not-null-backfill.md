---
title: Adding NOT NULL Column Requires DEFAULT or Backfill First
impact: CRITICAL
impactDescription: ALTER TABLE ADD COLUMN NOT NULL fails instantly on non-empty tables
tags: postgresql, migration, not-null, alter-table, backfill, zero-downtime
source: PostgreSQL Docs - ALTER TABLE, Braintree Safe Operations
---

## Adding NOT NULL Column Requires DEFAULT or Backfill First

`ALTER TABLE users ADD COLUMN phone VARCHAR(20) NOT NULL` fails immediately if the table has existing rows — PostgreSQL cannot set existing rows to NOT NULL with no value. The safe approach is a 3-step migration.

**Impact**: CRITICAL - Migration fails in production, requires rollback under pressure

### Detection

- `ALTER TABLE ... ADD COLUMN ... NOT NULL` without a `DEFAULT` clause in migration files
- GORM struct tag `gorm:"not null"` on a new column without a corresponding migration strategy

### Incorrect (Anti-Pattern)

```sql
-- ❌ BAD - fails if table has any existing rows
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NOT NULL;
-- ERROR: column "phone" of relation "users" contains null values
```

### Correct (Best Practice) — 3-Step Zero-Downtime

```sql
-- Step 1 (Migration A): Add as nullable — safe, instant
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Step 2 (Script or Migration B): Backfill existing rows
UPDATE users SET phone = '' WHERE phone IS NULL;

-- Step 3 (Migration C, after backfill confirmed): Add NOT NULL constraint
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
```

```go
// ✅ GOOD in GORM migration sequence
// Migration 1: Add nullable
db.Exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)")

// Migration 2: Backfill (run separately or as batch)
db.Exec("UPDATE users SET phone = '' WHERE phone IS NULL")

// Migration 3: Add constraint
db.Exec("ALTER TABLE users ALTER COLUMN phone SET NOT NULL")
```

### References

- [PostgreSQL Docs: ALTER TABLE](https://www.postgresql.org/docs/16/sql-altertable.html)
- [Braintree: Safe Operations for High-Volume PostgreSQL](https://www.braintreepayments.com/blog/safe-operations-for-high-volume-postgresql)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: CRITICAL
**Auto-fixable**: No
