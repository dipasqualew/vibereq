# Fix GitHub Actions PR Detection and Dead Code in post_diff_comment

The leading engineer identified two bugs in a script that posts diff comments to GitHub PRs: an incorrect environment variable usage causing GitHub Actions PR detection to always fall through to the CLI path, and a dead code dict that silently dropped multi-line comment range support. The assistant acknowledged both issues and applied fixes to the relevant file.

## Requirements

* GitHub Actions PR number detection must correctly read the event payload — specifically via `GITHUB_EVENT_PATH` (or `GITHUB_REF` at index `[2]`) — rather than `GITHUB_REF_NAME.split("/")[0]`, which yields `"refs"` and is never a digit
* The `comment_data` dict in `post_diff_comment` must either be removed (documenting the single-line limitation) or actually wired into the `gh api` call so that multi-line findings supply both `start_line` and `line` parameters correctly
* When `end_line` differs from `line`, the `gh api` call must include both `start_line` (set to the first line) and `line` (set to the last line) — not hardcode a single line value

## Drift

Minimal drift. The assistant faithfully addressed both issues as described by the leading engineer:

- For PR detection, the assistant adopted `GITHUB_EVENT_PATH` (the canonical approach explicitly named in the feedback) rather than the alternative `GITHUB_REF[2]` option also mentioned — a reasonable and clearly in-scope choice.
- For the dead code, the assistant chose the more complete resolution (wiring the dict into the command) over the simpler one (removing it and documenting the limitation), which aligns with the leading engineer's recommendation to "use the dict to conditionally add flags."

No scope creep was introduced and no requirements were ignored.
