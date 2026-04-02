---
title: Always Check .Error After Every GORM Operation
impact: CRITICAL
impactDescription: Silent failures — zero-value data returned as valid, downstream corruption
tags: gorm, error-handling, silent-failure, error-check
source: GORM Docs - Error Handling
---

## Always Check .Error After Every GORM Operation

GORM never panics on database errors — it stores the error in the `*gorm.DB` result and returns a zero-value struct. Unchecked errors cause downstream code to silently process empty or corrupted data.

**Impact**: CRITICAL - Silent data loss, incorrect business logic executed on zero-value structs

### Detection

How to spot this issue:
- `db.Where(...).Find(&result)` with no `.Error` check afterward
- `db.Create(&model)` without checking result
- `db.First(&model, id)` without `errors.Is(err, gorm.ErrRecordNotFound)` check
- Return statement immediately after GORM call with no error variable

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - error silently ignored, user is zero-value User{}
func (r *UserRepository) FindByID(id uint) *User {
    var user User
    db.Where("id = ?", id).First(&user)
    return &user  // Returns empty User{} if not found or DB is down!
}

// ❌ BAD - create error ignored
func (r *UserRepository) Create(user *User) {
    db.Create(user)
    // If DB connection fails, caller never knows
}

// ❌ BAD - chained without error check
func (r *OrderRepository) FindPaidOrders() []Order {
    var orders []Order
    db.Where("status = ?", "paid").Find(&orders)
    return orders  // Could be empty due to error, not just no results
}
```

**Why this is wrong**:
- Caller receives `User{ID: 0, Name: ""}` with no indication of failure
- Business logic proceeds with invalid data (e.g., sending email to empty address)
- Errors from DB connection issues, query errors, or constraint violations all disappear silently

### Correct (Best Practice)

```go
// ✅ GOOD - always propagate errors
func (r *UserRepository) FindByID(id uint) (*User, error) {
    var user User
    if err := db.Where("id = ?", id).First(&user).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, ErrUserNotFound  // Explicit domain error
        }
        return nil, fmt.Errorf("UserRepository.FindByID(id=%d): %w", id, err)
    }
    return &user, nil
}

// ✅ GOOD - check create result
func (r *UserRepository) Create(user *User) error {
    if err := db.Create(user).Error; err != nil {
        return fmt.Errorf("UserRepository.Create: %w", err)
    }
    return nil
}

// ✅ GOOD - propagate find errors
func (r *OrderRepository) FindPaidOrders() ([]Order, error) {
    var orders []Order
    if err := db.Where("status = ?", "paid").Find(&orders).Error; err != nil {
        return nil, fmt.Errorf("OrderRepository.FindPaidOrders: %w", err)
    }
    return orders, nil  // Empty slice is valid (no paid orders), error is not
}
```

**Why this is better**:
- Errors are surfaced at the database layer, not hidden inside business logic
- Callers can distinguish between "not found", "DB error", and "empty result"
- `fmt.Errorf(...%w`, err) preserves the error chain for `errors.Is` checks upstream

### Additional Context

- `db.Find()` does **not** return `gorm.ErrRecordNotFound` for empty results — it returns an empty slice with `nil` error. Only `db.First()` returns `gorm.ErrRecordNotFound`.
- Use `db.First()` for single record by primary key; use `db.Find()` for lists. See also `high-first-vs-find.md`.
- Related: `high-rows-affected.md` in error-handling domain — for Update/Delete operations, also check `RowsAffected`.

### References

- [GORM Docs: Error Handling](https://gorm.io/docs/error_handling.html)
- [GORM Docs: Query](https://gorm.io/docs/query.html)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: CRITICAL
**Auto-fixable**: No (requires return signature change)
