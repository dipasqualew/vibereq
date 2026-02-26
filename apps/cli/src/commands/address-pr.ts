import type { AppContext } from "../lib/context.js";
import { withSpan } from "../lib/observability.js";
import type { AddressPrResult, ReviewThreadDetail } from "../types.js";
import { getDiff } from "../lib/git.js";
import { getCurrentPR, getUnresolvedReviewThreads } from "../lib/github.js";

interface AddressPrOptions {
  pr?: number;
  base?: string;
}

function formatThreadsForAgent(
  threads: ReviewThreadDetail[],
  diff: string
): string {
  const lines: string[] = [];

  lines.push("# Unresolved PR Review Comments\n");

  if (threads.length === 0) {
    lines.push("No unresolved comments found.\n");
  } else {
    lines.push(`Found ${threads.length} unresolved comment thread(s):\n`);

    for (const thread of threads) {
      lines.push(`## ${thread.path}:${thread.line}\n`);

      for (const comment of thread.comments) {
        const date = new Date(comment.createdAt).toISOString().slice(0, 10);
        lines.push(`**@${comment.author}** (${date}):`);
        lines.push(comment.body);
        lines.push("");
      }

      lines.push("---\n");
    }
  }

  lines.push("# Current Diff\n");
  lines.push("```diff");
  lines.push(diff);
  lines.push("```\n");

  lines.push("# Instructions\n");
  lines.push(`You have ${threads.length} unresolved comment(s) to address.\n`);
  lines.push("For each comment:");
  lines.push("1. Read the file mentioned in the comment");
  lines.push("2. Understand the context and the requested change");
  lines.push("3. Make the necessary code changes");
  lines.push("4. Explain what you changed and why\n");
  lines.push("Use the Read, Grep, and Glob tools to explore the codebase.");
  lines.push("Use git diff and git log to understand recent changes.");

  return lines.join("\n");
}

export async function processAddressPr(
  ctx: AppContext,
  options: AddressPrOptions = {}
): Promise<AddressPrResult> {
  return withSpan(ctx.tracer, "processAddressPr", async () => {
    const result: AddressPrResult = {
      success: false,
      threads: [],
      diff: "",
      errors: [],
    };

    const base = options.base ?? "main";

    // Get PR number
    const prNumber = options.pr ?? (await getCurrentPR());
    if (!prNumber) {
      const error = "Could not detect PR number. Use --pr to specify.";
      ctx.logger.error(error);
      result.errors.push(error);
      return result;
    }

    result.prNumber = prNumber;
    ctx.logger.info("Processing address-pr", { prNumber });

    // Get unresolved threads
    const threads = await getUnresolvedReviewThreads(prNumber);
    result.threads = threads;
    ctx.logger.info("Found unresolved threads", { count: threads.length });

    // Get diff
    const diff = await getDiff(base);
    result.diff = diff;

    // Format output
    const output = formatThreadsForAgent(threads, diff);
    console.log(output);

    result.success = true;
    return result;
  });
}

export async function handler(
  ctx: AppContext,
  options: AddressPrOptions = {}
): Promise<void> {
  ctx.logger.debug("Starting address-pr command");

  const result = await processAddressPr(ctx, options);

  if (!result.success) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exit(1);
  }
}

export function builder(yargs: unknown): unknown {
  return (yargs as { option: Function })
    .option("pr", {
      describe: "PR number (auto-detected if not specified)",
      type: "number",
    })
    .option("base", {
      describe: "Base branch for diff comparison",
      type: "string",
      default: "main",
    });
}
