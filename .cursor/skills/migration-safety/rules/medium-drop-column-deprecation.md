---
title: Deprecate Before Dropping — Never Drop Columns in the Same Deploy as Code Changes
impact: MEDIUM
impactDescription: Dropping a column while old pods still reference it causes immediate 500 errors
tags: migration, drop-column, zero-downtime, rolling-deploy, deprecation
source: Braintree Safe Operations for High-Volume PostgreSQL
---

## Deprecate Before Dropping — Never Drop Columns in the Same Deploy as Code Changes

In a rolling deploy, old pods and new pods run simultaneously. If you drop a column in the same deploy that removes the Go code referencing it, old pods will immediately start returning errors on every query that selects that column.

**Impact**: MEDIUM - 500 errors on old pods during rolling deploy; requires emergency rollback

### Safe DROP COLUMN Process (3 Phases)

```
Phase 1 (Deploy N):   Remove code references to the column (stop reading/writing it)
                       Verify in staging that no queries reference the column

Phase 2 (Wait):        Let Deploy N fully roll out; confirm old pods are gone
                       Check pg_stat_activity for any remaining column references

Phase 3 (Deploy N+1):  Run DROP COLUMN migration safely
```

```sql
-- Phase 3 migration (only after Phase 1+2 complete)
-- ✅ GOOD - idempotent drop, only after code references removed
ALTER TABLE users DROP COLUMN IF EXISTS legacy_avatar_url;
```

### References

- [Braintree: Safe Operations for High-Volume PostgreSQL](https://www.braintreepayments.com/blog/safe-operations-for-high-volume-postgresql)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: MEDIUM
**Auto-fixable**: No (process change)
