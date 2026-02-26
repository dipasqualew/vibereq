# CI Review Runner with GitHub PR Integration

The leading engineer wanted a Python script to orchestrate Claude-powered code reviews in CI: spawning a reviewer skill, parsing its JSON output, and posting structured comments directly to GitHub PRs — both as inline diff comments and as a consolidated top-level PR comment.

## Requirements

* The script spawns `claude -p "/<skill> ci"` and collects its JSON output
* The JSON schema must be updated to support structured location data (`file`, `line`, `endLine`) instead of a free-text `evidence` field, enabling precise diff placement
* Findings with a valid `location` must be posted as inline GitHub diff comments
* Findings without a `location` must be posted to a top-level PR comment beginning with `# Vibereq Review`
* The `# Vibereq Review` comment is updated in-place on repeated runs (not duplicated)
* Each reviewer's section within the top-level comment is separated under `## [reviewer-name]`
* PR detection must work both locally (via `gh pr view`) and in GitHub Actions (via env vars)
* The script must be in Python, requiring no setup
* A default `/code-review` skill must be created following the existing `create-reviewer` format

## Drift

The assistant largely respected the user's stated requirements. It correctly updated the JSON schema, created the Python script with PR detection for both environments, implemented the dual-comment strategy (diff vs. top-level), and created the default `/code-review` skill without asking unnecessary questions.

Minor unsolicited additions include `--dry-run`, `--pr`, and `--base` CLI flags, and GraphQL-based comment update logic. These are reasonable extensions and not contradictory to any stated requirement, but they were not requested. The user explicitly said the script should detect the relevant PR automatically — the `--pr` override flag is consistent with that intent as a fallback.

One gap worth noting: the user specified "If there is one [a `# Vibereq Review` comment], start one" — which appears to be a typo for "if there isn't one, start one." The assistant interpreted this correctly as update-or-create, consistent with the explicit answer to clarifying question #2. No material drift there.
