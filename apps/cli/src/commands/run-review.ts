import type { Finding, Location, ReviewResult } from "../types.js";
import {
  getCurrentPR,
  getDiffLines,
  postDiffComment,
  updateOrCreateComment,
} from "../lib/github.js";

interface RunReviewOptions {
  skill: string;
  pr?: number;
  dryRun?: boolean;
  base?: string;
}

async function runReviewer(skillName: string): Promise<Record<string, unknown>> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k !== "CLAUDECODE")
  );

  const cmd = ["claude", "-p", `/${skillName} ci`, "--output-format", "json"];
  console.error(`Running command: ${cmd.join(" ")}`);

  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    env,
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  console.error(`Return code: ${exitCode}`);
  console.error(`Stdout length: ${stdout.length}`);
  console.error(`Stderr: ${stderr.slice(0, 500) || "(empty)"}`);

  if (exitCode !== 0) {
    console.error(`Error running reviewer: ${stderr}`);
    process.exit(1);
  }

  // Parse the outer JSON from claude CLI
  let claudeOutput: Record<string, unknown>;
  try {
    claudeOutput = JSON.parse(stdout);
  } catch (e) {
    console.error(`Failed to parse claude output as JSON: ${e}`);
    console.error(`Raw output: ${stdout.slice(0, 500)}`);
    process.exit(1);
  }

  // Extract the result field
  if (!("result" in claudeOutput)) {
    console.error("No 'result' field in claude output");
    process.exit(1);
  }

  const reviewerOutput = claudeOutput.result;

  if (typeof reviewerOutput === "object" && reviewerOutput !== null) {
    return reviewerOutput as Record<string, unknown>;
  }

  // Try to parse as JSON string
  if (typeof reviewerOutput === "string") {
    try {
      return JSON.parse(reviewerOutput);
    } catch {
      // Try to extract JSON from the response
      const match = /\{[\s\S]*\}/.exec(reviewerOutput);
      if (match) {
        return JSON.parse(match[0]);
      }
    }
  }

  console.error("Could not extract JSON from reviewer output");
  console.error(`Output: ${String(reviewerOutput).slice(0, 500)}`);
  process.exit(1);
}

function parseReviewResult(
  skillName: string,
  data: Record<string, unknown>
): ReviewResult {
  const findings: Finding[] = [];
  const rawFindings = data.findings;

  if (Array.isArray(rawFindings)) {
    for (const f of rawFindings) {
      if (typeof f !== "object" || f === null) continue;
      const finding = f as Record<string, unknown>;

      let location: Location | null = null;
      if (finding.location && typeof finding.location === "object") {
        const loc = finding.location as Record<string, unknown>;
        if (typeof loc.file === "string" && typeof loc.line === "number") {
          location = {
            file: loc.file,
            line: loc.line,
            endLine: typeof loc.endLine === "number" ? loc.endLine : undefined,
          };
        }
      }

      findings.push({
        requirement: String(finding.requirement || ""),
        status: String(finding.status || "info"),
        severity: String(finding.severity || "info"),
        details: String(finding.details || ""),
        location,
      });
    }
  }

  return {
    reviewerName: skillName,
    status: String(data.status || "warn"),
    summary: String(data.summary || ""),
    findings,
  };
}

export async function handler(options: RunReviewOptions): Promise<void> {
  const prNumber = options.pr ?? (await getCurrentPR());
  if (!prNumber) {
    console.error("Could not detect PR number. Use --pr to specify.");
    process.exit(1);
  }

  const baseBranch = options.base ?? "main";
  const dryRun = options.dryRun ?? false;

  console.log(`Running reviewer '${options.skill}' for PR #${prNumber}...`);

  // Get diff lines for validation
  const diffLines = await getDiffLines(baseBranch);

  // Run the reviewer
  const rawResult = await runReviewer(options.skill);
  const result = parseReviewResult(options.skill, rawResult);

  console.log(`Review complete: ${result.status.toUpperCase()} - ${result.summary}`);
  console.log(`Found ${result.findings.length} finding(s)`);

  // Separate findings with and without locations
  const diffFindings: Finding[] = [];
  const generalFindings: Finding[] = [];

  for (const finding of result.findings) {
    if (finding.location) {
      const fileLines = diffLines.get(finding.location.file);
      if (fileLines?.has(finding.location.line)) {
        diffFindings.push(finding);
      } else {
        console.log(
          `  Note: ${finding.location.file}:${finding.location.line} not in diff, adding to general findings`
        );
        generalFindings.push(finding);
      }
    } else {
      generalFindings.push(finding);
    }
  }

  // Post diff comments
  for (const finding of diffFindings) {
    const success = await postDiffComment(prNumber, finding, dryRun);
    if (!success) {
      generalFindings.push(finding);
    }
  }

  // Post/update the main PR comment
  await updateOrCreateComment(
    prNumber,
    result.reviewerName,
    result.status,
    result.summary,
    generalFindings,
    dryRun
  );

  console.log("Done!");
}

export function builder(yargs: unknown): unknown {
  return (yargs as { positional: Function; option: Function })
    .positional("skill", {
      describe: "Name of the reviewer skill to run (e.g., vibereq:code-review)",
      type: "string",
      demandOption: true,
    })
    .option("pr", {
      describe: "PR number (auto-detected if not specified)",
      type: "number",
    })
    .option("dry-run", {
      describe: "Print what would be posted without actually posting",
      type: "boolean",
      default: false,
    })
    .option("base", {
      describe: "Base branch for diff comparison",
      type: "string",
      default: "main",
    });
}
