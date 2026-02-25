---
name: review-checkpoints
description: Review current branch changes against checkpoint requirements
context: fork
agent: general-purpose
model: claude-sonnet-4-6
allowed-tools: Read, Grep, Glob, Bash(git diff *)
---

# Checkpoint Requirements Review

## Requirements from Intent Files

The following are the requirements captured in checkpoint intent files for commits on this branch:

!`python3 ${CLAUDE_PLUGIN_ROOT}/scripts/get-checkpoint-folders.py | xargs -I{} git --no-pager show entire/checkpoints/v1:{}/intent.md 2>/dev/null`

## Current Branch Diff

!`git --no-pager diff main...HEAD`

## Your Task

Perform a thorough code review comparing the implementation (diff above) against the requirements (intent files above).

For each requirement:
1. **Status**: Fulfilled, Partially Fulfilled, or Missing
2. **Evidence**: Reference specific code changes that address the requirement
3. **Issues**: Any problems, bugs, or deviations from the requirement
4. **Recommendations**: Concrete advice to fix identified issues

Also identify:
- Any code that doesn't map to a stated requirement (scope creep or missing intent)
- Potential bugs or edge cases not handled
- Code quality concerns (error handling, type safety, etc.)

Be specific with file paths and line references when pointing out issues.
