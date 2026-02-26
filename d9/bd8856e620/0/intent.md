# Refactor Python Scripts to TypeScript CLI (vibx)

The leading engineer provided a detailed plan to replace four Python scripts in the `vibereq` plugin with a compiled TypeScript CLI (`vibx`) using a bun monorepo structure, then provided two targeted UX fixes after seeing the initial output.

## Requirements

* Set up a bun workspace monorepo with an `apps/cli` package
* Implement a `vibx` CLI binary using yargs with four subcommands: `get-checkpoint-folders`, `get-intents`, `intent`, and `run-review <skill>`
* Convert all four Python scripts to TypeScript, preserving equivalent behavior
* Organize code into `src/lib/` (git, transcript, github wrappers) and `src/commands/` (one file per subcommand)
* Write unit tests with vitest for at least the library modules
* Compile to a single binary via `bun build --compile`
* Update `.claude/skills/code-review/SKILL.md` and `.claude/skills/create-reviewer/SKILL.md` to invoke `vibx get-intents` instead of the Python script
* Delete the original Python scripts
* The CLI help output must display `vibx` as the program name (not `bun`)
* Provide a `symlink` script that builds the binary and symlinks it to `~/.local/bin/vibx` when on `main`, or to `~/.local/bin/vibx-dev` on any other branch

## Drift

Drift was minimal. The assistant faithfully implemented all phases of the plan and promptly addressed both pieces of post-implementation feedback. The only notable omissions relative to the plan are:

- **Command-level unit tests** (`tests/commands/*.test.ts`) were called out in the testing strategy but are not mentioned in the final summary; only `git.test.ts` and `transcript.test.ts` are confirmed.
- The plan described a `bun link` step for installation; the assistant instead installed directly to `~/.local/bin/vibx` via a `link` script, which is functionally equivalent but a different mechanism than `bun link`.
- A root-level `package.json` with `build/test/link` scripts was added, which was implied but not explicitly specified in the plan — a reasonable addition.

The second-round feedback on `$0` and the `symlink` script was implemented exactly as requested.
