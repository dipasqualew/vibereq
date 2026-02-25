#!/usr/bin/env python3
"""
Get checkpoint folders for commits not in main.

Outputs absolute paths to checkpoint folders (one per line) for all commits
on the current branch that are not in main and have an Entire-Checkpoint trailer.
"""

from __future__ import annotations

import re
import subprocess
import sys
from typing import Optional


_CHECKPOINT_RE = re.compile(r"^\s*Entire-Checkpoint:\s*([0-9a-fA-F]+)\s*$", re.MULTILINE)
_CHECKPOINT_BRANCH = "entire/checkpoints/v1"


def _run_git(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], capture_output=True, text=True)


def get_commits_not_in_main() -> list[str]:
    """Get commit hashes from current branch not in main."""
    res = _run_git(["rev-parse", "--is-inside-work-tree"])
    if res.returncode != 0 or res.stdout.strip() != "true":
        raise RuntimeError("Not inside a git repository.")

    def try_log(base: str) -> Optional[list[str]]:
        r = _run_git(["log", f"{base}..HEAD", "--format=%H"])
        if r.returncode == 0:
            return [line.strip() for line in r.stdout.splitlines() if line.strip()]
        return None

    commits = try_log("main")
    if commits is None:
        commits = try_log("origin/main")
    if commits is None:
        commits = try_log("HEAD~0")
    if commits is None:
        raise RuntimeError("Unable to compute commits not in main.")
    return commits


def get_checkpoint_hash(commit_hash: str) -> Optional[str]:
    """Extract Entire-Checkpoint hash from commit message."""
    res = _run_git(["log", "-1", "--format=%B", commit_hash])
    if res.returncode != 0:
        return None
    m = _CHECKPOINT_RE.search(res.stdout)
    return m.group(1).lower() if m else None


def get_checkpoint_folder(checkpoint_hash: str) -> str:
    """Convert checkpoint hash to folder path.

    Example: "df9cdff458c3" -> "df/9cdff458c3/0"
    """
    h = checkpoint_hash.strip().lower()
    if len(h) < 3:
        return f"{h}/{h}/0"
    return f"{h[:2]}/{h[2:]}/0"


def main() -> int:
    try:
        commits = get_commits_not_in_main()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    seen: set[str] = set()
    for commit in commits:
        checkpoint = get_checkpoint_hash(commit)
        if not checkpoint or checkpoint in seen:
            continue
        seen.add(checkpoint)
        print(get_checkpoint_folder(checkpoint))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
