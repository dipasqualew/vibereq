import type { Finding, ProcessResult } from "../types.js";

export const REVIEW_COMMENT_HEADER = "# Vibereq Review";

export const SEVERITY_EMOJI: Record<string, string> = {
  critical: ":x:",
  major: ":warning:",
  minor: ":grey_question:",
  info: ":information_source:",
};

export const STATUS_EMOJI: Record<string, string> = {
  fulfilled: ":white_check_mark:",
  partial: ":yellow_circle:",
  missing: ":red_circle:",
  violation: ":x:",
};

async function runCommand(cmd: string[]): Promise<ProcessResult> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

export async function getCurrentPR(): Promise<number | null> {
  // GitHub Actions sets GITHUB_EVENT_PATH with the event payload
  if (process.env.GITHUB_EVENT_NAME === "pull_request") {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (eventPath) {
      try {
        const file = Bun.file(eventPath);
        const event = await file.json();
        const prNumber = event?.pull_request?.number;
        if (typeof prNumber === "number") {
          return prNumber;
        }
      } catch {
        // Fall through to gh CLI
      }
    }
  }

  // Try to get PR from gh CLI
  const result = await runCommand([
    "gh",
    "pr",
    "view",
    "--json",
    "number",
    "-q",
    ".number",
  ]);
  if (result.exitCode === 0 && /^\d+$/.test(result.stdout.trim())) {
    return parseInt(result.stdout.trim(), 10);
  }

  return null;
}

export async function getDiffLines(
  baseBranch = "main"
): Promise<Map<string, Set<number>>> {
  const result = await runCommand([
    "git",
    "diff",
    `${baseBranch}...HEAD`,
    "--unified=0",
  ]);
  if (result.exitCode !== 0) {
    return new Map();
  }

  const diffLines = new Map<string, Set<number>>();
  let currentFile: string | null = null;

  for (const line of result.stdout.split("\n")) {
    // Match file header: +++ b/path/to/file.ts
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6);
      diffLines.set(currentFile, new Set());
    }
    // Match hunk header: @@ -old,count +new,count @@
    else if (line.startsWith("@@") && currentFile) {
      const match = /\+(\d+)(?:,(\d+))?/.exec(line);
      if (match) {
        const start = parseInt(match[1], 10);
        const count = match[2] ? parseInt(match[2], 10) : 1;
        const fileLines = diffLines.get(currentFile)!;
        for (let i = start; i < start + count; i++) {
          fileLines.add(i);
        }
      }
    }
  }

  return diffLines;
}

export async function getExistingReviewComment(
  prNumber: number
): Promise<{ nodeId: string; body: string } | null> {
  const result = await runCommand([
    "gh",
    "api",
    `/repos/{owner}/{repo}/issues/${prNumber}/comments`,
    "--jq",
    ".[] | {node_id: .node_id, body: .body}",
  ]);

  if (result.exitCode !== 0) return null;

  for (const line of result.stdout.trim().split("\n")) {
    if (!line) continue;
    try {
      const comment = JSON.parse(line);
      if (comment.body?.startsWith(REVIEW_COMMENT_HEADER)) {
        return { nodeId: comment.node_id, body: comment.body };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function formatFindingForDiffComment(finding: Finding): string {
  const severityEmoji = SEVERITY_EMOJI[finding.severity] || "";
  const statusEmoji = STATUS_EMOJI[finding.status] || "";

  return [
    `${severityEmoji} **${finding.requirement}**`,
    `Status: ${statusEmoji} ${finding.status}`,
    "",
    finding.details,
  ].join("\n");
}

export async function postDiffComment(
  prNumber: number,
  finding: Finding,
  dryRun = false
): Promise<boolean> {
  if (!finding.location) return false;

  const body = formatFindingForDiffComment(finding);

  if (dryRun) {
    console.log(
      `[DRY RUN] Would post diff comment on ${finding.location.file}:${finding.location.line}`
    );
    console.log(`  Body: ${body.slice(0, 100)}...`);
    return true;
  }

  // Get commit SHA
  const shaResult = await runCommand([
    "gh",
    "pr",
    "view",
    String(prNumber),
    "--json",
    "headRefOid",
    "-q",
    ".headRefOid",
  ]);
  if (shaResult.exitCode !== 0) {
    console.error(`Failed to get PR head commit: ${shaResult.stderr}`);
    return false;
  }
  const commitSha = shaResult.stdout.trim();

  // Build the gh api command
  const cmd = [
    "gh",
    "api",
    "-X",
    "POST",
    `/repos/{owner}/{repo}/pulls/${prNumber}/comments`,
    "-f",
    `body=${body}`,
    "-f",
    `commit_id=${commitSha}`,
    "-f",
    `path=${finding.location.file}`,
  ];

  // Handle multi-line ranges
  if (
    finding.location.endLine &&
    finding.location.endLine !== finding.location.line
  ) {
    cmd.push("-F", `start_line=${finding.location.line}`);
    cmd.push("-F", `line=${finding.location.endLine}`);
  } else {
    cmd.push("-F", `line=${finding.location.line}`);
  }

  const result = await runCommand(cmd);

  if (result.exitCode !== 0) {
    console.log(
      `Could not post diff comment (line may not be in diff): ${finding.location.file}:${finding.location.line}`
    );
    return false;
  }

  return true;
}

function updateReviewSection(
  existingBody: string,
  reviewerName: string,
  newSection: string
): string {
  const sectionHeader = `## ${reviewerName}`;
  const escapedName = reviewerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match section header followed by content, stopping at next section or end
  // Use a more robust pattern that handles trailing newlines correctly
  const pattern = new RegExp(
    `## ${escapedName}\\n[\\s\\S]*?(?=\\n## |\\n*$)`
  );

  if (pattern.test(existingBody)) {
    // Replace matched section, ensuring consistent trailing newline
    const replacement = `${sectionHeader}\n${newSection.trimEnd()}`;
    return existingBody.replace(pattern, replacement);
  }
  // Append new section, trimming any excessive trailing whitespace first
  return `${existingBody.trimEnd()}\n\n${sectionHeader}\n${newSection.trimEnd()}`;
}

async function updateCommentByNodeId(nodeId: string, body: string): Promise<boolean> {
  const query = `
    mutation UpdateComment($id: ID!, $body: String!) {
      updateIssueComment(input: {id: $id, body: $body}) {
        issueComment {
          id
        }
      }
    }
  `;

  const result = await runCommand([
    "gh",
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-f",
    `id=${nodeId}`,
    "-f",
    `body=${body}`,
  ]);

  return result.exitCode === 0;
}

export function formatFindingForComment(finding: Finding): string {
  const severityEmoji = SEVERITY_EMOJI[finding.severity] || "";
  const statusEmoji = STATUS_EMOJI[finding.status] || "";

  return [
    `### ${severityEmoji} ${finding.requirement}`,
    `**Status:** ${statusEmoji} ${finding.status} | **Severity:** ${finding.severity}`,
    "",
    finding.details,
  ].join("\n");
}

export async function updateOrCreateComment(
  prNumber: number,
  reviewerName: string,
  status: string,
  summary: string,
  findings: Finding[],
  dryRun = false
): Promise<void> {
  const statusLine = `**Overall Status:** ${status.toUpperCase()}`;
  const summaryLine = summary ? `\n${summary}` : "";

  let sectionContent: string;
  if (findings.length > 0) {
    const findingsContent = findings
      .map((f) => formatFindingForComment(f))
      .join("\n\n");
    sectionContent = `${statusLine}${summaryLine}\n\n${findingsContent}`;
  } else {
    sectionContent = `${statusLine}${summaryLine}\n\n_No general findings._`;
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would update PR comment for ${reviewerName}`);
    console.log(`  Section content: ${sectionContent.slice(0, 200)}...`);
    return;
  }

  const existing = await getExistingReviewComment(prNumber);

  if (existing) {
    const newBody = updateReviewSection(existing.body, reviewerName, sectionContent);

    if (!(await updateCommentByNodeId(existing.nodeId, newBody))) {
      console.error(
        "Warning: Failed to update existing comment, creating new one"
      );
      const createBody = `${REVIEW_COMMENT_HEADER}\n\n## ${reviewerName}\n${sectionContent}`;
      await runCommand([
        "gh",
        "pr",
        "comment",
        String(prNumber),
        "--body",
        createBody,
      ]);
    }
  } else {
    const newBody = `${REVIEW_COMMENT_HEADER}\n\n## ${reviewerName}\n${sectionContent}`;
    await runCommand([
      "gh",
      "pr",
      "comment",
      String(prNumber),
      "--body",
      newBody,
    ]);
  }
}
