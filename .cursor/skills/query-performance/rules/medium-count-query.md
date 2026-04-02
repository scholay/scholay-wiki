---
title: Use db.Count Instead of len() on Full Fetch
impact: MEDIUM
impactDescription: Fetching all rows to count them wastes memory and bandwidth
tags: gorm, count, performance, len, full-fetch
source: GORM Docs - Count
---

## Use db.Count Instead of len() on Full Fetch

Fetching all matching rows into memory just to call `len()` is wasteful. `db.Count()` generates `SELECT COUNT(*) FROM ...` which is far cheaper.

**Impact**: MEDIUM - Unnecessary memory allocation and data transfer for count-only operations

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - loads all rows to count them
var orders []Order
r.db.Where("user_id = ?", userID).Find(&orders)
count := len(orders)
```

### Correct (Best Practice)

```go
// ✅ GOOD - single COUNT(*) query
var count int64
if err := r.db.Model(&Order{}).Where("user_id = ?", userID).Count(&count).Error; err != nil {
    return 0, err
}
```

### References

- [GORM Docs: Count](https://gorm.io/docs/query.html#Count)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: MEDIUM
**Auto-fixable**: Yes
