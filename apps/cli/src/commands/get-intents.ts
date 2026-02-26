import type { AppContext } from "../lib/context.js";
import { showFile, fileExistsOnBranch, CHECKPOINT_BRANCH } from "../lib/git.js";
import { getCheckpointFolders } from "./get-checkpoint-folders.js";
import { processIntents } from "./intent.js";

async function generateIntents(ctx: AppContext): Promise<void> {
  const { errors } = await processIntents(ctx);

  // Print any warnings/errors to stderr
  for (const error of errors) {
    ctx.logger.warn("Intent generation warning", { message: error });
    console.error(error);
  }
}

export async function handler(ctx: AppContext): Promise<void> {
  ctx.logger.debug("Starting get-intents command");

  // Step 1: Get checkpoint folders
  let folders: string[];
  try {
    folders = await getCheckpointFolders();
  } catch (e) {
    ctx.logger.error("Failed to get checkpoint folders", { error: e });
    console.error(`Error: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  if (folders.length === 0) {
    ctx.logger.error("No checkpoint commits found");
    console.error(
      `Error: No checkpoint commits found on this branch.

This branch has no commits with 'Entire-Checkpoint:' trailers.
Checkpoint trailers are added automatically by Entire when you create checkpoints.

To use this reviewer:
  1. Create checkpoints during your development session
  2. Ensure commits have 'Entire-Checkpoint: <hash>' trailers`
    );
    process.exit(1);
  }

  ctx.logger.info("Found checkpoint folders", { count: folders.length });

  // Step 2: Check if any transcripts exist
  const foldersWithTranscripts: string[] = [];
  for (const folder of folders) {
    const transcriptPath = `${folder}/full.jsonl`;
    if (await fileExistsOnBranch(CHECKPOINT_BRANCH, transcriptPath)) {
      foldersWithTranscripts.push(folder);
    }
  }

  if (foldersWithTranscripts.length === 0) {
    ctx.logger.error("No checkpoint transcripts found", {
      folderCount: folders.length,
      branch: CHECKPOINT_BRANCH,
    });
    console.error(
      `Error: No checkpoint transcripts found.

Found ${folders.length} checkpoint reference(s), but no transcripts exist on the '${CHECKPOINT_BRANCH}' branch.

This can happen if:
  - The checkpoint branch hasn't been fetched: git fetch origin entire/checkpoints/v1
  - Transcripts weren't pushed from Entire
  - The checkpoint references point to missing data`
    );
    process.exit(1);
  }

  ctx.logger.info("Found folders with transcripts", { count: foldersWithTranscripts.length });

  // Step 3: Check for existing intents, generate if missing
  const foldersMissingIntent: string[] = [];
  for (const folder of foldersWithTranscripts) {
    const intentPath = `${folder}/intent.md`;
    if (!(await fileExistsOnBranch(CHECKPOINT_BRANCH, intentPath))) {
      foldersMissingIntent.push(folder);
    }
  }

  if (foldersMissingIntent.length > 0) {
    ctx.logger.info("Generating missing intent files", { count: foldersMissingIntent.length });
    console.error(
      `Generating intent files for ${foldersMissingIntent.length} checkpoint(s)...`
    );
    await generateIntents(ctx);
  }

  // Step 4: Collect and output all intent contents
  const allIntents: string[] = [];
  const missingAfterGeneration: string[] = [];

  for (const folder of foldersWithTranscripts) {
    const intentPath = `${folder}/intent.md`;
    const content = await showFile(CHECKPOINT_BRANCH, intentPath);
    if (content) {
      allIntents.push(content.trim());
    } else {
      missingAfterGeneration.push(folder);
    }
  }

  if (missingAfterGeneration.length > 0) {
    ctx.logger.warn("Could not retrieve some intents", {
      count: missingAfterGeneration.length,
      folders: missingAfterGeneration,
    });
    console.error(
      `Warning: Could not retrieve intent for ${missingAfterGeneration.length} folder(s): ${missingAfterGeneration.join(", ")}`
    );
  }

  if (allIntents.length === 0) {
    ctx.logger.error("No intent files retrieved or generated");
    console.error(
      `Error: No intent files could be retrieved or generated.

Intent generation may have failed. Check that:
  - The 'claude' CLI is installed and configured
  - You have API access for intent extraction`
    );
    process.exit(1);
  }

  ctx.logger.info("Retrieved intents", { count: allIntents.length });

  // Output all intents separated by horizontal rules
  console.log(allIntents.join("\n\n---\n\n"));
}
