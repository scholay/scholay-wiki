---
title: Always Pass Context via db.WithContext
impact: HIGH
impactDescription: Queries run without timeout — DB connection held indefinitely on slow/hung queries
tags: gorm, context, timeout, cancellation, tracing, withcontext
source: GORM Docs - Context, Go Blog - Context
---

## Always Pass Context via db.WithContext

Without context, GORM queries have no timeout and cannot be cancelled. A slow or hung query holds the DB connection until the query completes, eventually exhausting the connection pool. Context also enables distributed tracing and request-scoped logging.

**Impact**: HIGH - Connection pool exhaustion under slow queries, no request cancellation, no tracing

### Detection

How to spot this issue:
- Repository methods that accept `ctx context.Context` but don't pass it to GORM via `db.WithContext(ctx)`
- `db.Find(...)`, `db.Create(...)`, `db.Raw(...)` calls without `.WithContext(ctx)` prefix
- Controller/handler code passing context to usecase, but usecase not passing it to repository

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - context accepted but not passed to GORM
func (r *UserRepository) FindActive(ctx context.Context) ([]User, error) {
    var users []User
    err := db.Where("is_active = ?", true).Find(&users).Error
    // Query runs without timeout — holds connection until DB responds
    return users, err
}

// ❌ BAD - no context at all
func (r *OrderRepository) FindByUser(userID uint) ([]Order, error) {
    var orders []Order
    err := db.Where("user_id = ?", userID).Find(&orders).Error
    return orders, err
}
```

**Why this is wrong**:
- HTTP request is cancelled (client disconnects), but DB query keeps running
- If DB slows down, all connections are held by queries that nobody is waiting for
- Zero tracing integration — impossible to correlate DB queries to HTTP requests in APM tools

### Correct (Best Practice)

```go
// ✅ GOOD - context propagated to GORM
func (r *UserRepository) FindActive(ctx context.Context) ([]User, error) {
    var users []User
    if err := r.db.WithContext(ctx).Where("is_active = ?", true).Find(&users).Error; err != nil {
        return nil, fmt.Errorf("UserRepository.FindActive: %w", err)
    }
    return users, nil
}

// ✅ GOOD - handler sets timeout, repository honours it
func (h *UserHandler) ListActive(c echo.Context) error {
    ctx, cancel := context.WithTimeout(c.Request().Context(), 5*time.Second)
    defer cancel()

    users, err := h.userUseCase.FindActive(ctx)
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    return c.JSON(http.StatusOK, users)
}

// ✅ GOOD - store db in repository struct for clean access
type UserRepository struct {
    db *gorm.DB
}

func (r *UserRepository) Create(ctx context.Context, user *User) error {
    return r.db.WithContext(ctx).Create(user).Error
}
```

**Why this is better**:
- Query cancelled automatically when `ctx` deadline exceeded — no wasted DB connections
- APM tools (Datadog, OpenTelemetry) can trace DB calls per HTTP request
- Graceful shutdown: in-flight queries respect `ctx.Done()`

### Additional Context

- Set timeout at the **handler or usecase layer**, not the repository. Repository should honour whatever context it receives.
- Common timeout values: read queries 3-5s, write queries 5-10s, background jobs 30s-5min
- If using OpenTelemetry, GORM's `otelgorm` plugin auto-creates spans when context is passed

### References

- [GORM Docs: Context](https://gorm.io/docs/context.html)
- [Go Blog: Context](https://go.dev/blog/context)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: HIGH
**Auto-fixable**: Partially (adding WithContext is mechanical once pattern is known)
