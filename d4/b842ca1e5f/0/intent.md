# Logging and OpenTelemetry Setup for vibx CLI (Issue #3)

The leading engineer provided a detailed, fully-specified implementation plan to add structured observability (Winston JSONL logging + OpenTelemetry file-based tracing) to a CLI tool that previously relied on scattered `console.log`/`console.error` calls. The implementing engineer executed the plan and reported all tasks completed successfully.

## Requirements

* Add Winston JSONL logging with output to `/tmp/vibx/$branch/logs/vibx-{timestamp}.jsonl`
* Add OpenTelemetry tracing with a custom `FileSpanExporter` writing JSONL to `/tmp/vibx/$branch/traces/trace-{timestamp}.jsonl`
* Branch name must be sanitized (replace `/\:*?"<>|` with `-`) for filesystem safety
* Create `src/lib/observability.ts` exporting `getCurrentBranch()`, `createLogger()`, `initTracing()`, `shutdownObservability()`, and `FileSpanExporter`
* Create `src/lib/context.ts` with an `AppContext` interface and `createAppContext()` factory for dependency injection
* Update `src/index.ts` to initialize observability and inject context via yargs middleware, with a shutdown hook for graceful trace flushing
* Update all four command handlers (`review.ts`, `intent.ts`, `get-intents.ts`, `get-checkpoint-folders.ts`) to replace `console.error` with the logger and add spans around key operations
* Update `src/lib/github.ts` to add spans around `getCurrentPR`, `getDiffLines`, `submitReview`, and replace `console.error` with logger
* Preserve intentional `console.log` calls used for CLI output to users
* Build must pass (`bun run build`)
* All tests must pass (`bun run test`)
* Executing `vibx get-checkpoint-folders` must produce valid JSONL log and trace files
* Add unit tests for observability utilities

## Drift

The implementing engineer followed the plan closely. All specified files were created or modified, the correct dependency versions were used, and the output paths and branch sanitization approach matched the specification exactly. The final summary confirms 26 tests for observability, 43 tests total passing, and a successful build.

One minor deviation is notable: the plan listed `@opentelemetry/sdk-node` as a dependency, but the implementing engineer dropped it during execution ("Let me simplify the tracing setup to avoid potential issues with NodeSDK auto-instrumentation"), using only `@opentelemetry/sdk-trace-base` instead. This was a deliberate, reasoned substitution that actually resolved a hanging issue, and the functional outcome (file-based JSONL traces) was preserved — so the spirit of the requirement was met even though the specific package was not used.
