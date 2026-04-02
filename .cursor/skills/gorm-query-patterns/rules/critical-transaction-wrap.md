---
title: Wrap Multi-Step Database Operations in Transactions
impact: CRITICAL
impactDescription: Partial writes — data inconsistency when second operation fails after first succeeds
tags: gorm, transaction, atomicity, data-integrity, rollback
source: GORM Docs - Transactions
---

## Wrap Multi-Step Database Operations in Transactions

When two or more database writes must succeed or fail together, they must be wrapped in a transaction. Without a transaction, a failure after the first write leaves the database in a partially-updated, inconsistent state.

**Impact**: CRITICAL - Data inconsistency, orphaned records, financial discrepancies

### Detection

How to spot this issue:
- Two or more `db.Create()`, `db.Save()`, `db.Update()`, or `db.Exec()` calls in sequence without `db.Transaction()`
- Business operations like "create order + deduct inventory" or "transfer balance" without transaction wrapper
- Absence of `db.Transaction(func(tx *gorm.DB) error {...})` in multi-write repository methods

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - two writes without transaction
// If CreatePayment fails, Order exists but has no Payment record
func (r *OrderRepository) CreateOrderWithPayment(order *Order, payment *Payment) error {
    if err := db.Create(order).Error; err != nil {
        return err
    }
    if err := db.Create(payment).Error; err != nil {
        return err  // Order already written — now orphaned!
    }
    return nil
}

// ❌ BAD - balance transfer without transaction
func (r *WalletRepository) Transfer(fromID, toID uint, amount float64) error {
    db.Model(&Wallet{}).Where("id = ?", fromID).
        UpdateColumn("balance", gorm.Expr("balance - ?", amount))
    db.Model(&Wallet{}).Where("id = ?", toID).
        UpdateColumn("balance", gorm.Expr("balance + ?", amount))
    // If second update fails: money deducted but never credited!
    return nil
}
```

**Why this is wrong**:
- Network hiccup, DB constraint, or deadlock on the second write leaves data inconsistent
- No automatic rollback of the first successful write
- Audit logs and downstream consumers see partial state

### Correct (Best Practice)

```go
// ✅ GOOD - atomic transaction via db.Transaction()
func (r *OrderRepository) CreateOrderWithPayment(order *Order, payment *Payment) error {
    return db.Transaction(func(tx *gorm.DB) error {
        if err := tx.Create(order).Error; err != nil {
            return err  // Auto-rollback triggered
        }
        payment.OrderID = order.ID  // Use ID assigned by DB
        if err := tx.Create(payment).Error; err != nil {
            return err  // Auto-rollback triggered, Order also rolled back
        }
        return nil  // Commit only if both succeed
    })
}

// ✅ GOOD - balance transfer with transaction
func (r *WalletRepository) Transfer(fromID, toID uint, amount float64) error {
    return db.Transaction(func(tx *gorm.DB) error {
        // Deduct from source
        result := tx.Model(&Wallet{}).Where("id = ? AND balance >= ?", fromID, amount).
            UpdateColumn("balance", gorm.Expr("balance - ?", amount))
        if result.Error != nil {
            return result.Error
        }
        if result.RowsAffected == 0 {
            return ErrInsufficientBalance
        }
        // Credit to destination
        if err := tx.Model(&Wallet{}).Where("id = ?", toID).
            UpdateColumn("balance", gorm.Expr("balance + ?", amount)).Error; err != nil {
            return err  // Deduction also rolled back
        }
        return nil
    })
}

// ✅ GOOD - passing tx down the call stack (for usecase-level transactions)
func (uc *OrderUseCase) PlaceOrder(ctx context.Context, req PlaceOrderRequest) error {
    return uc.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
        if err := uc.orderRepo.CreateWithTx(tx, req.Order); err != nil {
            return err
        }
        if err := uc.inventoryRepo.DeductWithTx(tx, req.Items); err != nil {
            return err
        }
        return nil
    })
}
```

**Why this is better**:
- Either all writes commit or none do — atomicity guaranteed
- `db.Transaction()` handles `BEGIN`, `COMMIT`, and `ROLLBACK` automatically
- Returning any non-nil error triggers automatic rollback

### Additional Context

- Transactions should be initiated at the **usecase layer**, not the repository layer. Repositories accept `*gorm.DB` (which may be a transaction `tx`) as a parameter. See `arch-transaction-ownership.md`.
- For long-running transactions with multiple retries (serialization failures), see `critical-serialization-retry.md` in error-handling domain.
- `db.Transaction()` is **not** suitable for distributed transactions across microservices — use Saga pattern for that.

### References

- [GORM Docs: Transactions](https://gorm.io/docs/transactions.html)
- Clean Architecture (Robert C. Martin) — Chapter on Use Case layer responsibilities

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: CRITICAL
**Auto-fixable**: No (requires refactor)
