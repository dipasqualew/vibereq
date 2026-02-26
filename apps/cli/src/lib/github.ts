import type { Finding, ProcessResult, ReviewResult } from "../types.js";
import { getTracer, withSpan, type Logger } from "./observability.js";

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

interface ReviewComment {
  path: string;
  line: number;
  start_line?: number;
  body: string;
}

async function runCommand(cmd: string[]): Promise<ProcessResult> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

export async function getCurrentPR(): Promise<number | null> {
  const tracer = getTracer();

  return withSpan(tracer, "getCurrentPR", async () => {
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
  });
}

export async function getDiffLines(
  baseBranch = "main"
): Promise<Map<string, Set<number>>> {
  const tracer = getTracer();

  return withSpan(tracer, "getDiffLines", async () => {
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
  }, { baseBranch });
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

async function getCommitSha(prNumber: number, logger?: Logger): Promise<string | null> {
  const tracer = getTracer();
  return withSpan(tracer, "getCommitSha", async () => {
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
      logger?.error("Failed to get PR head commit", { prNumber, stderr: shaResult.stderr });
      return null;
    }
    return shaResult.stdout.trim();
  }, { prNumber });
}

function buildReviewComment(finding: Finding): ReviewComment | null {
  if (!finding.location) return null;

  const body = formatFindingForDiffComment(finding);
  const comment: ReviewComment = {
    path: finding.location.file,
    line: finding.location.endLine ?? finding.location.line,
    body,
  };

  if (
    finding.location.endLine &&
    finding.location.endLine !== finding.location.line
  ) {
    comment.start_line = finding.location.line;
  }

  return comment;
}

async function resolveReviewThread(threadId: string): Promise<boolean> {
  const query = `
    mutation ResolveThread($threadId: ID!) {
      resolveReviewThread(input: {threadId: $threadId}) {
        thread {
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
    `threadId=${threadId}`,
  ]);

  return result.exitCode === 0;
}

interface VibereqReview {
  id: number;
  body: string;
  htmlUrl: string;
}

/**
 * Get all Vibereq reviews on a PR (identified by the REVIEW_COMMENT_HEADER)
 */
async function getVibereqReviews(prNumber: number): Promise<VibereqReview[]> {
  const result = await runCommand([
    "gh",
    "api",
    `/repos/{owner}/{repo}/pulls/${prNumber}/reviews`,
    "--paginate",
  ]);

  if (result.exitCode !== 0) return [];

  try {
    const reviews = JSON.parse(result.stdout);
    return reviews
      .filter((r: { body: string }) => r.body?.includes(REVIEW_COMMENT_HEADER))
      .filter((r: { body: string }) => !r.body?.includes("<details>"))
      .map((r: { id: number; body: string; html_url: string }) => ({
        id: r.id,
        body: r.body,
        htmlUrl: r.html_url,
      }));
  } catch {
    return [];
  }
}

/**
 * Archive a review by collapsing its body with a link to the new review
 */
async function archiveReview(
  prNumber: number,
  reviewId: number,
  originalBody: string,
  newReviewUrl: string
): Promise<boolean> {
  const collapsedBody = `<details>
<summary>[review superseded by <a href="${newReviewUrl}">new review</a>]</summary>

${originalBody}
</details>`;

  const tempFile = `/tmp/vibx-archive-${Date.now()}.json`;
  await Bun.write(tempFile, JSON.stringify({ body: collapsedBody }));

  const result = await runCommand([
    "gh",
    "api",
    "-X",
    "PUT",
    `/repos/{owner}/{repo}/pulls/${prNumber}/reviews/${reviewId}`,
    "--input",
    tempFile,
  ]);

  // Clean up temp file
  try {
    if (await Bun.file(tempFile).exists()) {
      await runCommand(["rm", tempFile]);
    }
  } catch {
    // Ignore cleanup errors
  }

  return result.exitCode === 0;
}

/**
 * Archive all previous Vibereq reviews on a PR
 * @param excludeReviewId - The ID of the new review to exclude from archiving
 */
export async function archivePreviousReviews(
  prNumber: number,
  newReviewUrl: string,
  excludeReviewId: number,
  logger?: Logger
): Promise<void> {
  const tracer = getTracer();

  return withSpan(tracer, "archivePreviousReviews", async () => {
    const allReviews = await getVibereqReviews(prNumber);
    const previousReviews = allReviews.filter(r => r.id !== excludeReviewId);

    if (previousReviews.length === 0) {
      logger?.debug("No previous Vibereq reviews to archive");
      return;
    }

    logger?.info("Archiving previous reviews", { count: previousReviews.length });
    console.log(`Archiving ${previousReviews.length} previous review(s)...`);

    // Get unresolved review threads only from previous Vibereq reviews
    const previousReviewIds = previousReviews.map(r => r.id);
    const threads = await getReviewThreads(prNumber, previousReviewIds);

    // Resolve threads from previous reviews only
    for (const thread of threads) {
      const resolved = await resolveReviewThread(thread.id);
      if (resolved) {
        logger?.debug("Resolved thread", { path: thread.path, line: thread.line });
      }
    }

    if (threads.length > 0) {
      console.log(`  Resolved ${threads.length} comment thread(s)`);
    }

    // Collapse each previous review
    for (const review of previousReviews) {
      const archived = await archiveReview(prNumber, review.id, review.body, newReviewUrl);
      if (archived) {
        logger?.debug("Archived review", { reviewId: review.id });
        console.log(`  Archived review #${review.id}`);
      } else {
        logger?.warn("Failed to archive review", { reviewId: review.id });
      }
    }
  }, { prNumber });
}

async function getReviewThreads(
  prNumber: number,
  filterReviewIds?: number[]
): Promise<Array<{ id: string; path: string; line: number }>> {
  const query = `
    query GetReviewThreads($owner: String!, $repo: String!, $pr: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr) {
          reviewThreads(last: 100) {
            nodes {
              id
              isResolved
              path
              line
              comments(first: 1) {
                nodes {
                  pullRequestReview {
                    databaseId
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  // Get owner and repo from gh
  const repoResult = await runCommand([
    "gh",
    "repo",
    "view",
    "--json",
    "owner,name",
  ]);
  if (repoResult.exitCode !== 0) return [];

  const repoInfo = JSON.parse(repoResult.stdout);
  const owner = repoInfo.owner.login;
  const repo = repoInfo.name;

  const result = await runCommand([
    "gh",
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-f",
    `owner=${owner}`,
    "-f",
    `repo=${repo}`,
    "-F",
    `pr=${prNumber}`,
  ]);

  if (result.exitCode !== 0) return [];

  try {
    const data = JSON.parse(result.stdout);
    const threads = data.data.repository.pullRequest.reviewThreads.nodes;
    return threads
      .filter((t: { isResolved: boolean }) => !t.isResolved)
      .filter((t: { comments: { nodes: Array<{ pullRequestReview?: { databaseId?: number } }> } }) => {
        if (!filterReviewIds || filterReviewIds.length === 0) return true;
        const reviewId = t.comments.nodes[0]?.pullRequestReview?.databaseId;
        return reviewId != null && filterReviewIds.includes(reviewId);
      })
      .map((t: { id: string; path: string; line: number }) => ({
        id: t.id,
        path: t.path,
        line: t.line,
      }));
  } catch {
    return [];
  }
}

export async function submitReview(
  prNumber: number,
  result: ReviewResult,
  diffFindings: Finding[],
  generalFindings: Finding[],
  dryRun = false,
  logger?: Logger
): Promise<{ success: boolean; failedFindings: Finding[]; reviewUrl?: string }> {
  const tracer = getTracer();

  return withSpan(tracer, "submitReview", async () => {
    const failedFindings: Finding[] = [];

    // Build review comments from diff findings
    const comments: ReviewComment[] = [];
    const fulfilledComments: Array<{ path: string; line: number }> = [];

    for (const finding of diffFindings) {
      const comment = buildReviewComment(finding);
      if (comment) {
        comments.push(comment);
        if (finding.status === "fulfilled") {
          fulfilledComments.push({ path: comment.path, line: comment.line });
        }
      } else {
        failedFindings.push(finding);
      }
    }

    // Build review body from general findings and summary
    const reviewBody = formatReviewBody(result, generalFindings);

    if (dryRun) {
      logger?.info("Dry run - would submit review", { commentCount: comments.length });
      console.log(`[DRY RUN] Would submit review with ${comments.length} diff comment(s)`);
      for (const comment of comments) {
        console.log(`  - ${comment.path}:${comment.line}`);
      }
      console.log(`[DRY RUN] Review body preview: ${reviewBody.slice(0, 200)}...`);
      if (fulfilledComments.length > 0) {
        console.log(`[DRY RUN] Would resolve ${fulfilledComments.length} fulfilled comment(s)`);
      }
      console.log(`[DRY RUN] Would archive previous Vibereq reviews`);
      return { success: true, failedFindings };
    }

    const commitSha = await getCommitSha(prNumber, logger);
    if (!commitSha) {
      return { success: false, failedFindings: [...diffFindings, ...generalFindings] };
    }

    // Build the review payload
    const payload: Record<string, unknown> = {
      commit_id: commitSha,
      body: reviewBody,
      event: "COMMENT",
    };

    if (comments.length > 0) {
      payload.comments = comments;
    }

    // Write payload to temp file for gh api
    const tempFile = `/tmp/vibx-review-${Date.now()}.json`;
    await Bun.write(tempFile, JSON.stringify(payload));

    const createResult = await withSpan(tracer, "gh.api.createReview", () => runCommand([
      "gh",
      "api",
      "-X",
      "POST",
      `/repos/{owner}/{repo}/pulls/${prNumber}/reviews`,
      "--input",
      tempFile,
    ]));

    // Clean up temp file
    try {
      if (await Bun.file(tempFile).exists()) {
        await runCommand(["rm", tempFile]);
      }
    } catch {
      // Ignore cleanup errors
    }

    if (createResult.exitCode !== 0) {
      logger?.error("Failed to create review", { prNumber, stderr: createResult.stderr });
      return { success: false, failedFindings: [...diffFindings, ...generalFindings] };
    }

    // Extract the new review ID and URL from the response
    let reviewUrl: string | undefined;
    let reviewId: number | undefined;
    try {
      const reviewData = JSON.parse(createResult.stdout);
      reviewUrl = reviewData.html_url;
      reviewId = reviewData.id;
    } catch {
      logger?.warn("Could not extract review data from response");
    }

    logger?.info("Created review", { prNumber, commentCount: comments.length, reviewUrl, reviewId });
    console.log(`Created review with ${comments.length} diff comment(s)`);

    // Archive previous Vibereq reviews (exclude the one we just created)
    if (reviewUrl && reviewId) {
      await archivePreviousReviews(prNumber, reviewUrl, reviewId, logger);
    }

    // Resolve fulfilled comments from the NEW review
    if (fulfilledComments.length > 0) {
      console.log(`Resolving ${fulfilledComments.length} fulfilled comment(s)...`);
      const threads = await getReviewThreads(prNumber);

      for (const fulfilled of fulfilledComments) {
        const thread = threads.find(
          (t) => t.path === fulfilled.path && t.line === fulfilled.line
        );
        if (thread) {
          const resolved = await resolveReviewThread(thread.id);
          if (resolved) {
            logger?.debug("Resolved thread", { path: fulfilled.path, line: fulfilled.line });
            console.log(`  Resolved: ${fulfilled.path}:${fulfilled.line}`);
          }
        }
      }
    }

    return { success: true, failedFindings, reviewUrl };
  }, { prNumber, dryRun });
}

function formatReviewBody(result: ReviewResult, generalFindings: Finding[]): string {
  const statusEmoji =
    result.status === "pass"
      ? ":white_check_mark:"
      : result.status === "fail"
        ? ":x:"
        : ":warning:";

  const lines = [
    `${REVIEW_COMMENT_HEADER}`,
    "",
    `## ${result.reviewerName}`,
    `**Overall Status:** ${statusEmoji} ${result.status.toUpperCase()}`,
  ];

  if (result.summary) {
    lines.push("", result.summary);
  }

  if (generalFindings.length > 0) {
    lines.push("", "### General Findings", "");
    for (const finding of generalFindings) {
      lines.push(formatFindingForComment(finding), "");
    }
  }

  return lines.join("\n");
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

