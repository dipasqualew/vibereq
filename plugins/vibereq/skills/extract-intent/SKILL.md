---
name: extract-intent
description: Extract requirements/intent from checkpoint transcripts and commit to checkpoint branch
---

# Extract Intent from Checkpoints

Run the intent extraction script to analyze conversation transcripts from checkpoints on the current branch.

This will:
1. Find all commits on the current branch that aren't in main
2. Look for Entire-Checkpoint trailers in those commits
3. Fetch the conversation transcripts from the checkpoint branch
4. Use Claude to analyze user intent and requirements
5. Commit the resulting intent.md files back to the checkpoint branch

!`python3 ${CLAUDE_PLUGIN_ROOT}/scripts/intent.py`
