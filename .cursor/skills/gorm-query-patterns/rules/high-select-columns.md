---
title: Use Select to Fetch Only Required Columns
impact: HIGH
impactDescription: SELECT * fetches large text/JSON columns unnecessarily — wasted bandwidth and memory
tags: gorm, select, columns, performance, select-star, bandwidth
source: GORM Docs - Query, Use The Index Luke - Column Selection
---

## Use Select to Fetch Only Required Columns

`SELECT *` fetches every column, including large `TEXT`, `JSONB`, `BYTEA`, and nullable columns the application doesn't need. Selecting only required columns reduces data transfer, memory usage, and can enable index-only scans.

**Impact**: HIGH - Unnecessary memory allocation, network overhead, prevents index-only scans

### Detection

How to spot this issue:
- `db.Find(&users)` or `db.Where(...).Find(&results)` with no `.Select(...)` call
- `db.Raw("SELECT * FROM ...")` in performance-sensitive paths
- Repository methods returning full model structs when only a subset of fields is used by the caller

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - fetches all columns including avatar_url (large), metadata (JSONB), etc.
func (r *UserRepository) ListForDropdown() ([]User, error) {
    var users []User
    err := db.Find(&users).Error
    // Only ID and Name are used in the dropdown — everything else is wasted
    return users, err
}

// ❌ BAD - SELECT * in raw query
func (r *ProductRepository) SearchByName(query string) ([]Product, error) {
    var products []Product
    err := db.Raw("SELECT * FROM products WHERE name ILIKE ?", "%"+query+"%").
        Scan(&products).Error
    return products, err
}
```

**Why this is wrong**:
- A `users` table with `avatar_url TEXT` or `preferences JSONB` can be 10-100x larger per row than just `(id, name)`
- PostgreSQL must read full rows even if only 2 of 20 columns are needed (unless index-only scan is possible)
- High memory allocation on Go side for unused fields

### Correct (Best Practice)

```go
// ✅ GOOD - select only what's needed
type UserOption struct {
    ID   uint
    Name string
}

func (r *UserRepository) ListForDropdown(ctx context.Context) ([]UserOption, error) {
    var opts []UserOption
    if err := r.db.WithContext(ctx).
        Model(&User{}).
        Select("id", "name").
        Where("is_active = ?", true).
        Find(&opts).Error; err != nil {
        return nil, fmt.Errorf("UserRepository.ListForDropdown: %w", err)
    }
    return opts, nil
}

// ✅ GOOD - select in raw query
func (r *ProductRepository) SearchByName(ctx context.Context, query string) ([]ProductSummary, error) {
    var products []ProductSummary
    if err := r.db.WithContext(ctx).
        Raw("SELECT id, name, price, stock FROM products WHERE name ILIKE ?", "%"+query+"%").
        Scan(&products).Error; err != nil {
        return nil, err
    }
    return products, nil
}

// ✅ GOOD - use full struct only when full data is genuinely needed
func (r *UserRepository) FindByID(ctx context.Context, id uint) (*User, error) {
    var user User
    if err := r.db.WithContext(ctx).First(&user, id).Error; err != nil {
        return nil, err
    }
    return &user, nil  // Full model appropriate here
}
```

**Why this is better**:
- Minimal data transfer between DB and application
- Dedicated response structs (`UserOption`, `ProductSummary`) make API contracts explicit
- PostgreSQL can use index-only scans when all selected columns are in the index

### Additional Context

- Create dedicated "projection" structs for read-heavy list endpoints — don't reuse the full ORM model
- For very large tables, `Select("id", "name")` combined with a covering index `(is_active, id, name)` enables index-only scans (no heap reads)

### References

- [GORM Docs: Selecting Specific Fields](https://gorm.io/docs/query.html#Selecting-Specific-Fields)
- [Use The Index, Luke: Clustering and Covering Indexes](https://use-the-index-luke.com/sql/clustering/covering-indexes)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: HIGH
**Auto-fixable**: No (requires knowing which columns are needed)
