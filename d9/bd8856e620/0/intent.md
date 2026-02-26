# Refactor Python Scripts to TypeScript CLI (`vibx`)

The user provided a detailed implementation plan to replace 4 Python scripts with a compiled TypeScript CLI (`vibx`) in a bun monorepo, then provided two targeted feedback corrections after reviewing the output.

## Requirements

* Python scripts (`get-checkpoint-folders.py`, `intent.py`, `get-intents.py`, `run-review.py`) are deleted and replaced by TypeScript equivalents
* Bun monorepo structure created under `apps/cli/` with `src/commands/`, `src/lib/`, and `tests/`
* CLI binary (`vibx`) compiles via `bun build --compile` and installs to `~/.local/bin/vibx`
* `vibx --help` displays `vibx` as the program name (not `bun`)
* Skills `.claude/skills/code-review/SKILL.md` and `.claude/skills/create-reviewer/SKILL.md` updated to use `vibx get-intents`
* All unit tests pass (git, transcript, and command coverage)
* A `symlink` script builds the binary and symlinks to `~/.local/bin/vibx` on `main`, or `~/.local/bin/vibx-dev` on any other branch

## Drift

Drift was minimal. The assistant implemented all phases of the plan faithfully: monorepo setup, library modules (`git.ts`, `transcript.ts`, `github.ts`), all four commands, the yargs entry point, skill updates, Python script removal, and 17 passing unit tests.

The one implementation gap was that `.scriptName("vibx")` was not applied to yargs, causing help output to display `bun` instead of `vibx`. This was caught by the user post-implementation and fixed promptly.

The `symlink` script (branch-aware, building before linking) was not in the original plan and was added as a net-new feature in response to user feedback — this represents scope expansion rather than drift from the stated plan.
