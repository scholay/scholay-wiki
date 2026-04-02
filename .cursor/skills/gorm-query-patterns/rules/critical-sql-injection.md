---
title: Never Use String Concatenation in db.Raw or db.Where
impact: CRITICAL
impactDescription: SQL injection — full database compromise
tags: gorm, sql-injection, security, raw-sql, parameterized-query
source: OWASP SQL Injection Prevention Cheat Sheet, GORM Docs - Raw SQL
---

## Never Use String Concatenation in db.Raw or db.Where

Concatenating user input directly into SQL strings creates SQL injection vulnerabilities. GORM's `db.Raw()`, `db.Where()`, and `db.Exec()` all support parameterized placeholders — always use them.

**Impact**: CRITICAL - Full database compromise, data exfiltration, data deletion

### Detection

How to spot this issue:
- String concatenation (`+`) or `fmt.Sprintf` inside `db.Raw()`, `db.Where()`, `db.Exec()`
- Direct interpolation of variables into SQL string literals
- `fmt.Sprintf("SELECT ... WHERE name = '%s'", name)` passed to any GORM method

### Incorrect (Anti-Pattern)

```go
// ❌ BAD - SQL injection via string concatenation
func (r *UserRepository) FindByName(name string) (*User, error) {
    var user User
    db.Raw("SELECT * FROM users WHERE name = '" + name + "'").Scan(&user)
    return &user, nil
}

// ❌ BAD - fmt.Sprintf is equally dangerous
func (r *UserRepository) Search(query string) ([]User, error) {
    var users []User
    sql := fmt.Sprintf("SELECT * FROM users WHERE email ILIKE '%%%s%%'", query)
    db.Raw(sql).Scan(&users)
    return users, nil
}

// ❌ BAD - Also vulnerable in Where clause
db.Where("status = '" + status + "'").Find(&orders)
```

**Why this is wrong**:
- Attacker input `' OR '1'='1` bypasses all filters
- Input `'; DROP TABLE users; --` destroys data
- No escaping mechanism prevents all attack vectors

### Correct (Best Practice)

```go
// ✅ GOOD - Parameterized with ? placeholder
func (r *UserRepository) FindByName(name string) (*User, error) {
    var user User
    if err := db.Raw("SELECT * FROM users WHERE name = ?", name).Scan(&user).Error; err != nil {
        return nil, fmt.Errorf("FindByName: %w", err)
    }
    return &user, nil
}

// ✅ GOOD - ILIKE search with parameterized placeholder
func (r *UserRepository) Search(query string) ([]User, error) {
    var users []User
    searchTerm := "%" + query + "%"  // Safe: concatenation on Go side, not SQL side
    if err := db.Raw("SELECT * FROM users WHERE email ILIKE ?", searchTerm).Scan(&users).Error; err != nil {
        return nil, fmt.Errorf("Search: %w", err)
    }
    return users, nil
}

// ✅ GOOD - Named args for complex queries
db.Raw("SELECT * FROM users WHERE name = @name AND status = @status",
    sql.Named("name", name),
    sql.Named("status", status),
).Scan(&users)

// ✅ GOOD - GORM ORM methods are safe by default
db.Where("status = ?", status).Find(&orders)
```

**Why this is better**:
- Database driver handles escaping at the protocol level
- No user input ever touches the SQL structure
- Named args improve readability in complex queries

### Additional Context

- The `?` placeholder is GORM-specific — it gets converted to `$1, $2` for PostgreSQL internally
- Do **not** use `$1` syntax directly in `db.Raw()` with GORM — use `?` (see `critical-placeholder-style.md`)
- String concatenation on the **Go side** for building the search term (e.g., `"%" + query + "%"`) is safe because it only affects the parameter value, not the SQL structure

### References

- [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html)
- [GORM Docs: Raw SQL](https://gorm.io/docs/sql_builder.html)
- [GORM Docs: Query](https://gorm.io/docs/query.html)

---

**Rule Version**: 1.0
**Last Updated**: 2026-03-13
**Priority**: CRITICAL
**Auto-fixable**: Partially (replace string concat with `?` placeholder)
