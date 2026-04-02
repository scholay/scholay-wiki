---
title: Every Migration Must Have a Corresponding Rollback (down.sql)
impact: CRITICAL
impactDescription: Migration without rollback makes incident recovery manual and error-prone
tags: migration, rollback, down-sql, golang-migrate, goose, incident
source: Database Reliability Engineering - O'Reilly
---

## Every Migration Must Have a Corresponding Rollback (down.sql)

When a bad migration hits production, the first response is to roll back. Without a `down.sql`, rollback requires manually writing and testing SQL under pressure during an incident. Always write the rollback at the same time as the migration.

**Impact**: CRITICAL - Incident recovery time multiplied; manual SQL under pressure = more errors

### Detection

- Migration files without a paired `*.down.sql`
- golang-migrate usage with only `up.sql` files

### Incorrect (Anti-Pattern)

```
migrations/
  000003_add_phone_to_users.up.sql    ✅
  # No down.sql — can't roll back!
```

### Correct (Best Practice)

```
migrations/
  000003_add_phone_to_users.up.sql
  000003_add_phone_to_users.down.sql
```

```sql
-- 000003_add_phone_to_users.up.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_phone ON users(phone);

-- 000003_add_phone_to_users.down.sql
DROP INDEX IF EXISTS idx_users_phone;
ALTER TABLE users DROP COLUMN IF EXISTS phone;
```

### Rollback Checklist for Each Migration

- [ ] `down.sql` exactly reverses `up.sql`
- [ ] `down.sql` is idempotent (`DROP IF EXISTS`, `ALTER ... IF EXISTS`)
- [ ] `down.sql` tested in staging before `up.sql` is deployed to production

### References

- [golang-migrate: Migration Files](https://github.com/golang-migrate/migrate/blob/master/MIGRATIONS.md)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: CRITICAL
**Auto-fixable**: No
