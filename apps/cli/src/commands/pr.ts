import type { AppContext } from "../lib/context.js";
import { withSpan } from "../lib/observability.js";
import type { PrOptions, PrResult } from "../types.js";
import {
  hasUncommittedChanges,
  stageAllChanges,
  createCommit,
  getCurrentBranch,
  hasRemoteTracking,
  pushWithUpstream,
  getStagedDiff,
} from "../lib/git.js";
import { getCurrentPR, createPR, getPRUrl } from "../lib/github.js";
import { processIntents } from "./intent.js";
import { handler as reviewHandler } from "./review.js";

const COMMIT_PROMPT = `You are a commit message generator. Given the diff below, generate a conventional commit message.

Rules:
- Use conventional commit format: type(scope): description
- Types: feat, fix, refactor, docs, test, chore, style, perf
- Keep the first line under 72 characters
- Be concise and descriptive
- Output ONLY the commit message, nothing else

Diff:
`;

async function generateCommitMessage(diff: string): Promise<string> {
  const proc = Bun.spawn(
    ["claude", "-p", COMMIT_PROMPT + diff, "--model", "claude-haiku-4-5-20251001"],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: Object.fromEntries(
        Object.entries(process.env).filter(([k]) => k !== "CLAUDECODE")
      ),
    }
  );

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    // Fallback to pattern-based message
    return "chore: update codebase";
  }

  return stdout.trim().split("\n")[0]; // First line only
}

export async function processPr(
  ctx: AppContext,
  options: PrOptions = {}
): Promise<PrResult> {
  return withSpan(ctx.tracer, "processPr", async () => {
    const result: PrResult = {
      success: false,
      committed: false,
      intentGenerated: false,
      reviewPosted: false,
      errors: [],
    };

    const dryRun = options.dryRun ?? false;
    const skipReview = options.skipReview ?? false;
    const base = options.base ?? "main";

    // Step 1: Commit if there are changes
    const hasChanges = await hasUncommittedChanges();
    if (hasChanges) {
      ctx.logger.info("Uncommitted changes detected, creating commit");
      console.log("Uncommitted changes detected, creating commit...");

      try {
        await stageAllChanges();
        const diff = await getStagedDiff();
        const message = await generateCommitMessage(diff);

        if (dryRun) {
          console.log(`[DRY RUN] Would commit with message: ${message}`);
        } else {
          await createCommit(message);
          console.log(`Committed: ${message}`);
        }
        result.committed = true;
      } catch (e) {
        const error = `Failed to commit: ${e instanceof Error ? e.message : e}`;
        ctx.logger.error("Commit failed", { error: e });
        result.errors.push(error);
        console.error(error);
        // Continue anyway - maybe there were no changes to commit
      }
    } else {
      ctx.logger.info("No uncommitted changes");
      console.log("No uncommitted changes to commit.");
    }

    // Step 2: Generate intent
    ctx.logger.info("Generating intents");
    console.log("Generating intents...");

    try {
      const intentResult = await processIntents(ctx);
      if (intentResult.success) {
        result.intentGenerated = true;
        console.log(`Generated ${intentResult.results.length} intent(s)`);
      } else {
        for (const error of intentResult.errors) {
          console.error(error);
        }
        // Don't fail - continue to PR creation
      }
    } catch (e) {
      const error = `Intent generation failed: ${e instanceof Error ? e.message : e}`;
      ctx.logger.warn("Intent generation failed", { error: e });
      result.errors.push(error);
      console.error(error);
    }

    // Step 3: Push and create PR
    const branch = await getCurrentBranch();
    const hasTracking = await hasRemoteTracking(branch);

    if (!hasTracking || !(await getCurrentPR())) {
      ctx.logger.info("Pushing branch", { branch });
      console.log(`Pushing branch ${branch}...`);

      if (!dryRun) {
        try {
          await pushWithUpstream(branch);
          console.log("Pushed to remote");
        } catch (e) {
          const error = `Push failed: ${e instanceof Error ? e.message : e}`;
          ctx.logger.error("Push failed", { error: e });
          result.errors.push(error);
          console.error(error);
          return result;
        }
      } else {
        console.log(`[DRY RUN] Would push branch ${branch}`);
      }
    }

    // Check if PR exists
    let prNumber = await getCurrentPR();
    let prUrl: string | null = null;

    if (!prNumber) {
      ctx.logger.info("Creating PR");
      console.log("Creating PR...");

      if (!dryRun) {
        const prResult = await createPR();
        if (prResult) {
          prNumber = prResult.number;
          prUrl = prResult.url;
          console.log(`Created PR #${prNumber}: ${prUrl}`);
        } else {
          const error = "Failed to create PR";
          ctx.logger.error(error);
          result.errors.push(error);
          console.error(error);
          return result;
        }
      } else {
        console.log("[DRY RUN] Would create PR");
      }
    } else {
      prUrl = await getPRUrl(prNumber);
      console.log(`Using existing PR #${prNumber}`);
    }

    result.prNumber = prNumber ?? undefined;
    result.prUrl = prUrl ?? undefined;

    // Step 4: Run review
    if (!skipReview && prNumber) {
      ctx.logger.info("Running code review", { prNumber });
      console.log("Running code review...");

      try {
        await reviewHandler(ctx, {
          skill: "code-review",
          pr: prNumber,
          dryRun,
          base,
        });
        result.reviewPosted = true;
      } catch (e) {
        const error = `Review failed: ${e instanceof Error ? e.message : e}`;
        ctx.logger.error("Review failed", { error: e });
        result.errors.push(error);
        console.error(error);
        // Don't fail completely - PR was created
      }
    }

    result.success = true;
    ctx.logger.info("PR processing complete", {
      prNumber: result.prNumber,
      committed: result.committed,
      intentGenerated: result.intentGenerated,
      reviewPosted: result.reviewPosted,
    });

    if (prUrl) {
      console.log(`\nPR: ${prUrl}`);
    }

    return result;
  });
}

export async function handler(ctx: AppContext, options: PrOptions = {}): Promise<void> {
  ctx.logger.debug("Starting pr command");

  const result = await processPr(ctx, options);

  if (!result.success) {
    process.exit(1);
  }
}

export function builder(yargs: unknown): unknown {
  return (yargs as { option: Function })
    .option("dry-run", {
      describe: "Print what would happen without making changes",
      type: "boolean",
      default: false,
    })
    .option("skip-review", {
      describe: "Skip running the code review",
      type: "boolean",
      default: false,
    })
    .option("base", {
      describe: "Base branch for diff comparison",
      type: "string",
      default: "main",
    });
}
