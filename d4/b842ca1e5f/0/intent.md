# Logging and OpenTelemetry Setup for vibx CLI

The leading engineer provided a detailed, pre-approved implementation plan for adding structured Winston JSONL logging and OpenTelemetry file-based tracing to the vibx CLI, with dependency injection via yargs middleware. The assistant implemented the plan end-to-end, making one intentional architectural simplification.

## Requirements

* Winston JSONL logging writes structured output to `/tmp/vibx/{branch}/logs/vibx-{timestamp}.jsonl`
* OpenTelemetry traces write JSONL span data to `/tmp/vibx/{branch}/traces/trace-{timestamp}.jsonl`
* Git branch name is sanitized (replace `/\:*?"<>|` with `-`) before use as a filesystem path segment
* A custom `FileSpanExporter` class handles JSONL span output (no OTLP collector required)
* `AppContext` interface (logger, tracer, branch) is created as a dependency injection container
* Context is injected into command handlers via a yargs middleware
* `console.log` is preserved for intentional CLI output; `console.error`/debug calls in command and lib files are replaced with logger calls
* Spans are added around: claude subprocess calls (review, intent, get-intents), GitHub API calls (getCurrentPR, getDiffLines, submitReview)
* `shutdownObservability()` ensures graceful trace flushing on process exit
* Build (`bun run build`) succeeds with no TypeScript errors
* All existing and new tests pass (`bun run test`)

## Drift

Drift is minimal. The assistant followed the plan faithfully across all specified files and design decisions, with two notable deviations:

1. **`@opentelemetry/sdk-node` was dropped** — The plan listed it as a dependency, but the assistant encountered a hanging issue during implementation (likely caused by NodeSDK auto-instrumentation side effects) and intentionally replaced it with the lighter `@opentelemetry/sdk-trace-base` setup. This was a legitimate technical judgment call, not an oversight, and the outcome (working file-based traces) satisfies the original intent.

2. **`withSpan()` helper was added** — The plan did not specify this utility, but the assistant introduced it as a convenience wrapper around async span execution. This is a small, additive deviation that improves the ergonomics of the spans required by the plan without contradicting any stated requirement.
