#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { createAppContext, type AppContext } from "./lib/context.js";
import { shutdownObservability } from "./lib/observability.js";
import { handler as getCheckpointFoldersHandler } from "./commands/get-checkpoint-folders.js";
import { handler as getIntentsHandler } from "./commands/get-intents.js";
import { handler as intentHandler } from "./commands/intent.js";
import {
  handler as reviewHandler,
  builder as reviewBuilder,
} from "./commands/review.js";

// Extend yargs argv to include context
declare module "yargs" {
  interface Argv {
    ctx?: AppContext;
  }
}

async function main() {
  // Initialize observability
  const ctx = await createAppContext();

  ctx.logger.info("CLI started", { args: process.argv.slice(2) });

  // Register shutdown hooks for signals only
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    ctx.logger.info("CLI shutting down");
    await shutdownObservability();
  };

  process.on("SIGINT", async () => {
    await shutdown();
    process.exit(130);
  });
  process.on("SIGTERM", async () => {
    await shutdown();
    process.exit(143);
  });

  try {
    await yargs(hideBin(process.argv))
      .scriptName("vibx")
      .middleware((argv) => {
        argv.ctx = ctx;
      })
      .command(
        "get-checkpoint-folders",
        "Get checkpoint folders from commits not in main",
        {},
        (argv) => getCheckpointFoldersHandler(argv.ctx!)
      )
      .command(
        "get-intents",
        "Get or generate intent files for checkpoints",
        {},
        (argv) => getIntentsHandler(argv.ctx!)
      )
      .command(
        "intent",
        "Extract intent from checkpoint transcripts",
        {},
        (argv) => intentHandler(argv.ctx!)
      )
      .command(
        "review <skill>",
        "Run a reviewer skill and post findings to GitHub PR",
        reviewBuilder,
        (argv) =>
          reviewHandler(argv.ctx!, {
            skill: argv.skill as string,
            pr: argv.pr as number | undefined,
            dryRun: argv["dry-run"] as boolean | undefined,
            base: argv.base as string | undefined,
          })
      )
      .demandCommand(1, "You must specify a command")
      .strict()
      .help()
      .parseAsync();

    ctx.logger.info("CLI completed successfully");
  } finally {
    await shutdown();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
