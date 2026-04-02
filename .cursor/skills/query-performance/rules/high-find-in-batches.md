---
title: Use FindInBatches for Large Dataset Processing
impact: HIGH
impactDescription: Loading millions of rows at once causes OOM — batch processing is memory-safe
tags: gorm, findinbatches, batch, memory, oom, large-dataset
source: GORM Docs - FindInBatches
---

## Use FindInBatches for Large Dataset Processing

Calling `db.Find(&records)` on a table with millions of rows loads all records into memory at once. This causes OOM (out-of-memory) crashes in production. `FindInBatches` processes records in chunks, keeping memory usage constant.

**Impact**: HIGH - OOM crash on large tables, unresponsive application

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - loads all 5M orders into memory
func (s *ReportService) GenerateMonthlyReport(ctx context.Context) error {
    var orders []Order
    if err := s.db.WithContext(ctx).Find(&orders).Error; err != nil {
        return err
    }
    for _, order := range orders {  // 5M iterations, all in memory
        processOrder(order)
    }
    return nil
}
```

### Correct (Best Practice)

```go
// ✅ GOOD - constant memory usage regardless of table size
func (s *ReportService) GenerateMonthlyReport(ctx context.Context) error {
    var orders []Order
    result := s.db.WithContext(ctx).FindInBatches(&orders, 500, func(tx *gorm.DB, batch int) error {
        for _, order := range orders {  // Max 500 orders at a time
            if err := processOrder(order); err != nil {
                return err  // Stops batching on error
            }
        }
        return nil
    })
    return result.Error
}
```

### References

- [GORM Docs: FindInBatches](https://gorm.io/docs/finalize_method.html#FindInBatches)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: HIGH
**Auto-fixable**: No
