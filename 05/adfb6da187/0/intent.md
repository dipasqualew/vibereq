# Archive Reviews When a New One Is Started

When `vibx review` is run on a PR, previous Vibereq reviews should be archived — their comment threads resolved and their review body collapsed — so that the PR remains readable and only the latest review is prominently visible.

## Requirements

* When a new `vibx review` is submitted, all previous Vibereq reviews on the same PR must have their main review body collapsed using a GitHub Flavoured Markdown `<details>`/`<summary>` HTML block
* The summary text must read: `[review superseded by <link to new review>]`, linking directly to the newly submitted review
* The original review body must be preserved inside the `<details>` element (not deleted)
* All unresolved comment threads belonging to previous Vibereq reviews must be resolved automatically
* Only Vibereq reviews (identified by the `# Vibereq Review` header) should be targeted — other PR reviews must not be touched
* Already-archived reviews (those whose body already contains `<details>`) must not be archived again
* The archiving must happen after the new review is successfully submitted, using the new review's URL for the link
* In dry-run mode, archiving must be skipped but a message must be printed indicating it would have archived previous reviews

## Drift

The implementation closely follows the issue requirements. The assistant correctly implemented the core mechanic — collapsing old reviews into `<details>`/`<summary>` blocks with a link to the new review, resolving previous unresolved threads, and skipping already-archived reviews. The dry-run path prints a placeholder message as expected.

One minor gap: thread resolution is scoped to threads belonging to previous Vibereq reviews (via `filterReviewIds`), which is a reasonable and defensive interpretation, but the issue does not explicitly scope resolution to Vibereq-owned threads — it says "resolve all the comments from previous reviews", which could be read more broadly. The issue also does not specify that thread resolution should be filtered at all, though the implementation's conservative approach is sensible. No significant unimplemented requirements were found.
