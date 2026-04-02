---
name: gorm-sql-gorm-query-patterns
description: GORM ORM query pattern review. Use when reviewing or writing Go database code using GORM — covers N+1, Preload vs Joins, transactions, error checking, Save vs Updates, and context propagation. Trigger on any GORM method usage. Note: this project uses MySQL, not PostgreSQL.
license: MIT
metadata:
  author: saifoelloh
  version: "1.0.0"
  parent_skill: gorm-sql-best-practices
  sources:
    - "GORM Official Documentation (gorm.io/docs)"
    - "OWASP SQL Injection Prevention Cheat Sheet"
    - "Clean Architecture (Robert C. Martin)"
  last_updated: "2026-03-13"
---

# GORM Query Patterns

Expert-level review of GORM ORM usage in Go services. Covers correctness, safety, and idiomatic patterns. Adapted for MySQL (originally PostgreSQL — skip Postgres-specific syntax like $1 placeholders; use ? placeholders instead).

## When to Apply

Use this skill when:
- Writing or reviewing repository layer code using GORM
- Debugging unexpected query behavior (wrong results, wrong ORDER, missing data)
- Reviewing association loading (Preload, Joins)
- Auditing multi-step write operations for transaction safety

## Rule Categories

| Priority | Count | Focus |
|---|---|---|
| Critical | 3 | SQL injection, silent errors, partial writes |
| High | 5 | N+1, First vs Find, Save vs Updates, context, column selection |
| Medium | 3 | Scopes, pagination, association upserts |

## Rules Covered (11 total)

### Critical Issues (3)
- `critical-sql-injection` — Never concatenate user input into SQL strings
- `critical-error-check` — Always check `.Error` after every GORM operation
- `critical-transaction-wrap` — Wrap multi-step operations in `db.Transaction()`

### High-Impact Patterns (5)
- `high-preload-vs-joins` — Preload for loading, Joins for filtering
- `high-first-vs-find` — First for single record, Find for lists
- `high-save-vs-updates` — Use Updates with map for partial updates, not Save
- `high-with-context` — Always pass context via `db.WithContext(ctx)`
- `high-select-columns` — Select only required columns, never `SELECT *`

### Medium Improvements (3)
- `medium-scopes` — Extract reusable WHERE logic into GORM scopes
- `medium-pagination-order` — Always include ORDER BY in paginated queries
- `medium-omit-associations` — Use Omit to prevent unintended association upserts

## Trigger Phrases

- "Review this GORM query"
- "Check repository layer"
- "db.Find / db.First / db.Create / db.Where"
- "Preload / Joins"
- "GORM transaction"
- "Is this GORM code correct?"

## Related Skills

- [postgresql-syntax](../postgresql-syntax/SKILL.md) — For raw SQL correctness and Postgres-specific syntax
- [query-performance](../query-performance/SKILL.md) — For index usage and N+1 detection
- [error-handling](../error-handling/SKILL.md) — For GORM and PostgreSQL error handling patterns
- **golang-best-practices-skill** `database-repository` — Companion Go skill covering identifier quoting and select redundancy

## Output Format

```
## Critical Issues Found: X

### [Rule ID] (File: repository.go, approx. line Y)
**Issue**: Brief description
**Fix**: Suggested correction
**Example**:
```go
// Corrected code here
```

## High-Impact Patterns: X
## Medium Improvements: X
```
