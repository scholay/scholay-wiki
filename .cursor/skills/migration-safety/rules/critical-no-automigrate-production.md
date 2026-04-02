---
title: Never Run AutoMigrate in the Production Application Startup Path
impact: CRITICAL
impactDescription: AutoMigrate runs on every restart, has no rollback, and can lock tables during deploy
tags: gorm, automigrate, migration, production, startup, table-lock
source: GORM Docs - Auto Migration
---

## Never Run AutoMigrate in the Production Application Startup Path

`AutoMigrate` is convenient in development but dangerous in production: it runs on every application start, has no rollback mechanism, and on large tables it holds a lock while altering schema. Use versioned migration files (golang-migrate or goose) instead.

**Impact**: CRITICAL - Table locks during deploy, no rollback on bad migration, schema drift across replicas

### Detection

- `db.AutoMigrate(...)` called in `main()` or application initialization code
- AutoMigrate in the same binary as the application server

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - runs on every pod restart in production
func main() {
    db := setupDB()
    db.AutoMigrate(&User{}, &Order{}, &Payment{})  // Locks tables on every restart!
    startHTTPServer(db)
}
```

### Correct (Best Practice)

```go
// ✅ GOOD - separate migration binary (cmd/migrate/main.go)
// Run manually or as init container before app starts
func main() {
    db := setupDB()
    if err := db.AutoMigrate(&User{}, &Order{}, &Payment{}); err != nil {
        log.Fatal("migration failed:", err)
    }
    log.Println("Migration complete")
    // Process exits — doesn't start server
}

// ✅ BEST - versioned SQL migrations with golang-migrate
// migrations/000001_create_users.up.sql
// migrations/000001_create_users.down.sql
// migrations/000002_add_phone_to_users.up.sql
// Run: migrate -path ./migrations -database $DATABASE_URL up
```

### References

- [GORM Docs: Auto Migration](https://gorm.io/docs/migration.html)
- [golang-migrate](https://github.com/golang-migrate/migrate)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: CRITICAL
**Auto-fixable**: No (architectural change)
