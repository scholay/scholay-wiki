---
title: Use db.First for Single Records, db.Find for Lists
impact: HIGH
impactDescription: db.First adds hidden ORDER BY + LIMIT 1 — wrong for list queries, causes subtle bugs
tags: gorm, first, find, order-by, limit, query-semantics
source: GORM Docs - Query
---

## Use db.First for Single Records, db.Find for Lists

`db.First()` automatically appends `ORDER BY primary_key LIMIT 1` to the query. Using it for list operations introduces an unintended sort and truncates results. Using `db.Find()` for a single record lookup doesn't check if zero or multiple records matched.

**Impact**: HIGH - Silently returns wrong data for list queries; no "not found" signal from Find

### Detection

How to spot this issue:
- `db.First(&slice, condition)` where the variable is a slice (should be `Find`)
- `db.Find(&singleStruct, "id = ?", id)` without a "not found" check — won't return `gorm.ErrRecordNotFound`
- `db.First` used in a loop or in list-fetching repository methods

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - First on a list: adds ORDER BY id LIMIT 1 → always returns max 1 record
func (r *ProductRepository) FindByCategory(categoryID uint) ([]Product, error) {
    var products []Product
    err := db.First(&products, "category_id = ?", categoryID).Error
    // SQL: SELECT * FROM products WHERE category_id = ? ORDER BY id LIMIT 1
    // Returns only 1 product even if 100 exist!
    return products, err
}

// ❌ BAD - Find for single record: no ErrRecordNotFound if missing
func (r *UserRepository) FindByEmail(email string) (*User, error) {
    var user User
    err := db.Find(&user, "email = ?", email).Error
    // If email doesn't exist: err is nil AND user is User{} — looks like success!
    return &user, err
}
```

**Why this is wrong**:
- `db.First` on a list silently limits the result to 1 row, hiding data
- `db.Find` for a single lookup returns a zero-value struct with `nil` error — caller can't distinguish "found empty" from "not found"

### Correct (Best Practice)

```go
// ✅ CORRECT - Find for lists
func (r *ProductRepository) FindByCategory(categoryID uint) ([]Product, error) {
    var products []Product
    if err := db.Where("category_id = ?", categoryID).Find(&products).Error; err != nil {
        return nil, fmt.Errorf("ProductRepository.FindByCategory: %w", err)
    }
    return products, nil  // Empty slice is valid — means no products in category
}

// ✅ CORRECT - First for single record by primary key
func (r *UserRepository) FindByID(id uint) (*User, error) {
    var user User
    if err := db.First(&user, id).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, ErrUserNotFound
        }
        return nil, fmt.Errorf("UserRepository.FindByID: %w", err)
    }
    return &user, nil
}

// ✅ CORRECT - First with non-PK condition (still adds ORDER BY id)
func (r *UserRepository) FindByEmail(email string) (*User, error) {
    var user User
    if err := db.Where("email = ?", email).First(&user).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, ErrUserNotFound
        }
        return nil, fmt.Errorf("UserRepository.FindByEmail: %w", err)
    }
    return &user, nil
}

// ✅ CORRECT - Take for single record without ORDER BY (faster if no index on PK)
func (r *SessionRepository) FindByToken(token string) (*Session, error) {
    var session Session
    if err := db.Where("token = ?", token).Take(&session).Error; err != nil {
        if errors.Is(err, gorm.ErrRecordNotFound) {
            return nil, ErrSessionNotFound
        }
        return nil, fmt.Errorf("SessionRepository.FindByToken: %w", err)
    }
    return &session, nil
}
```

**Why this is better**:
- `Find` returns all matching rows with no implicit ORDER BY or LIMIT
- `First` provides `ErrRecordNotFound` for proper "not found" handling
- `Take` is like `First` but without the `ORDER BY primary_key` — useful when there's an index on the condition column

### GORM Method Quick Reference

| Method | SQL Added | Returns ErrRecordNotFound | Use For |
|---|---|---|---|
| `First` | `ORDER BY pk LIMIT 1` | Yes | Single record by PK |
| `Take` | `LIMIT 1` | Yes | Single record by non-PK with index |
| `Last` | `ORDER BY pk DESC LIMIT 1` | Yes | Most recent record |
| `Find` | Nothing | No | Lists, optional single |

### References

- [GORM Docs: Query](https://gorm.io/docs/query.html)
- [GORM Docs: Error Handling](https://gorm.io/docs/error_handling.html)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: HIGH
**Auto-fixable**: Partially (First → Find for slices is automatable)
