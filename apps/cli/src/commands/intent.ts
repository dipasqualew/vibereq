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

export interface IntentResult {
  folder: string;
  intentPath: string;
  content: string;
}

export interface ProcessIntentsResult {
  success: boolean;
  results: IntentResult[];
  errors: string[];
}

/**
 * Core function to process intents for checkpoint folders.
 * Does not call process.exit - returns results for caller to handle.
 */
export async function processIntents(): Promise<ProcessIntentsResult> {
  const results: IntentResult[] = [];
  const errors: string[] = [];

  let folders: string[];
  try {
    folders = await getCheckpointFolders();
  } catch (e) {
    return {
      success: false,
      results: [],
      errors: [`Error: ${e instanceof Error ? e.message : e}`],
    };
  }

  if (folders.length === 0) {
    return {
      success: false,
      results: [],
      errors: [
        "Error: no checkpoint folders found. Ensure commits reference Entire-Checkpoint.",
      ],
    };
  }

  for (const folder of folders) {
    const transcriptPath = `${folder}/full.jsonl`;
    const transcript = await showFile(CHECKPOINT_BRANCH, transcriptPath);

    if (!transcript) {
      errors.push(`Warning: transcript not found for folder ${folder}`);
      continue;
    }

    const conversation = filterConversation(transcript.split("\n"));
    if (conversation.length === 0) {
      errors.push(
        `Warning: no conversational messages found for folder ${folder}`
      );
      continue;
    }

    let result: string;
    try {
      const input = serializeForClaude(conversation);
      result = await runClaude(input);
    } catch (e) {
      errors.push(
        `Error analyzing intent for ${folder}: ${e instanceof Error ? e.message : e}`
      );
      continue;
    }

    let intentPath: string;
    try {
      intentPath = await commitToCheckpointBranch(folder, result);
    } catch (e) {
      errors.push(
        `Error committing intent for ${folder}: ${e instanceof Error ? e.message : e}`
      );
      continue;
    }

    results.push({ folder, intentPath, content: result });
  }

  return {
    success: results.length > 0,
    results,
    errors,
  };
}

export async function handler(): Promise<void> {
  const { success, results, errors } = await processIntents();

  // Print warnings/errors
  for (const error of errors) {
    console.error(error);
  }

  if (!success) {
    if (results.length === 0 && errors.length > 0) {
      // Already printed specific errors
    } else {
      console.error(
        "Error: no valid transcripts analyzed. Ensure commits reference Entire-Checkpoint and claude CLI is available."
      );
    }
    process.exit(1);
  }

  // Output results
  for (let i = 0; i < results.length; i++) {
    if (i > 0) {
      console.log("\n\n---\n\n");
    }
    console.log(formatOutput(results[i].content, results[i].intentPath));
  }
}
