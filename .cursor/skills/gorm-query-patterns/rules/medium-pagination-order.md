---
title: Always Use Explicit Order in Paginated Queries
impact: MEDIUM
impactDescription: Pagination without ORDER BY returns non-deterministic rows — users see duplicates or missing items across pages
tags: gorm, pagination, order-by, limit, offset, deterministic
source: PostgreSQL Docs - ORDER BY, Use The Index Luke - Pagination
---

## Always Use Explicit Order in Paginated Queries

PostgreSQL does not guarantee row ordering without an explicit `ORDER BY`. A `LIMIT 20 OFFSET 40` without `ORDER BY` can return the same row on page 2 that appeared on page 1, or skip rows entirely, because the query planner is free to return rows in any order.

**Impact**: MEDIUM - Users see duplicates or missing items when paginating, hard to reproduce bugs

### Detection

How to spot this issue:
- `db.Limit(n).Offset(n).Find(...)` without a `.Order(...)` call
- Pagination helper functions that don't enforce ordering
- `ORDER BY created_at` without a secondary sort column (ties produce non-determinism)

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - no ORDER BY, non-deterministic pagination
func (r *ProductRepository) Paginate(page, size int) ([]Product, error) {
    var products []Product
    err := r.db.Limit(size).Offset(page * size).Find(&products).Error
    return products, err
    // Same products may appear on page 1 AND page 2 under concurrent writes
}

// ❌ BAD - single column ORDER BY with potential ties
func (r *ProductRepository) Paginate(page, size int) ([]Product, error) {
    var products []Product
    err := r.db.Order("created_at DESC").Limit(size).Offset(page * size).Find(&products).Error
    return products, err
    // If two products created at same timestamp, order between them is still non-deterministic
}
```

### Correct (Best Practice)

```go
// ✅ GOOD - stable sort with tiebreaker
func (r *ProductRepository) Paginate(ctx context.Context, page, size int) ([]Product, error) {
    var products []Product
    if err := r.db.WithContext(ctx).
        Order("created_at DESC, id DESC").  // id as deterministic tiebreaker
        Limit(size).
        Offset(page * size).
        Find(&products).Error; err != nil {
        return nil, fmt.Errorf("ProductRepository.Paginate: %w", err)
    }
    return products, nil
}

// ✅ BETTER - cursor-based pagination (avoids OFFSET performance issue on large tables)
func (r *ProductRepository) PaginateAfter(ctx context.Context, afterID uint, size int) ([]Product, error) {
    var products []Product
    if err := r.db.WithContext(ctx).
        Where("id > ?", afterID).
        Order("id ASC").
        Limit(size).
        Find(&products).Error; err != nil {
        return nil, err
    }
    return products, nil
}
```

**Why this is better**:
- `ORDER BY created_at DESC, id DESC` is fully deterministic — `id` breaks any timestamp ties
- Cursor-based pagination (`WHERE id > ?`) avoids the `OFFSET` performance problem (OFFSET must skip N rows)
- For large tables (>100k rows), consider cursor pagination over offset pagination

### Additional Context

- `OFFSET n` performance degrades linearly — `OFFSET 10000` must read and discard 10,000 rows before returning results
- For user-facing APIs with sequential page navigation, OFFSET is acceptable up to ~1,000 pages
- For high-volume data or API consumers, cursor-based pagination is significantly faster

### References

- [PostgreSQL Docs: ORDER BY](https://www.postgresql.org/docs/16/queries-order.html)
- [Use The Index, Luke: Paging Through Results](https://use-the-index-luke.com/sql/partial-results/fetch-next-page)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: MEDIUM
**Auto-fixable**: Partially (can detect missing Order, but correct column choice requires domain knowledge)
