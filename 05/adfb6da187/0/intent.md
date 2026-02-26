# Archive Reviews on New Submission

The user requested implementation of GitHub issue #6: when a new `vibx review` is submitted, automatically archive all previous Vibereq reviews on the PR by resolving their comment threads and collapsing their main comment body in GitHub-flavored Markdown.

## Requirements

* When `vibx review` submits a new review, all previous Vibereq review comments on the PR must be identified
* All unresolved comment threads from previous reviews must be resolved
* Each previous review's main comment body must be collapsed using an HTML `<details>`/`<summary>` element
* The collapsed summary must link to the new review (e.g. `[review superseded by <a href="...">new review</a>]`)
* Already-archived reviews must not be processed again
* Dry-run mode must be respected and produce appropriate messaging
* Existing tests must continue to pass; new tests must cover the archiving logic

## Drift

Minimal drift. The assistant faithfully implemented all the core requirements from the issue: identifying previous reviews, resolving threads, and collapsing comments with a link to the new review using the HTML `<details>`/`<summary>` element as explicitly requested.

One minor note: the issue specified the collapsed label as `"> [review superseded by <link>]"`, using a blockquote-style prefix, while the assistant rendered it as `[review superseded by <a href="URL">new review</a>]` inside a `<summary>` tag — dropping the `>` blockquote prefix. This is a superficial formatting difference and the HTML `<details>` approach is a reasonable interpretation of "use the html element for GitHub Flavoured Markdown." The functional intent is preserved.
