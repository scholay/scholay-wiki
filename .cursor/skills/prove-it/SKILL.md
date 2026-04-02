---
name: prove-it
description: Before declaring any task complete, actually verify the outcome. Run the code. Test the fix. Check the output. AI-generated code optimizes for plausible-looking output, not verified-correct output. Use when completing code changes, bug fixes, or any task where correctness matters.
---

# Prove It

## Purpose

AI-generated code comes from pattern-matching on training data. Something can look
syntactically perfect, follow best practices, and still be wrong. The model
optimizes for "looks right" not "works right." Verification is a separate
cognitive step that must be explicitly triggered. This skill closes the loop
between implementation and proof.

## Why This Matters (Technical Reality)

Limitations this skill addresses:

**1. Generation vs Execution**
Code is generated but not run during generation. Confidence comes from "this
looks like working code" not from "this was executed and the result observed."

**2. Pattern-Matching Blindness**
Code that matches common patterns feels correct. But subtle bugs hide in the
gaps between patterns. Off-by-one errors. Wrong variable names. Missing edge
cases. These "look right" but aren't.

**3. Confidence-Correctness Gap**
High confidence in output doesn't correlate with actual correctness.
The agent is often most confident when most wrong, because the wrong answer
pattern-matched strongly.

**4. No Feedback Loop**
Code is generated sequentially. There's no natural "go back and check" step.
Without explicit verification, errors compound silently.

## When To Verify

ALWAYS verify before declaring complete:

**Code Changes:**
- New functions or modules
- Bug fixes
- Refactoring
- Configuration changes
- Build/deploy scripts

**Fixes:**
- "Fixed the bug" - did you reproduce and confirm it's gone?
- "Resolved the error" - did you trigger the error path again?
- "Updated the config" - did you restart and test?

**Claims:**
- Factual statements that matter to the decision
- "This will work because..." - did you prove it?
- "The file contains..." - did you actually read it?

## Instructions

### Step 1: Catch The Victory Lap

Before saying any of these:
- "Done!"
- "That should work"
- "I've implemented..."
- "The fix is..."
- "Complete"

STOP. You haven't verified yet.

### Step 2: Determine Verification Method

| Change Type | Verification |
|-------------|--------------|
| New code | Run it with test input |
| Bug fix | Reproduce original bug, confirm fixed |
| Function change | Call the function, check output |
| Config change | Restart service, test affected feature |
| Build script | Run the build |
| API endpoint | Make a request |
| UI change | Describe what user should see, or screenshot |

### Step 3: Actually Verify

```bash
# Don't just write the test - run it
python -m pytest tests/test_new_feature.py

# Don't just fix the code - prove the fix
python -c "from module import func; print(func(edge_case))"

# Don't just update config - verify it loads
node -e "console.log(require('./config.js'))"
```

### Step 4: Report With Evidence

```
Verified:

What I changed:
  - Added input validation to user_signup()

How I verified:
  - Ran: python -c "from auth import user_signup; user_signup('')"
  - Expected: ValidationError
  - Got: ValidationError("Email required")

Proof that it works. Done.
```

## Verification Patterns

### Pattern 1: The Smoke Test

Minimal test that proves basic functionality:

```bash
# After writing a new function
python -c "from new_module import new_func; print(new_func('test'))"
```

If this crashes, you're not done.

### Pattern 2: The Regression Check

After fixing a bug, trigger the original failure:

```bash
# Bug was: crash on empty input
python -c "from module import func; func('')"
# Should not crash anymore
```

### Pattern 3: The Build Gate

Before claiming code is complete:

```bash
# Does it at least compile/parse?
python -m py_compile new_file.py
npm run build
cargo check
```

### Pattern 4: The Integration Smell Test

After changes that affect multiple components:

```bash
# Start the service
npm run dev &

# Hit the affected endpoint
curl http://localhost:3000/affected-route

# Check for expected response
```

## The Verification Checklist

Before declaring done:

```
[ ] Code runs without syntax errors
[ ] Function produces expected output on happy path
[ ] Edge case handled (empty, null, boundary)
[ ] Original bug/issue no longer reproduces
[ ] No new errors introduced (check logs)
[ ] Build passes (if applicable)
```

## NEVER

- Say "done" without running the code
- Assume it works because it looks right
- Skip verification because you're confident
- Claim a bug is fixed without reproducing it first
- Trust that generated code is correct
- Let pattern-matching substitute for proof

## ALWAYS

- Run new code at least once
- Test the specific thing that was broken
- Show verification output in your response
- Admit when you can't verify (and say why)
- Treat verification as required, not optional

## Examples

### Example 1: Bad (No Verification)

```
User: "Fix the divide by zero error"

*edits code to add check*

Done! Added a check for zero before dividing. The function now returns
None if the divisor is zero.
```

This is unverified. The code was never run.

### Example 1: Good (With Verification)

```
User: "Fix the divide by zero error"

*edits code to add check*

Let me verify the fix:

$ python -c "from math_utils import safe_divide; print(safe_divide(10, 0))"
None

$ python -c "from math_utils import safe_divide; print(safe_divide(10, 2))"
5.0

Verified:
- Division by zero returns None (was: crashed)
- Normal division still works
- Fix confirmed.
```

### Example 2: Admitting Inability To Verify

```
User: "Update the production config"

I've updated config/production.json with the new API endpoint.

Verification status: UNABLE TO VERIFY
- This is production config
- I can't safely test against production
- Recommend: Test in staging first, or have ops verify after deploy

Change is made but unverified. Proceed with caution.
```

## The Hard Truth

When "Done!" is said without verifying, it's not reporting a fact. It's making a
prediction based on pattern-matching. Sometimes that prediction is wrong.

Verification converts prediction into observation. It's the difference between
"this should work" and "this works."

One is a guess. One is proof.

Prove it.
