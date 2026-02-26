# Session Context

## User Prompts

### Prompt 1

Feedback:

⚠️ Script works locally (via gh pr view) and in GitHub Actions (via env vars)
Status: 🟡 partial

The GitHub Actions path reads GITHUB_REF_NAME and splits on '/'. For a pull_request event, GITHUB_REF_NAME is set to 'refs/pull/{number}/merge' — splitting on '/' gives ['refs', 'pull', '{number}', 'merge']. Taking index [0] yields 'refs', which is not a digit, so the env-var path always falls through to the gh CLI path. The correct env var to use is GITHUB_REF (same value) with index [...

