---
name: vibx-pr
description: Commit, generate intent, push, create PR, and run review in one command
context: fork
agent: general-purpose
allowed-tools:
  - Bash(vibx pr *)
---

# Create PR Workflow

This skill automates the PR creation workflow:

1. **Commit** - Stages all changes and creates a commit with an AI-generated message
2. **Intent** - Generates intent files from checkpoint transcripts
3. **Push** - Pushes the branch to origin with upstream tracking
4. **Create PR** - Creates a PR using `gh pr create --fill`
5. **Review** - Runs the vibereq:code-review skill and posts findings

## Usage

Run the command:

```bash
vibx pr
```

### Options

- `--dry-run` - Print what would happen without making changes
- `--skip-review` - Skip running the code review
- `--base <branch>` - Base branch for diff comparison (default: main)

## What to Expect

The command will output progress as it runs each step. When complete, it will print the PR URL.

If any step fails, the command will continue with remaining steps where possible and report errors at the end.
