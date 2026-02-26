---
name: vibx-address-pr
description: Fetch unresolved PR comments and explore codebase to address them
context: fork
agent: general-purpose
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(vibx address-pr *)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git show *)
---

# Address PR Comments

This skill helps you address unresolved PR review comments by:

1. Fetching all unresolved comment threads from the PR
2. Showing the current diff for context
3. Providing exploration instructions

## Usage

First, run the command to fetch unresolved comments:

```bash
vibx address-pr
```

### Options

- `--pr <number>` - PR number (auto-detected if not specified)
- `--base <branch>` - Base branch for diff comparison (default: main)

## Workflow

After running the command, you will see:

1. **Unresolved Comments** - Each comment thread with file path, line number, author, and body
2. **Current Diff** - The full diff between base and HEAD
3. **Instructions** - How to explore and address each comment

For each comment:

1. Read the mentioned file to understand the context
2. Use Grep/Glob to find related code if needed
3. Make the necessary code changes
4. Explain what you changed and why

## Example

```bash
# Fetch comments for current branch's PR
vibx address-pr

# Fetch comments for specific PR
vibx address-pr --pr 42
```
