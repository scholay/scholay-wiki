---
title: Use Omit or Session to Skip Unintended Association Upserts
impact: MEDIUM
impactDescription: GORM upserts all loaded associations on Create/Save — silently updates unrelated records
tags: gorm, associations, omit, upsert, create, session
source: GORM Docs - Create with Associations
---

## Use Omit or Session to Skip Unintended Association Upserts

By default, GORM upserts all non-zero associations when calling `Create` or `Save`. If a struct has loaded associations (e.g., `User.Company`), GORM will attempt to upsert the `Company` record even if you only intended to create the `User`. This silently modifies unrelated records.

**Impact**: MEDIUM - Unintended upserts on association records, hard-to-debug data changes

### Detection

How to spot this issue:
- `db.Create(&model)` where the model has association fields populated
- Structs received from request payload with nested objects passed directly to `db.Create()`
- `db.Save(&model)` on a model with loaded `BelongsTo` or `HasMany` associations

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - GORM will upsert Company even though we only want to create User
type User struct {
    ID        uint
    Name      string
    CompanyID uint
    Company   Company  // BelongsTo association
}

func (r *UserRepository) Create(user *User) error {
    // If user.Company is populated (e.g., from request body),
    // GORM will also UPDATE the Company record!
    return r.db.Create(user).Error
}
```

### Correct (Best Practice)

```go
// ✅ GOOD - Omit specific association
func (r *UserRepository) Create(ctx context.Context, user *User) error {
    return r.db.WithContext(ctx).Omit("Company").Create(user).Error
}

// ✅ GOOD - Omit all associations
func (r *UserRepository) Create(ctx context.Context, user *User) error {
    return r.db.WithContext(ctx).Omit(clause.Associations).Create(user).Error
}

// ✅ GOOD - Session to disable association creation globally for this call
func (r *UserRepository) Create(ctx context.Context, user *User) error {
    return r.db.WithContext(ctx).
        Session(&gorm.Session{FullSaveAssociations: false}).
        Create(user).Error
}
```

**Why this is better**:
- Only the intended record is created/updated
- Association updates are explicit and intentional, not automatic

### References

- [GORM Docs: Create with Associations](https://gorm.io/docs/associations.html#Create-Update-Associations)
- [GORM Docs: Session](https://gorm.io/docs/session.html)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: MEDIUM
**Auto-fixable**: No
