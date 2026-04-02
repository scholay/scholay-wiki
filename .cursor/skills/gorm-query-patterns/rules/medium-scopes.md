---
title: Use Scopes for Reusable Query Logic
impact: MEDIUM
impactDescription: Duplicated WHERE clauses across repositories — inconsistent filters, maintenance overhead
tags: gorm, scopes, reusability, dry, query-pattern
source: GORM Docs - Scopes
---

## Use Scopes for Reusable Query Logic

Repeating the same `Where` conditions (e.g., `deleted_at IS NULL`, `status = 'active'`, `tenant_id = ?`) across multiple repository methods creates maintenance risk — one update to the filter must be applied in N places.

**Impact**: MEDIUM - Code duplication, inconsistent filter logic, higher maintenance cost

### Detection

How to spot this issue:
- Identical `Where("deleted_at IS NULL")` or `Where("is_active = true")` repeated across multiple repository methods
- Multi-tenant filter `Where("tenant_id = ?", tenantID)` copy-pasted in every query
- Status filters duplicated across different entity repositories

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - duplicated filters across methods
func (r *UserRepository) FindActive(ctx context.Context) ([]User, error) {
    var users []User
    err := r.db.WithContext(ctx).
        Where("deleted_at IS NULL AND is_active = ?", true).Find(&users).Error
    return users, err
}

func (r *UserRepository) FindActiveAdmins(ctx context.Context) ([]User, error) {
    var users []User
    err := r.db.WithContext(ctx).
        Where("deleted_at IS NULL AND is_active = ? AND role = ?", true, "admin").Find(&users).Error
    return users, err
}

// If soft-delete logic changes, must update both (and every other copy)
```

**Why this is wrong**:
- Business rule encoded in multiple places — easy to miss one during refactor
- Filter inconsistency risk: one method filters soft-deleted, another doesn't

### Correct (Best Practice)

```go
// ✅ GOOD - define reusable scopes
func NotDeleted(db *gorm.DB) *gorm.DB {
    return db.Where("deleted_at IS NULL")
}

func Active(db *gorm.DB) *gorm.DB {
    return db.Where("is_active = ?", true)
}

func ForTenant(tenantID uint) func(db *gorm.DB) *gorm.DB {
    return func(db *gorm.DB) *gorm.DB {
        return db.Where("tenant_id = ?", tenantID)
    }
}

// ✅ GOOD - compose scopes cleanly
func (r *UserRepository) FindActive(ctx context.Context) ([]User, error) {
    var users []User
    if err := r.db.WithContext(ctx).Scopes(NotDeleted, Active).Find(&users).Error; err != nil {
        return nil, err
    }
    return users, nil
}

func (r *UserRepository) FindActiveAdmins(ctx context.Context) ([]User, error) {
    var users []User
    if err := r.db.WithContext(ctx).
        Scopes(NotDeleted, Active).
        Where("role = ?", "admin").
        Find(&users).Error; err != nil {
        return nil, err
    }
    return users, nil
}

// ✅ GOOD - tenant-aware scope with parameter
func (r *OrderRepository) FindForTenant(ctx context.Context, tenantID uint) ([]Order, error) {
    var orders []Order
    if err := r.db.WithContext(ctx).Scopes(NotDeleted, ForTenant(tenantID)).
        Find(&orders).Error; err != nil {
        return nil, err
    }
    return orders, nil
}
```

**Why this is better**:
- Soft-delete logic defined once — change in one place affects all queries
- Scopes are composable and testable independently
- Parameterized scopes (like `ForTenant`) cleanly encapsulate multi-tenant patterns

### References

- [GORM Docs: Scopes](https://gorm.io/docs/scopes.html)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: MEDIUM
**Auto-fixable**: No
