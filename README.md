# vibereq

Collect requirements from your agent sessions, use them for code reviews.

## Installation

Add this marketplace to Claude Code:

```shell
/plugin marketplace add dipasqualew/vibereq-setup-workspace
```

Then install the vibereq plugin:

```shell
/plugin install vibereq@vibereq-marketplace
```

## Skills

### /vibereq:review-checkpoints

Reviews your current branch changes against captured requirements from checkpoint transcripts.

### /vibereq:extract-intent

Extracts requirements and intent from checkpoint conversation transcripts. Analyzes what the user wanted to achieve and commits structured intent files to the checkpoint branch.

## How It Works

1. When you work with Entire checkpoints, conversation transcripts are saved
2. `/vibereq:extract-intent` analyzes those transcripts to extract user requirements
3. `/vibereq:review-checkpoints` compares your code changes against those requirements
