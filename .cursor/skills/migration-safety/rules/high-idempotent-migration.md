---
title: Write Idempotent Migrations Using IF EXISTS and IF NOT EXISTS
impact: HIGH
impactDescription: Non-idempotent migrations fail on re-run — breaks CI pipelines and staging refreshes
tags: migration, idempotent, if-exists, if-not-exists, postgresql, safety
source: PostgreSQL Docs - DDL, golang-migrate best practices
---

## Write Idempotent Migrations Using IF EXISTS and IF NOT EXISTS

Migrations that fail if already applied break CI pipelines, staging environment refreshes, and manual re-runs after a failed deploy. Using `IF NOT EXISTS` / `IF EXISTS` guards makes migrations safe to run multiple times.

**Impact**: HIGH - CI failures, broken staging refreshes, risky manual recovery

### Detection

- `CREATE TABLE` without `IF NOT EXISTS`
- `ALTER TABLE ADD COLUMN` without `IF NOT EXISTS`
- `CREATE INDEX` without `IF NOT EXISTS`
- `DROP TABLE/INDEX/COLUMN` without `IF EXISTS`

### Incorrect (Anti-Pattern)

```sql
-- ❌ BAD - fails if already run once
CREATE TABLE payments (id bigserial PRIMARY KEY);
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
CREATE INDEX idx_users_phone ON users(phone);
```

### Correct (Best Practice)

```sql
-- ✅ GOOD - safe to run multiple times
CREATE TABLE IF NOT EXISTS payments (id bigserial PRIMARY KEY);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_phone ON users(phone);
DROP INDEX IF EXISTS idx_old_users_phone;
ALTER TABLE users DROP COLUMN IF EXISTS legacy_field;
```

### References

- [PostgreSQL Docs: CREATE TABLE](https://www.postgresql.org/docs/16/sql-createtable.html)
- [PostgreSQL Docs: ALTER TABLE](https://www.postgresql.org/docs/16/sql-altertable.html)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: HIGH
**Auto-fixable**: Yes (add IF NOT EXISTS / IF EXISTS guards)
