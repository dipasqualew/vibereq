import { showFile, fileExistsOnBranch, CHECKPOINT_BRANCH } from "../lib/git.js";
import { getCheckpointFolders } from "./get-checkpoint-folders.js";
import { processIntents } from "./intent.js";

async function generateIntents(): Promise<void> {
  const { errors } = await processIntents();

  // Print any warnings/errors to stderr
  for (const error of errors) {
    console.error(error);
  }
}

export async function handler(): Promise<void> {
  // Step 1: Get checkpoint folders
  let folders: string[];
  try {
    folders = await getCheckpointFolders();
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  if (folders.length === 0) {
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

  // Step 2: Check if any transcripts exist
  const foldersWithTranscripts: string[] = [];
  for (const folder of folders) {
    const transcriptPath = `${folder}/full.jsonl`;
    if (await fileExistsOnBranch(CHECKPOINT_BRANCH, transcriptPath)) {
      foldersWithTranscripts.push(folder);
    }
  }

  if (foldersWithTranscripts.length === 0) {
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

  // Step 3: Check for existing intents, generate if missing
  const foldersMissingIntent: string[] = [];
  for (const folder of foldersWithTranscripts) {
    const intentPath = `${folder}/intent.md`;
    if (!(await fileExistsOnBranch(CHECKPOINT_BRANCH, intentPath))) {
      foldersMissingIntent.push(folder);
    }
  }

  if (foldersMissingIntent.length > 0) {
    console.error(
      `Generating intent files for ${foldersMissingIntent.length} checkpoint(s)...`
    );
    await generateIntents();
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
    console.error(
      `Warning: Could not retrieve intent for ${missingAfterGeneration.length} folder(s): ${missingAfterGeneration.join(", ")}`
    );
  }

  if (allIntents.length === 0) {
    console.error(
      `Error: No intent files could be retrieved or generated.

Intent generation may have failed. Check that:
  - The 'claude' CLI is installed and configured
  - You have API access for intent extraction`
    );
    process.exit(1);
  }

  // Output all intents separated by horizontal rules
  console.log(allIntents.join("\n\n---\n\n"));
}
