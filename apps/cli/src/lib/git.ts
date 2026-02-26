import type { ProcessResult } from "../types.js";

const CHECKPOINT_RE = /^\s*Entire-Checkpoint:\s*([0-9a-fA-F]+)\s*$/m;
export const CHECKPOINT_BRANCH = "entire/checkpoints/v1";

export async function runGit(args: string[]): Promise<ProcessResult> {
  const proc = Bun.spawn(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

export async function getCommitsNotInMain(): Promise<string[]> {
  const { stdout, exitCode } = await runGit([
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  if (exitCode !== 0 || stdout.trim() !== "true") {
    throw new Error("Not inside a git repository.");
  }

  const tryLog = async (base: string): Promise<string[] | null> => {
    const result = await runGit(["log", `${base}..HEAD`, "--format=%H"]);
    if (result.exitCode === 0) {
      return result.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    }
    return null;
  };

  let commits = await tryLog("main");
  if (commits === null) commits = await tryLog("origin/main");
  if (commits === null) commits = await tryLog("HEAD~0");
  if (commits === null) {
    throw new Error("Unable to compute commits not in main.");
  }
  return commits;
}

export async function getCheckpointHash(
  commitHash: string
): Promise<string | null> {
  const { stdout, exitCode } = await runGit([
    "log",
    "-1",
    "--format=%B",
    commitHash,
  ]);
  if (exitCode !== 0) return null;
  const match = CHECKPOINT_RE.exec(stdout);
  return match ? match[1].toLowerCase() : null;
}

export function checkpointHashToFolder(hash: string): string {
  const h = hash.trim().toLowerCase();
  if (h.length < 3) {
    return `${h}/${h}/0`;
  }
  return `${h.slice(0, 2)}/${h.slice(2)}/0`;
}

export async function fileExistsOnBranch(
  branch: string,
  path: string
): Promise<boolean> {
  const spec = `${branch}:${path}`;
  const { exitCode } = await runGit(["cat-file", "-e", spec]);
  return exitCode === 0;
}

export async function showFile(
  branch: string,
  path: string
): Promise<string | null> {
  const spec = `${branch}:${path}`;
  const { stdout, exitCode } = await runGit(["show", spec]);
  if (exitCode !== 0) return null;
  return stdout;
}

export async function commitToCheckpointBranch(
  folder: string,
  content: string
): Promise<string> {
  const relPath = `${folder}/intent.md`;

  // 1. Create blob from intent content
  const blobProc = Bun.spawn(["git", "hash-object", "-w", "--stdin"], {
    stdin: new Response(content),
    stdout: "pipe",
    stderr: "pipe",
  });
  const blobStdout = await new Response(blobProc.stdout).text();
  const blobStderr = await new Response(blobProc.stderr).text();
  if ((await blobProc.exited) !== 0) {
    throw new Error(`Failed to create blob: ${blobStderr}`);
  }
  const blobHash = blobStdout.trim();

  // 2. Create a temporary index file
  const tmpIndex = `/tmp/vibx-git-index-${Date.now()}`;
  const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };

  try {
    // Read current tree from checkpoint branch into temp index
    const readTreeProc = Bun.spawn(["git", "read-tree", CHECKPOINT_BRANCH], {
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const readTreeStderr = await new Response(readTreeProc.stderr).text();
    if ((await readTreeProc.exited) !== 0) {
      throw new Error(`Failed to read tree: ${readTreeStderr}`);
    }

    // Add new file to index
    const updateIndexProc = Bun.spawn(
      [
        "git",
        "update-index",
        "--add",
        "--cacheinfo",
        `100644,${blobHash},${relPath}`,
      ],
      { env, stdout: "pipe", stderr: "pipe" }
    );
    const updateIndexStderr = await new Response(updateIndexProc.stderr).text();
    if ((await updateIndexProc.exited) !== 0) {
      throw new Error(`Failed to update index: ${updateIndexStderr}`);
    }

    // Write tree
    const writeTreeProc = Bun.spawn(["git", "write-tree"], {
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const writeTreeStdout = await new Response(writeTreeProc.stdout).text();
    const writeTreeStderr = await new Response(writeTreeProc.stderr).text();
    if ((await writeTreeProc.exited) !== 0) {
      throw new Error(`Failed to write tree: ${writeTreeStderr}`);
    }
    const newTree = writeTreeStdout.trim();

    // Get parent commit
    const { stdout: parentStdout, exitCode: parentExitCode } = await runGit([
      "rev-parse",
      CHECKPOINT_BRANCH,
    ]);
    if (parentExitCode !== 0) {
      throw new Error("Failed to get parent commit");
    }
    const parent = parentStdout.trim();

    // Create commit
    const commitProc = Bun.spawn(
      [
        "git",
        "commit-tree",
        newTree,
        "-p",
        parent,
        "-m",
        `Add intent for ${folder}`,
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    const commitStdout = await new Response(commitProc.stdout).text();
    const commitStderr = await new Response(commitProc.stderr).text();
    if ((await commitProc.exited) !== 0) {
      throw new Error(`Failed to create commit: ${commitStderr}`);
    }
    const newCommit = commitStdout.trim();

    // Update branch reference
    const { exitCode: updateRefExitCode } = await runGit([
      "update-ref",
      `refs/heads/${CHECKPOINT_BRANCH}`,
      newCommit,
    ]);
    if (updateRefExitCode !== 0) {
      throw new Error("Failed to update branch");
    }

    return relPath;
  } finally {
    // Clean up temp index
    try {
      await Bun.file(tmpIndex).delete();
    } catch {
      // Ignore cleanup errors
    }
  }
}
