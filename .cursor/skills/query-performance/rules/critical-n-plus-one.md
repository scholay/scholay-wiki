---
title: Detect and Eliminate N+1 Query Patterns
impact: CRITICAL
impactDescription: N+1 causes exponential DB queries under load — 100 records = 101 queries
tags: gorm, n+1, preload, performance, query-count, association
source: GORM Docs - Preloading, Use The Index Luke
---

## Detect and Eliminate N+1 Query Patterns

The N+1 problem is the most common GORM performance bug. Fetching a list of N records and then querying the DB once per record for its associations results in N+1 total queries. At scale, this degrades into thousands of queries per request.

**Impact**: CRITICAL - Exponential query growth, connection pool exhaustion, request timeouts

### Detection

- Loops with `db.Where(...).Find/First` inside
- `db.Find(&list)` followed by a range loop that accesses `item.Association`
- GORM debug logs showing the same query repeated N times with different IDs
- Slow endpoints that process lists of records with associations

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - classic N+1: 1 query for users + N queries for orders
func (r *UserRepository) FindWithOrders(ctx context.Context) ([]User, error) {
    var users []User
    if err := r.db.WithContext(ctx).Find(&users).Error; err != nil {
        return nil, err
    }
    for i := range users {
        // N separate queries — one per user!
        r.db.WithContext(ctx).Where("user_id = ?", users[i].ID).Find(&users[i].Orders)
    }
    return users, nil
}
// 100 users = 101 DB queries
```

### Correct (Best Practice)

```go
// ✅ GOOD - 2 queries total (Preload)
func (r *UserRepository) FindWithOrders(ctx context.Context) ([]User, error) {
    var users []User
    if err := r.db.WithContext(ctx).Preload("Orders").Find(&users).Error; err != nil {
        return nil, fmt.Errorf("UserRepository.FindWithOrders: %w", err)
    }
    return users, nil
}
// SQL: SELECT * FROM users; SELECT * FROM orders WHERE user_id IN (1,2,3,...)

// ✅ BEST - 1 query with JOIN (for 1:1 or filtered associations)
func (r *UserRepository) FindWithProfile(ctx context.Context) ([]User, error) {
    var users []User
    if err := r.db.WithContext(ctx).Joins("Profile").Find(&users).Error; err != nil {
        return nil, err
    }
    return users, nil
}
```

### Diagnosing N+1

Enable GORM logger in development to spot repeated queries:

```go
db, _ := gorm.Open(postgres.Open(dsn), &gorm.Config{
    Logger: logger.Default.LogMode(logger.Info),
})
// Watch for: same SQL with different ? values repeating N times
```

### References

- [GORM Docs: Preloading](https://gorm.io/docs/preload.html)
- [Use The Index, Luke](https://use-the-index-luke.com)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: CRITICAL
**Auto-fixable**: No (requires architectural fix)
