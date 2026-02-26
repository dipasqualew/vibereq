import {
  showFile,
  commitToCheckpointBranch,
  CHECKPOINT_BRANCH,
} from "../lib/git.js";
import { filterConversation, serializeForClaude } from "../lib/transcript.js";
import { getCheckpointFolders } from "./get-checkpoint-folders.js";

const PROMPT = `You are a product manager reviewing the conversation between two engineers in a pair programming exercise.

Your role is to describe what the leading engineer (role: "user") is expressing as the objective of the work, what they want to achieve, why and what are the success criteria that emerge naturally from the conversation.

You will return only a document in the format:

# [Conversation Title]

[Conversation Summary: 1-2 lines describing what the user wanted to achieve and what the assistant ended up doing]

## Requirements

* Bullet list of success criteria
* ...

## Drift

A description of how much what the leading engineer (role: "user") was respected / implemented by the implementing engineer (role: "assistant")
`;

async function runClaude(input: string): Promise<string> {
  const proc = Bun.spawn(["claude", "-p", PROMPT, "--model", "claude-sonnet-4-6"], {
    stdin: new Response(input),
    stdout: "pipe",
    stderr: "pipe",
    env: Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== "CLAUDECODE")
    ),
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || "claude CLI failed");
  }

  return stdout;
}

function formatOutput(intentContent: string, intentPath: string): string {
  const gitShowCmd = `git show ${CHECKPOINT_BRANCH}:${intentPath}`;
  return `${intentContent.trim()}

---

## File Information

**Path:** \`${intentPath}\`

**View command:**
\`\`\`bash
${gitShowCmd}
\`\`\``;
}

export async function handler(): Promise<void> {
  let folders: string[];
  try {
    folders = await getCheckpointFolders();
  } catch (e) {
    console.error(`Error: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }

  if (folders.length === 0) {
    console.error(
      "Error: no checkpoint folders found. Ensure commits reference Entire-Checkpoint."
    );
    process.exit(1);
  }

  let anyProcessed = false;

  for (const folder of folders) {
    const transcriptPath = `${folder}/full.jsonl`;
    const transcript = await showFile(CHECKPOINT_BRANCH, transcriptPath);

    if (!transcript) {
      console.error(`Warning: transcript not found for folder ${folder}`);
      continue;
    }

    const conversation = filterConversation(transcript.split("\n"));
    if (conversation.length === 0) {
      console.error(
        `Warning: no conversational messages found for folder ${folder}`
      );
      continue;
    }

    let result: string;
    try {
      const input = serializeForClaude(conversation);
      result = await runClaude(input);
    } catch (e) {
      console.error(
        `Error analyzing intent for ${folder}: ${e instanceof Error ? e.message : e}`
      );
      continue;
    }

    let intentPath: string;
    try {
      intentPath = await commitToCheckpointBranch(folder, result);
    } catch (e) {
      console.error(
        `Error committing intent for ${folder}: ${e instanceof Error ? e.message : e}`
      );
      continue;
    }

    if (anyProcessed) {
      console.log("\n\n---\n\n");
    }
    console.log(formatOutput(result, intentPath));
    anyProcessed = true;
  }

  if (!anyProcessed) {
    console.error(
      "Error: no valid transcripts analyzed. Ensure commits reference Entire-Checkpoint and claude CLI is available."
    );
    process.exit(1);
  }
}
