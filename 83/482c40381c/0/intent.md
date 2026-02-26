# Streamlined PR Workflow CLI Commands

The user provided a complete, detailed implementation plan for two new CLI commands (`vibx pr` and `vibx address-pr`) to reduce a manual 8-step PR workflow to 2 steps, and instructed the assistant to implement it verbatim. The assistant implemented all specified files and modifications, verified the build, and confirmed basic command functionality.

## Requirements

* `vibx pr` command must: detect uncommitted changes, generate an AI-powered conventional commit message from staged diff (using Claude Haiku), stage and commit, generate intents via `processIntents()`, push branch with upstream tracking, create a PR via `gh pr create --fill` if one doesn't exist, and invoke the `vibereq:code-review` skill
* `vibx address-pr` command must: fetch unresolved review threads with full comment details (body, author, createdAt) via enhanced GraphQL, retrieve the current branch diff against main, and output a structured prompt with comments, diff, and agent exploration instructions
* `plugins/vibereq/skills/vibx-pr/SKILL.md` must exist and invoke `vibx pr` with `Bash(vibx pr *)` as the only allowed tool
* `plugins/vibereq/skills/vibx-address-pr/SKILL.md` must exist, invoke `vibx address-pr`, and permit Read, Grep, Glob, and relevant Bash tools for exploration
* `apps/cli/src/lib/git.ts` must export: `hasUncommittedChanges()`, `stageAllChanges()`, `createCommit()`, `pushWithUpstream()`, `hasRemoteTracking()`, `getDiff()`, `getStagedDiff()`
* `apps/cli/src/lib/github.ts` must export enhanced `getUnresolvedReviewThreads()` returning threads with nested comment details, plus `createPR()` and `getPRUrl()`
* `apps/cli/src/types.ts` must define `PrOptions`, `PrResult`, `ThreadComment`, `ReviewThreadDetail`, `AddressPrResult`
* `apps/cli/src/index.ts` must register both `pr` and `address-pr` commands
* `npm run build` in `apps/cli` must succeed
* Both commands must respond to `--help`
* Commit message generation must fall back gracefully if Claude fails
* PR creation must be idempotent (reuse existing PR rather than failing)
* Review failure must not block returning the PR URL

## Drift

Drift was minimal. The assistant followed the plan faithfully across all specified files and modifications. One proactive correction was made beyond the plan: the commit message generation was initially reading the wrong diff (branch diff instead of staged diff), and the assistant self-identified and fixed this. This was a legitimate bug fix, not scope creep.

The verification steps from the plan were only partially executed. The plan called for four verification steps — build, `vibx pr` end-to-end test (including actual commit and review posting), `vibx address-pr` with a real unresolved comment, and skill invocation inside Claude Code — but the assistant only confirmed `--help` output, a `--dry-run --skip-review` run, and a `--pr 5` fetch against an existing PR. Full end-to-end functional verification and unit test execution (`npm test`) were not performed. The plan explicitly listed unit tests as a verification step, and no mention of running or writing tests appears in the assistant's output.
