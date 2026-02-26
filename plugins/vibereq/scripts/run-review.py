#!/usr/bin/env python3
"""
Run a vibereq reviewer and post findings to a GitHub PR.

Usage:
    python3 run-review.py <skill-name> [--pr <number>] [--dry-run]

Examples:
    python3 run-review.py vibereq:code-review
    python3 run-review.py vibereq:code-review --pr 42
    python3 run-review.py vibereq:code-review --dry-run

Note: Use the full skill name including plugin prefix (e.g., vibereq:code-review).
"""

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from typing import Optional


REVIEW_COMMENT_HEADER = "# Vibereq Review"
SEVERITY_EMOJI = {
    "critical": ":x:",
    "major": ":warning:",
    "minor": ":grey_question:",
    "info": ":information_source:",
}
STATUS_EMOJI = {
    "fulfilled": ":white_check_mark:",
    "partial": ":yellow_circle:",
    "missing": ":red_circle:",
    "violation": ":x:",
}


@dataclass
class Location:
    file: str
    line: int
    end_line: Optional[int] = None


@dataclass
class Finding:
    requirement: str
    status: str
    severity: str
    details: str
    location: Optional[Location] = None


@dataclass
class ReviewResult:
    reviewer_name: str
    status: str
    summary: str
    findings: list[Finding]


def run_command(cmd: list[str], capture: bool = True) -> subprocess.CompletedProcess:
    """Run a command and return the result."""
    return subprocess.run(
        cmd,
        capture_output=capture,
        text=True,
    )


def get_current_pr() -> Optional[int]:
    """Detect the current PR number from environment or git branch."""
    # GitHub Actions sets GITHUB_EVENT_PATH with the event payload
    if os.environ.get("GITHUB_EVENT_NAME") == "pull_request":
        event_path = os.environ.get("GITHUB_EVENT_PATH")
        if event_path and os.path.exists(event_path):
            try:
                with open(event_path) as f:
                    event = json.load(f)
                pr_number = event.get("pull_request", {}).get("number")
                if pr_number:
                    return int(pr_number)
            except (json.JSONDecodeError, ValueError, KeyError):
                pass

    # Try to get PR from gh CLI
    result = run_command(["gh", "pr", "view", "--json", "number", "-q", ".number"])
    if result.returncode == 0 and result.stdout.strip().isdigit():
        return int(result.stdout.strip())

    return None


def get_diff_lines(base_branch: str = "main") -> dict[str, set[int]]:
    """Get the line numbers that are in the diff for each file."""
    result = run_command(["git", "diff", f"{base_branch}...HEAD", "--unified=0"])
    if result.returncode != 0:
        return {}

    diff_lines: dict[str, set[int]] = {}
    current_file = None

    for line in result.stdout.split("\n"):
        # Match file header: +++ b/path/to/file.ts
        if line.startswith("+++ b/"):
            current_file = line[6:]
            diff_lines[current_file] = set()
        # Match hunk header: @@ -old,count +new,count @@
        elif line.startswith("@@") and current_file:
            match = re.search(r"\+(\d+)(?:,(\d+))?", line)
            if match:
                start = int(match.group(1))
                count = int(match.group(2)) if match.group(2) else 1
                for i in range(start, start + count):
                    diff_lines[current_file].add(i)

    return diff_lines


def run_reviewer(skill_name: str) -> dict:
    """Run a reviewer skill and parse its JSON output."""
    # Remove CLAUDECODE env var to allow nested claude CLI calls
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}

    cmd = ["claude", "-p", f"/{skill_name} ci", "--output-format", "json"]
    print(f"Running command: {' '.join(cmd)}", file=sys.stderr)

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        env=env,
    )

    print(f"Return code: {result.returncode}", file=sys.stderr)
    print(f"Stdout length: {len(result.stdout)}", file=sys.stderr)
    print(f"Stderr: {result.stderr[:500] if result.stderr else '(empty)'}", file=sys.stderr)

    if result.returncode != 0:
        print(f"Error running reviewer: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    # Parse the outer JSON from claude CLI
    try:
        claude_output = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        print(f"Failed to parse claude output as JSON: {e}", file=sys.stderr)
        print(f"Raw output: {result.stdout[:500]}", file=sys.stderr)
        sys.exit(1)

    # Extract the result field which contains the reviewer's JSON
    if "result" not in claude_output:
        print(f"No 'result' field in claude output", file=sys.stderr)
        sys.exit(1)

    reviewer_output = claude_output["result"]

    # The reviewer output should be raw JSON, but let's handle if it's wrapped
    if isinstance(reviewer_output, dict):
        return reviewer_output

    # Try to parse as JSON string
    try:
        return json.loads(reviewer_output)
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        match = re.search(r"\{[\s\S]*\}", reviewer_output)
        if match:
            return json.loads(match.group())
        print(f"Could not extract JSON from reviewer output", file=sys.stderr)
        print(f"Output: {reviewer_output[:500]}", file=sys.stderr)
        sys.exit(1)


def parse_review_result(skill_name: str, data: dict) -> ReviewResult:
    """Parse the JSON output into a ReviewResult."""
    findings = []
    for f in data.get("findings", []):
        location = None
        if f.get("location"):
            loc = f["location"]
            location = Location(
                file=loc["file"],
                line=loc["line"],
                end_line=loc.get("endLine"),
            )
        findings.append(
            Finding(
                requirement=f.get("requirement", ""),
                status=f.get("status", "info"),
                severity=f.get("severity", "info"),
                details=f.get("details", ""),
                location=location,
            )
        )

    return ReviewResult(
        reviewer_name=skill_name,
        status=data.get("status", "warn"),
        summary=data.get("summary", ""),
        findings=findings,
    )


def format_finding_for_comment(finding: Finding) -> str:
    """Format a finding for inclusion in a PR comment."""
    severity_emoji = SEVERITY_EMOJI.get(finding.severity, "")
    status_emoji = STATUS_EMOJI.get(finding.status, "")

    lines = [
        f"### {severity_emoji} {finding.requirement}",
        f"**Status:** {status_emoji} {finding.status} | **Severity:** {finding.severity}",
        "",
        finding.details,
    ]
    return "\n".join(lines)


def format_finding_for_diff_comment(finding: Finding) -> str:
    """Format a finding for a diff comment (shorter form)."""
    severity_emoji = SEVERITY_EMOJI.get(finding.severity, "")
    status_emoji = STATUS_EMOJI.get(finding.status, "")

    lines = [
        f"{severity_emoji} **{finding.requirement}**",
        f"Status: {status_emoji} {finding.status}",
        "",
        finding.details,
    ]
    return "\n".join(lines)


def get_existing_review_comment(pr_number: int) -> Optional[tuple[str, str]]:
    """Get the existing Vibereq Review comment if it exists.

    Returns (node_id, body) where node_id is the GraphQL node ID for updates.
    """
    result = run_command(
        [
            "gh",
            "api",
            f"/repos/{{owner}}/{{repo}}/issues/{pr_number}/comments",
            "--jq",
            ".[] | {node_id: .node_id, body: .body}",
        ]
    )

    if result.returncode != 0:
        return None

    # Parse each comment (gh outputs one JSON object per line)
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue
        try:
            comment = json.loads(line)
            if comment["body"].startswith(REVIEW_COMMENT_HEADER):
                return (comment["node_id"], comment["body"])
        except json.JSONDecodeError:
            continue

    return None


def update_review_section(existing_body: str, reviewer_name: str, new_section: str) -> str:
    """Update or add a reviewer section in the review comment body."""
    section_header = f"## {reviewer_name}"

    # Pattern to match an existing section for this reviewer
    pattern = rf"(## {re.escape(reviewer_name)}\n)([\s\S]*?)(?=\n## |\Z)"

    if re.search(pattern, existing_body):
        # Replace existing section
        return re.sub(pattern, f"{section_header}\n{new_section}\n", existing_body)
    else:
        # Append new section
        return f"{existing_body}\n\n{section_header}\n{new_section}"


def create_review_body(reviewer_name: str, section_content: str) -> str:
    """Create a new review comment body."""
    return f"{REVIEW_COMMENT_HEADER}\n\n## {reviewer_name}\n{section_content}"


def post_diff_comment(pr_number: int, finding: Finding, dry_run: bool = False) -> bool:
    """Post a comment on a specific line in the PR diff."""
    if not finding.location:
        return False

    body = format_finding_for_diff_comment(finding)

    if dry_run:
        print(f"[DRY RUN] Would post diff comment on {finding.location.file}:{finding.location.line}")
        print(f"  Body: {body[:100]}...")
        return True

    # Use gh api to create a review comment
    # We need to get the commit SHA first
    result = run_command(["gh", "pr", "view", str(pr_number), "--json", "headRefOid", "-q", ".headRefOid"])
    if result.returncode != 0:
        print(f"Failed to get PR head commit: {result.stderr}", file=sys.stderr)
        return False

    commit_sha = result.stdout.strip()

    # Build the gh api command
    cmd = [
        "gh",
        "api",
        "-X",
        "POST",
        f"/repos/{{owner}}/{{repo}}/pulls/{pr_number}/comments",
        "-f",
        f"body={body}",
        "-f",
        f"commit_id={commit_sha}",
        "-f",
        f"path={finding.location.file}",
    ]

    # Handle multi-line ranges: start_line is the first line, line is the last line
    if finding.location.end_line and finding.location.end_line != finding.location.line:
        cmd.extend(["-F", f"start_line={finding.location.line}"])
        cmd.extend(["-F", f"line={finding.location.end_line}"])
    else:
        cmd.extend(["-F", f"line={finding.location.line}"])

    result = run_command(cmd)

    if result.returncode != 0:
        # Line might not be in the diff, fall back to PR comment
        print(f"Could not post diff comment (line may not be in diff): {finding.location.file}:{finding.location.line}")
        return False

    return True


def update_comment_by_node_id(node_id: str, body: str) -> bool:
    """Update a comment using its GraphQL node ID."""
    # Use GraphQL mutation to update the comment
    query = """
    mutation UpdateComment($id: ID!, $body: String!) {
      updateIssueComment(input: {id: $id, body: $body}) {
        issueComment {
          id
        }
      }
    }
    """
    result = run_command(
        [
            "gh",
            "api",
            "graphql",
            "-f",
            f"query={query}",
            "-f",
            f"id={node_id}",
            "-f",
            f"body={body}",
        ]
    )
    return result.returncode == 0


def post_pr_comment(pr_number: int, result: ReviewResult, general_findings: list[Finding], dry_run: bool = False) -> None:
    """Post or update the main PR review comment."""
    # Build section content
    status_line = f"**Overall Status:** {result.status.upper()}"
    summary_line = f"\n{result.summary}" if result.summary else ""

    if general_findings:
        findings_content = "\n\n".join(format_finding_for_comment(f) for f in general_findings)
        section_content = f"{status_line}{summary_line}\n\n{findings_content}"
    else:
        section_content = f"{status_line}{summary_line}\n\n_No general findings._"

    if dry_run:
        print(f"[DRY RUN] Would update PR comment for {result.reviewer_name}")
        print(f"  Section content: {section_content[:200]}...")
        return

    # Check for existing comment
    existing = get_existing_review_comment(pr_number)

    if existing:
        node_id, existing_body = existing
        new_body = update_review_section(existing_body, result.reviewer_name, section_content)

        if not update_comment_by_node_id(node_id, new_body):
            print("Warning: Failed to update existing comment, creating new one", file=sys.stderr)
            new_body = create_review_body(result.reviewer_name, section_content)
            run_command(["gh", "pr", "comment", str(pr_number), "--body", new_body])
    else:
        new_body = create_review_body(result.reviewer_name, section_content)
        run_command(["gh", "pr", "comment", str(pr_number), "--body", new_body])


def main():
    parser = argparse.ArgumentParser(description="Run a vibereq reviewer and post to GitHub PR")
    parser.add_argument("skill", help="Name of the reviewer skill to run (e.g., vibereq:code-review)")
    parser.add_argument("--pr", type=int, help="PR number (auto-detected if not specified)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be posted without actually posting")
    parser.add_argument("--base", default="main", help="Base branch for diff comparison (default: main)")

    args = parser.parse_args()

    # Detect PR
    pr_number = args.pr or get_current_pr()
    if not pr_number:
        print("Could not detect PR number. Use --pr to specify.", file=sys.stderr)
        sys.exit(1)

    print(f"Running reviewer '{args.skill}' for PR #{pr_number}...")

    # Get diff lines for validation
    diff_lines = get_diff_lines(args.base)

    # Run the reviewer
    raw_result = run_reviewer(args.skill)
    result = parse_review_result(args.skill, raw_result)

    print(f"Review complete: {result.status.upper()} - {result.summary}")
    print(f"Found {len(result.findings)} finding(s)")

    # Separate findings with and without locations
    diff_findings = []
    general_findings = []

    for finding in result.findings:
        if finding.location:
            # Check if the line is actually in the diff
            file_lines = diff_lines.get(finding.location.file, set())
            if finding.location.line in file_lines:
                diff_findings.append(finding)
            else:
                # Line not in diff, treat as general finding
                print(f"  Note: {finding.location.file}:{finding.location.line} not in diff, adding to general findings")
                general_findings.append(finding)
        else:
            general_findings.append(finding)

    # Post diff comments
    for finding in diff_findings:
        success = post_diff_comment(pr_number, finding, args.dry_run)
        if not success:
            general_findings.append(finding)

    # Post/update the main PR comment
    post_pr_comment(pr_number, result, general_findings, args.dry_run)

    print("Done!")


if __name__ == "__main__":
    main()
