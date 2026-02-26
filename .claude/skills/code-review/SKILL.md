---
name: code-review
description: Verify implementation matches requirements from checkpoint intent files
context: fork
agent: general-purpose
model: claude-sonnet-4-6
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git show *)
args:
  - name: mode
    description: Output mode - 'ci' for JSON output
    required: false
---

# Code Review

## Requirements

The following requirements were captured from checkpoint intent files:

!`vibx get-intents`

## Current Changes

!`git --no-pager diff main...HEAD`

## Your Task

For each requirement from the intent files:
1. **Status**: Fulfilled, Partially Fulfilled, Missing, or Violation
2. **Evidence**: Reference specific code changes that address the requirement
3. **Issues**: Any problems, bugs, or deviations from the requirement
4. **Recommendations**: Concrete fixes for identified issues

Also identify:
- Code that doesn't map to a stated requirement (scope creep)
- Potential bugs or edge cases not handled
- Code quality concerns (error handling, type safety)

### Output Format

Check the `mode` argument:

**If `mode` is "ci":**

CRITICAL: Your entire response must be ONLY the raw JSON object below. Do not include:
- Any text before the JSON (no "Based on my analysis...", "Here is the output:", etc.)
- Any text after the JSON
- Markdown code fences (```json or ```)
- Any commentary or explanation

Start your response with `{` and end with `}`. Nothing else.

JSON structure:
{
  "status": "pass" | "fail" | "warn",
  "summary": "Brief one-line summary",
  "findings": [
    {
      "requirement": "What was expected",
      "status": "fulfilled" | "partial" | "missing" | "violation",
      "severity": "critical" | "major" | "minor" | "info",
      "location": {
        "file": "path/to/file.ts",
        "line": 42,
        "endLine": 45
      } | null,
      "details": "Explanation with evidence and recommendations"
    }
  ]
}

Notes on the location field:
- Set `location` to an object with `file` and `line` when the finding relates to a specific code location
- `endLine` is optional, use it for multi-line findings
- Set `location` to `null` for general findings not tied to specific code (e.g., missing functionality)
- The `file` path must be relative to the repository root
- The `line` must be within the diff range for the file (changed lines only)

**If `mode` is not "ci" (default):**

Output a human-readable markdown report with:
- Summary of findings
- Detailed analysis per requirement
- Specific file:line references for issues
- Concrete recommendations
