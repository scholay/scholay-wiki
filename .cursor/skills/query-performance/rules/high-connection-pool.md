---
title: Configure Connection Pool Parameters Explicitly for Production
impact: HIGH
impactDescription: Default GORM pool settings cause connection starvation under moderate load
tags: gorm, connection-pool, performance, production, sqldb, maxopenconns
source: GORM Docs - Generic Database Interface, go-sql-driver docs
---

## Configure Connection Pool Parameters Explicitly for Production

GORM inherits Go's `database/sql` defaults: unlimited max connections, max 2 idle connections, no connection lifetime limit. Under production load, this causes connection exhaustion or stale connection errors.

**Impact**: HIGH - Connection starvation, `too many connections` errors, stale connection panics

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - default settings, not tuned for production
db, _ := gorm.Open(postgres.Open(dsn), &gorm.Config{})
// MaxOpenConns = unlimited → can exhaust PostgreSQL's max_connections
// MaxIdleConns = 2 → frequent connection re-establishment under load
```

### Correct (Best Practice)

```go
// ✅ GOOD - explicit, production-tuned pool settings
db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
if err != nil {
    return nil, err
}

sqlDB, err := db.DB()
if err != nil {
    return nil, err
}

sqlDB.SetMaxOpenConns(25)                   // Max concurrent connections to PostgreSQL
sqlDB.SetMaxIdleConns(10)                   // Idle connections kept warm
sqlDB.SetConnMaxLifetime(5 * time.Minute)   // Rotate connections to prevent stale sessions
sqlDB.SetConnMaxIdleTime(1 * time.Minute)   // Release idle connections sooner
```

### Tuning Guide

- `MaxOpenConns`: Start at 20-30. Total across all app instances must be < PostgreSQL `max_connections` (default 100)
- `MaxIdleConns`: 30-50% of `MaxOpenConns`
- `ConnMaxLifetime`: 5-10 minutes (prevents stale SSL sessions, load-balancer drops)
- `ConnMaxIdleTime`: 1 minute (frees unused connections during low-traffic periods)

### References

- [GORM Docs: Generic Database Interface](https://gorm.io/docs/generic_interface.html)
- [Go database/sql docs](https://pkg.go.dev/database/sql)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: HIGH
**Auto-fixable**: No
