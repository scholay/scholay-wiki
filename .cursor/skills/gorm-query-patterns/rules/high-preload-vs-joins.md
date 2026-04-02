---
title: Use Preload for Loading Associations, Joins for Filtering
impact: HIGH
impactDescription: Wrong tool causes N+1 queries or incorrect filter results
tags: gorm, preload, joins, association, n+1, query-pattern
source: GORM Docs - Preloading, GORM Docs - Joins
---

## Use Preload for Loading Associations, Joins for Filtering

`Preload` and `Joins` serve different purposes. Mixing them causes either N+1 query patterns or incorrect WHERE behavior. The rule: use `Preload` to *load* related data, use `Joins` to *filter by* related data.

**Impact**: HIGH - N+1 queries under load, or silently incorrect query results

### Detection

How to spot this issue:
- `Preload("Relation").Where("relation.column = ?", ...)` — filtering on a preloaded association (wrong)
- `Joins("JOIN ... ON ...").Find(&results)` without `Preload` when association data is accessed in code (incomplete)
- Nested access to association inside a loop without prior `Preload`

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - Preload does not apply the WHERE filter correctly
// This runs: SELECT * FROM users + SELECT * FROM orders WHERE user_id IN (...)
// The WHERE "orders.status" filter is NOT applied to the main query
func (r *UserRepository) FindUsersWithPaidOrders() ([]User, error) {
    var users []User
    err := db.Preload("Orders").
        Where("orders.status = ?", "paid").  // This WHERE refers to users table, not orders!
        Find(&users).Error
    return users, err
}

// ❌ BAD - Joins loads the data but association struct is empty
// users[i].Profile will be nil even though JOIN was used
func (r *UserRepository) FindWithProfile() ([]User, error) {
    var users []User
    err := db.Joins("JOIN profiles ON profiles.user_id = users.id").
        Find(&users).Error
    // users[0].Profile is empty — JOIN filtered but didn't populate
    return users, err
}
```

**Why this is wrong**:
- `Preload` runs a **separate** query after the main query, so `Where("orders.status")` applies to the `users` table (no `orders` column there — silently returns wrong data or errors)
- `Joins` adds the JOIN to SQL but does **not** populate the Go struct fields — accessing `.Profile` returns zero-value

### Correct (Best Practice)

```go
// ✅ GOOD - Joins for filtering, Preload for populating struct
func (r *UserRepository) FindUsersWithPaidOrders() ([]User, error) {
    var users []User
    err := db.
        Joins("INNER JOIN orders ON orders.user_id = users.id AND orders.status = ?", "paid").
        Preload("Orders", "status = ?", "paid").  // Populate struct with filtered orders
        Distinct("users.*").
        Find(&users).Error
    return users, err
}

// ✅ GOOD - Preload with condition to populate correctly
func (r *UserRepository) FindWithActiveProfile() ([]User, error) {
    var users []User
    err := db.
        Preload("Profile", "is_active = ?", true).
        Find(&users).Error
    return users, err
}

// ✅ GOOD - Joins("AssociationName") syntax for smart preload + join in one
// This uses GORM's smart select, populates the struct AND joins
func (r *UserRepository) FindWithProfile() ([]User, error) {
    var users []User
    err := db.Joins("Profile").Find(&users).Error  // Populates users[i].Profile
    return users, err
}
```

**Why this is better**:
- `Joins("INNER JOIN ...")` with string SQL correctly adds the filter at the SQL level
- `Preload("Relation", condition)` correctly populates the Go struct with filtered data
- `Joins("AssociationName")` (GORM smart join) does both in one query — best for 1:1 associations

### Additional Context

| Use Case | Correct Tool |
|---|---|
| Filter users who have paid orders | `Joins("JOIN orders ON ...")` |
| Load a user's orders into `user.Orders` | `Preload("Orders")` |
| Filter AND load in one query (1:1) | `Joins("Profile")` (smart join) |
| Filter AND load (1:many) | `Joins(...)` + `Preload(...)` |

### References

- [GORM Docs: Preloading](https://gorm.io/docs/preload.html)
- [GORM Docs: Joins](https://gorm.io/docs/query.html#Joins)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: HIGH
**Auto-fixable**: No (requires understanding intent)
