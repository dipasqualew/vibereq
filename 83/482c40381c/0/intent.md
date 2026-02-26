# PR Workflow Automation: `/vibx-pr` and `/vibx-address-pr` Commands

The user provided a detailed, pre-approved implementation plan to reduce an 8-step manual PR workflow to 2 CLI commands and corresponding Claude Code skills. The assistant explored the codebase, implemented all planned files, verified the build, and confirmed basic command functionality via dry runs.

## Requirements

* `vibx pr` command must: detect and commit uncommitted changes with an AI-generated conventional commit message, generate intents, push the branch with upstream tracking, create a PR via `gh pr create --fill` if none exists, and invoke the code review skill
* `vibx address-pr` command must: fetch unresolved PR review threads with full comment details (body, author, createdAt), retrieve the current diff, and format everything with agent exploration instructions
* Commit message generation must use staged diff (not branch diff) piped to Claude Haiku as a fallback-safe operation
* Four skill files must be created in `plugins/vibereq/skills/` with correct `allowed-tools` declarations
* All new types (`PrOptions`, `PrResult`, `ThreadComment`, `ReviewThreadDetail`, `AddressPrResult`) must be added to `types.ts`
* `apps/cli/src/lib/git.ts` must export: `hasUncommittedChanges`, `stageAllChanges`, `createCommit`, `getCurrentBranch`, `hasRemoteTracking`, `pushWithUpstream`, `getDiff`, `getStagedDiff`
* `apps/cli/src/lib/github.ts` must export an enhanced `getUnresolvedReviewThreads` returning comment-level detail, plus `createPR` and `getPRUrl`
* Both commands must be registered in `apps/cli/src/index.ts`
* `npm run build` must pass without errors
* Unit tests (`npm test`) must pass

## Drift

The assistant faithfully implemented all planned files and modifications, and the summary matches the plan's structure closely. One small proactive fix was applied (staged diff instead of branch diff for commit message generation), which was a correctness improvement within the spec's intent.

However, two verification steps from the plan were skipped without acknowledgment: unit tests (`npm test`) were never run, and the skill invocations (`/vibx-pr`, `/vibx-address-pr`) inside Claude Code were not tested. The assistant's verification was limited to `--help` output, a `--dry-run --skip-review` flag run, and a live `address-pr --pr 5` call. This leaves confidence in test coverage and skill integration partially unconfirmed.
