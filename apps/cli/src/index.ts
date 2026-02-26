#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { handler as getCheckpointFoldersHandler } from "./commands/get-checkpoint-folders.js";
import { handler as getIntentsHandler } from "./commands/get-intents.js";
import { handler as intentHandler } from "./commands/intent.js";
import {
  handler as runReviewHandler,
  builder as runReviewBuilder,
} from "./commands/run-review.js";

yargs(hideBin(process.argv))
  .scriptName("vibx")
  .command(
    "get-checkpoint-folders",
    "Get checkpoint folders from commits not in main",
    {},
    getCheckpointFoldersHandler
  )
  .command(
    "get-intents",
    "Get or generate intent files for checkpoints",
    {},
    getIntentsHandler
  )
  .command(
    "intent",
    "Extract intent from checkpoint transcripts",
    {},
    intentHandler
  )
  .command(
    "run-review <skill>",
    "Run a reviewer skill and post findings to GitHub PR",
    runReviewBuilder,
    (argv) =>
      runReviewHandler({
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
