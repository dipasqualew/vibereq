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

export async function handler(): Promise<void> {
  try {
    const folders = await getCheckpointFolders();
    for (const folder of folders) {
      console.log(folder);
    }
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
