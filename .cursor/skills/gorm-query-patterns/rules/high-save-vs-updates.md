---
title: Use Updates with Map for Explicit Field Updates, Not Save
impact: HIGH
impactDescription: db.Save resets all zero-value fields — silently overwrites data with false/0/""
tags: gorm, save, updates, zero-value, partial-update, data-loss
source: GORM Docs - Update
---

## Use Updates with Map for Explicit Field Updates, Not Save

`db.Save()` performs a full UPDATE of all fields, including zero-values (`false`, `0`, `""`). Using it to update one field accidentally resets all other unset fields to their zero values. Use `db.Updates()` with a `map` for explicit, safe partial updates.

**Impact**: HIGH - Silent data overwrite — boolean flags reset to false, counters to 0

### Detection

How to spot this issue:
- `db.Save(&model)` where only one or two fields were changed on the struct
- `model.FieldA = newValue; db.Save(&model)` pattern without loading all current values first
- `db.Updates(structValue)` (with struct, not map) — still skips zero values, may cause unintended partial update

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - Save overwrites ALL fields including zeros
func (r *UserRepository) Deactivate(userID uint) error {
    user := User{ID: userID, IsActive: false}
    // SQL: UPDATE users SET name='', email='', is_active=false, created_at='0001-...' WHERE id=?
    // Wipes name, email, and all other fields!
    return db.Save(&user).Error
}

// ❌ BAD - Updates with struct skips zero-values
// If you want to set IsActive=false, Updates(struct) will SKIP it (zero value)
func (r *UserRepository) Deactivate(userID uint) error {
    return db.Model(&User{ID: userID}).
        Updates(User{IsActive: false}).Error  // IsActive=false is skipped!
}
```

**Why this is wrong**:
- `Save` generates `UPDATE users SET col1=?, col2=?, ...` for every field
- A `User{ID: 1, IsActive: false}` has empty string for Name, Email — these get written to DB
- `Updates(struct)` uses GORM's "non-zero value" filter — `false`, `0`, `""` are all skipped

### Correct (Best Practice)

```go
// ✅ GOOD - Updates with map: only specified fields are updated
func (r *UserRepository) Deactivate(userID uint) error {
    result := db.Model(&User{}).Where("id = ?", userID).
        Updates(map[string]interface{}{"is_active": false})
    if result.Error != nil {
        return fmt.Errorf("UserRepository.Deactivate: %w", result.Error)
    }
    if result.RowsAffected == 0 {
        return ErrUserNotFound
    }
    return nil
    // SQL: UPDATE users SET is_active=false WHERE id=?  ✅
}

// ✅ GOOD - Updates with struct is safe for non-zero values
func (r *UserRepository) UpdateName(userID uint, name string) error {
    return db.Model(&User{}).Where("id = ?", userID).
        Updates(User{Name: name}).Error
    // Safe because name is a non-zero string
}

// ✅ GOOD - UpdateColumn for single column (bypasses hooks and zero-value check)
func (r *UserRepository) IncrementLoginCount(userID uint) error {
    return db.Model(&User{}).Where("id = ?", userID).
        UpdateColumn("login_count", gorm.Expr("login_count + 1")).Error
}

// ✅ GOOD - Save is appropriate when you load the full record first
func (r *UserRepository) UpdateProfile(userID uint, name, bio string) error {
    var user User
    if err := db.First(&user, userID).Error; err != nil {
        return err
    }
    user.Name = name
    user.Bio = bio
    return db.Save(&user).Error  // Safe: full struct loaded, not partial
}
```

**Why this is better**:
- `Updates(map[string]interface{})` generates minimal `UPDATE` touching only specified columns
- Atomic partial updates without side effects on other fields
- `UpdateColumn` bypasses GORM hooks (BeforeSave, AfterSave) — use intentionally

### Quick Decision Guide

| Scenario | Use |
|---|---|
| Update 1-3 specific fields | `Updates(map[string]interface{}{...})` |
| Update non-zero fields from struct | `Updates(User{Name: name})` |
| Set a field to zero/false/"" | `Updates(map[string]interface{}{"field": false})` |
| Atomic increment/decrement | `UpdateColumn("col", gorm.Expr("col + 1"))` |
| Full record update (loaded first) | `Save(&loadedModel)` |

### References

- [GORM Docs: Update](https://gorm.io/docs/update.html)
- [GORM Docs: Save](https://gorm.io/docs/update.html#Save-All-Fields)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: HIGH
**Auto-fixable**: No (requires intent analysis)
