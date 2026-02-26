---
name: create-reviewer
description: Create a specialized reviewer skill that checks code against requirements or standards
---

# Create a Specialized Reviewer Skill

You are helping the user create a custom reviewer skill. Reviewers are skills that analyze code changes against requirements, standards, or other criteria.

## Vibereq Scripts

The vibx CLI command to fetch intent files (auto-generates missing intents from transcripts):

```
vibx get-intents
```

Use this command in the generated skill's `!` directive:
```
!`vibx get-intents`
```

## How Reviewers Work

Reviewers created by this skill will:
- Read requirements from intent files (checkpoint transcripts) and/or external standards
- Analyze the current branch diff against those requirements
- Output findings in markdown (default) or JSON (when invoked with `ci` argument)

The generated skill will be saved to `.claude/skills/[name]/SKILL.md` in the current project.

## Gathering Requirements

Use AskUserQuestion to batch questions together (the tool supports 1-4 questions per call). Minimize round-trips by grouping related questions.

### Round 1: Core Configuration (batch these 4 questions)

**Question 1 - Reviewer Name:**
- Question: "What should this reviewer be called?"
- Header: "Name"
- Options: `code-review`, `security-review`, `qa-review`, `accessibility-review`
- The name will be used as the skill name and folder name.

**Question 2 - Reviewer Focus (single-select):**
- Question: "What should this reviewer focus on?"
- Header: "Focus"
- Options:
  - **Code Review** - Verify implementation matches requirements from intent files
  - **Security** - Check for vulnerabilities (OWASP Top 10, injection, auth issues)
  - **QA/Usability** - Validate user-facing behavior with browser automation
  - **Accessibility** - Check WCAG 2.1 compliance

**Question 3 - Source of Truth (multi-select):**
- Question: "What should the reviewer check against?"
- Header: "Sources"
- multiSelect: true
- Options:
  - **Intent files** - Requirements extracted from checkpoint transcripts
  - **Project documentation** - README, docs/, ARCHITECTURE.md
  - **OWASP Top 10** - Security vulnerability categories
  - **Custom document** - User provides a path

**Question 4 - Verification Method:**
- Question: "How should the reviewer verify compliance?"
- Header: "Method"
- Options:
  - **Static analysis** - Read-only analysis of diff and code (fast, no side effects)
  - **Active verification** - Run tools like playwright, security scanners

### Round 2: Follow-up Details (only if needed)

If "Custom document" was selected in Sources, OR if "Active verification" was selected, ask follow-up questions in a second batch.

**If Custom document selected:**
- "What is the path to your standards document?"

**If Active verification selected (based on focus):**

For QA/Usability:
- "What command spawns your browser automation?" (e.g., `npx playwright test`)
- "What is the base URL?" (e.g., `http://localhost:3000`)

For Security:
- "What security scanning command should be used?" (e.g., `npm audit`, `semgrep .`)

For other focuses:
- "What command should be run for active verification?"

### Round 3: Confirmation

Present a summary of the inferred configuration and ask the user to confirm:
- Skill name and path: `.claude/skills/{name}/SKILL.md`
- Allowed tools (inferred from focus and verification method)
- Model: `claude-sonnet-4-6`

Use a single question: "Does this configuration look correct?" with options Yes / Adjust.

## Allowed Tools Inference

Based on user choices, infer allowed-tools:

| Focus | Static Tools | Active Tools |
|-------|--------------|--------------|
| Code Review | Read, Grep, Glob, Bash(vibx *), Bash(git diff *) | - |
| Security | Read, Grep, Glob, Bash(git diff *) | Bash(npm audit *), Bash(semgrep *) |
| QA/Usability | Read, Grep, Glob | Bash(npx playwright *), Bash(npm run *) |
| Accessibility | Read, Grep, Glob, Bash(git diff *) | Bash(npx pa11y *), Bash(npx axe *) |
| Performance | Read, Grep, Glob, Bash(git diff *) | Bash(npm run bench *) |
| Test Coverage | Read, Grep, Glob | Bash(npm test *), Bash(npx jest *) |

## Generated Skill Template

Once you have all information, generate a SKILL.md file with this structure:

```markdown
---
name: {reviewer-name}
description: {description based on focus}
context: fork
agent: general-purpose
model: {model}
allowed-tools: {inferred tools}
args:
  - name: mode
    description: Output mode - 'ci' for JSON output
    required: false
---

# {Title} Review

## Requirements

{If intent files selected:}
The following requirements were captured from checkpoint intent files:

\!`vibx get-intents`

{If external standards selected, include reference:}
Additionally, check against: {standards references}

{If custom document selected:}
Project standards from `{custom-path}`:

\!`cat {custom-path} 2>/dev/null || echo "Standards document not found"`

## Current Changes

\!`git --no-pager diff main...HEAD`

## Your Task

{Instructions specific to the focus area}

### Output Format

Check the `mode` argument:

**If `mode` is "ci":**

CRITICAL: Your entire response must be ONLY the raw JSON object below. Do not include:
- Any text before the JSON (no "Based on my analysis...", "Here is the output:", etc.)
- Any text after the JSON
- Markdown code fences (\`\`\`json or \`\`\`)
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
```

## Focus-Specific Instructions

Include these task instructions based on the focus:

**Code Review:**
```
For each requirement from the intent files:
1. **Status**: Fulfilled, Partially Fulfilled, or Missing
2. **Evidence**: Reference specific code changes that address the requirement
3. **Issues**: Any problems, bugs, or deviations from the requirement
4. **Recommendations**: Concrete fixes for identified issues

Also identify:
- Code that doesn't map to a stated requirement (scope creep)
- Potential bugs or edge cases not handled
- Code quality concerns (error handling, type safety)
```

**Security:**
```
Check for OWASP Top 10 vulnerabilities in the diff:
1. Injection (SQL, command, XSS)
2. Broken authentication/session management
3. Sensitive data exposure (secrets, credentials, PII)
4. Security misconfiguration
5. Insecure dependencies

For each finding:
- Severity: critical, major, minor, info
- Location: exact file:line
- Issue: what the vulnerability is
- Fix: concrete remediation steps
```

**QA/Usability:**
```
{Include user-provided commands here}

Test the application against the requirements:
1. Start the application: {setup command}
2. Navigate to: {base URL}
3. For each requirement, attempt to verify it works from a user perspective
4. Document: what worked, what failed, screenshots if possible

Focus on:
- Happy path functionality
- Error states and edge cases
- User experience issues
```

**Accessibility:**
```
Check WCAG 2.1 compliance:
- Level A (must fix): Missing alt text, keyboard traps, missing labels
- Level AA (should fix): Color contrast, focus indicators, error identification
- Level AAA (nice to have): Sign language, extended audio description

For UI changes in the diff, verify:
- Semantic HTML usage
- ARIA attributes where needed
- Keyboard navigability
- Screen reader compatibility
```

**Performance:**
```
Analyze the diff for performance concerns:
- Algorithm complexity (O(n²) loops, unnecessary iterations)
- Database queries (N+1 problems, missing indexes)
- Memory usage (large allocations, leaks)
- Bundle size impact (large imports, tree-shaking issues)
- Caching opportunities missed

{If active verification, include profiling commands}
```

**Test Coverage:**
```
For each requirement, verify:
1. Unit tests exist that cover the functionality
2. Integration tests for cross-component behavior
3. Edge cases are tested
4. Error paths are tested

{Include test command}
Run coverage and report:
- Which requirements have test coverage
- Which requirements are missing tests
- Suggestions for test cases to add
```

## Final Steps

After generating the skill:
1. Write the SKILL.md to `.claude/skills/{name}/SKILL.md`
2. Inform the user how to use it: `/{name}` or `/{name} ci`
3. Suggest they test it on their current branch
