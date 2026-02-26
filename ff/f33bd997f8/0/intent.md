# CI Review Pipeline with GitHub PR Integration

The lead engineer wants to build a CI pipeline script that runs reviewer skills, parses their JSON output, and posts structured comments back to the GitHub PR — both as inline diff comments and as a consolidated top-level PR comment. A default `/code-review` skill was also requested as a concrete starting point.

## Requirements

* The script spawns `claude -p "/<skill> ci"` and captures its JSON output
* The JSON schema must be updated to support structured location data (file, line, endLine) rather than a freeform evidence string — breaking changes are acceptable
* Findings with a valid file/line location are posted as inline diff comments on the PR
* Findings without a location are aggregated into a top-level PR comment beginning with `# Vibereq Review`
* Each reviewer occupies a distinct `## [reviewer-name]` section within the shared PR comment
* Subsequent runs update the existing `# Vibereq Review` comment rather than creating a new one
* The script must work both locally (via `gh pr view`) and in GitHub Actions (via env vars), detecting the relevant PR automatically
* The script is written in Python (no build/install setup required)
* A default `/code-review` skill is created following the format established by `/create-reviewer`
* The script does not fail on severity levels — its only job is producing and posting the review

## Drift

The assistant's implementation closely follows the user's intent. All five clarifying questions were answered before any code was written, and the answers were respected: Python was used, the JSON schema was updated with a structured `location` object (a genuine breaking change), the PR comment is updated in place, exit codes are not severity-gated, and reviewer sections are separated with `## [reviewer-name]`. The `/code-review` skill was created without requiring further input.

Two minor additions beyond what was explicitly requested — a `--dry-run` flag and a `--base` flag — are reasonable ergonomic choices that do not change behavior by default and align with the spirit of the work. The implementation does not over-engineer or contradict any stated requirement.
