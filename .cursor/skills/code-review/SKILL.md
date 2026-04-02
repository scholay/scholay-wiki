---
name: code-review
description: Structured code review workflow for comparing branches. Fetches diffs, evaluates against 14 quality criteria, and produces prioritised issues grouped by severity. Use when the user says "Review '[branch1]' against '[branch2]'" or asks for a code review between branches.
---

# Code Review

## Purpose

Code reviews catch more than bugs - they enforce consistency, surface architectural
drift, and share knowledge across the team. This skill runs a structured review
workflow that evaluates diffs against 14 quality criteria and produces a prioritised,
actionable report.

## When To Activate

Trigger when the user provides a prompt matching:
- "Review '[branch1]' against '[branch2]'"
- "Code review [branch] vs [branch]"
- "Review this PR" (infer branches from context)

Do NOT trigger for:
- Reviewing a single file (just read and comment)
- Asking general questions about code quality
- Linting or formatting requests

## Instructions

### Step 0: High-Level Summary

In 2-3 sentences, describe:
- **Product impact**: What does this change deliver for users or customers?
- **Engineering approach**: Key patterns, frameworks, or best practices in use.

### Step 1: Fetch and Scope the Diff

- Run `git fetch origin` and check out the remote branches (`origin/<branch1>`, `origin/<branch2>`) to ensure the latest code.
- Compute `git diff --name-only --diff-filter=M origin/<branch2>...origin/<branch1>` to list only modified files.
- For each file, run `git diff --quiet origin/<branch2>...origin/<branch1> -- <file>`; skip any file that produces no actual diff hunks.

### Step 2: Evaluate Each Change

For each truly changed file and each diffed hunk, evaluate in the context of the existing codebase. Understand how modified code interacts with surrounding logic - how inputs are derived, how return values are consumed, whether the change introduces side effects or breaks assumptions elsewhere.

Assess each change against these criteria:

| Criterion | What to check |
|---|---|
| **Design & Architecture** | Fits system patterns, avoids coupling, clear separation of concerns, respects module boundaries |
| **Complexity & Maintainability** | Flat control flow, low cyclomatic complexity, DRY, no dead code, dense logic extracted to helpers |
| **Functionality & Correctness** | Correct under valid/invalid inputs, edge cases covered, idempotent where needed, robust error handling |
| **Readability & Naming** | Identifiers convey intent, comments explain *why* not *what*, logical ordering, no hidden side effects |
| **Best Practices & Patterns** | Language/framework idioms, SOLID principles, resource cleanup, consistent logging, layered responsibilities |
| **Test Coverage & Quality** | Success + failure paths, integration tests, meaningful assertions, edge cases, descriptive test names |
| **Standardization & Style** | Style guide conformance, consistent structure, zero new linter/formatter warnings |
| **Documentation** | Public API docs, updated README/CHANGELOG/Swagger for visible changes |
| **Security & Compliance** | Input validation, output encoding, secure error handling, dependency checks, secrets management, authZ/authN |
| **Performance & Scalability** | No N+1 queries, memory management, hot-path efficiency, caching/batching opportunities |
| **Observability & Logging** | Metrics/tracing for key events, appropriate log levels, sensitive data redacted, contextual info included |
| **Accessibility & i18n** | Semantic HTML, ARIA attributes, keyboard navigation, colour contrast, externalised strings (UI code only) |
| **CI/CD & DevOps** | Pipeline integrity, infra-as-code correctness, deployment/rollback strategy |
| **AI-Assisted Code** | Alignment with conventions, no hidden dependencies, tests and docs included, consistent style |

### Step 3: Report Issues

For each validated issue, output:

```
- File: `<path>:<line-range>`
  - Issue: [One-line summary of the root problem]
  - Fix: [Concise suggested change or code snippet]
```

### Step 4: Prioritised Issues

Present all issues grouped by severity:

```
## Prioritised Issues

### Critical
- …

### Major
- …

### Minor
- …

### Enhancement
- …
```

No extra prose between severity groups.

### Step 5: Highlights

After the prioritised issues, include a brief bulleted list of positive findings or well-implemented patterns observed in the diff.

### Step 6: Write Review to File

Write the complete review (Steps 0-5) to a markdown file in the project root:

```
code-review-<branch1>-vs-<branch2>.md
```

Sanitise branch names for the filename (replace `/` with `-`). For example, reviewing `feature/payments` against `develop` produces `code-review-feature-payments-vs-develop.md`.

The file should be self-contained — include the branch names, date, and all sections so it can be shared outside of Cursor (attached to PRs, tickets, etc.).

## NEVER

- Skip fetching the latest code before reviewing
- Report issues on files with no actual content changes
- Generate generic feedback ("looks good" without specifics)
- Mix severity levels within a group
- Omit the fix suggestion for a reported issue
- Skip writing the review to a file

## ALWAYS

- Verify each file has real diff hunks before reviewing
- Evaluate changes in context of the surrounding codebase
- Include both the problem and a concrete fix for every issue
- Maintain a polite, professional tone
- Keep comments brief without losing clarity
- Surface positive findings alongside issues
