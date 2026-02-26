import type { AppContext } from "../lib/context.js";
import {
  getCommitsNotInMain,
  getCheckpointHash,
  checkpointHashToFolder,
} from "../lib/git.js";

export async function getCheckpointFolders(): Promise<string[]> {
  const commits = await getCommitsNotInMain();
  const seen = new Set<string>();
  const folders: string[] = [];

  for (const commit of commits) {
    const checkpoint = await getCheckpointHash(commit);
    if (!checkpoint || seen.has(checkpoint)) continue;
    seen.add(checkpoint);
    folders.push(checkpointHashToFolder(checkpoint));
  }

  return folders;
}

export async function handler(ctx: AppContext): Promise<void> {
  try {
    ctx.logger.debug("Getting checkpoint folders");
    const folders = await getCheckpointFolders();
    ctx.logger.info("Found checkpoint folders", { count: folders.length });
    for (const folder of folders) {
      console.log(folder);
    }
  } catch (e) {
    ctx.logger.error("Failed to get checkpoint folders", { error: e });
    console.error(`Error: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
