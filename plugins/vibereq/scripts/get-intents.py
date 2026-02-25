#!/usr/bin/env python3
"""
Get intent files for all checkpoints on the current branch.

Retrieves intent.md content for each checkpoint. If an intent file doesn't exist
but a transcript does, it automatically generates the intent using intent.py.

Exit codes:
  0 - Success, intent content printed to stdout
  1 - No checkpoint transcripts found (helpful message to stderr)
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Optional


_CHECKPOINT_BRANCH = "entire/checkpoints/v1"


def _run_git(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], capture_output=True, text=True)


def get_checkpoint_folders() -> list[str]:
    """Get checkpoint folders for commits not in main."""
    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if plugin_root:
        script_path = Path(plugin_root) / "scripts" / "get-checkpoint-folders.py"
    else:
        script_path = Path(__file__).parent / "get-checkpoint-folders.py"

    proc = subprocess.run(
        [sys.executable, str(script_path)],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "get-checkpoint-folders.py failed")
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def transcript_exists(folder: str) -> bool:
    """Check if transcript exists for a checkpoint folder."""
    path = f"{folder}/full.jsonl"
    spec = f"{_CHECKPOINT_BRANCH}:{path}"
    res = _run_git(["cat-file", "-e", spec])
    return res.returncode == 0


def intent_exists(folder: str) -> bool:
    """Check if intent.md exists for a checkpoint folder."""
    path = f"{folder}/intent.md"
    spec = f"{_CHECKPOINT_BRANCH}:{path}"
    res = _run_git(["cat-file", "-e", spec])
    return res.returncode == 0


def get_intent_content(folder: str) -> Optional[str]:
    """Get intent.md content for a checkpoint folder."""
    path = f"{folder}/intent.md"
    spec = f"{_CHECKPOINT_BRANCH}:{path}"
    res = _run_git(["show", spec])
    if res.returncode != 0:
        return None
    return res.stdout


def generate_intents() -> bool:
    """Run intent.py to generate missing intents. Returns True on success."""
    plugin_root = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if plugin_root:
        script_path = Path(plugin_root) / "scripts" / "intent.py"
    else:
        script_path = Path(__file__).parent / "intent.py"

    # Create environment without CLAUDECODE to allow nested claude CLI calls
    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}

    proc = subprocess.run(
        [sys.executable, str(script_path)],
        capture_output=True,
        text=True,
        env=env,
    )
    if proc.returncode != 0:
        print(f"Warning: intent generation had issues: {proc.stderr}", file=sys.stderr)
    # Even if some failed, we might have generated others - continue
    return True


def main() -> int:
    # Step 1: Get checkpoint folders
    try:
        folders = get_checkpoint_folders()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if not folders:
        print(
            "Error: No checkpoint commits found on this branch.\n\n"
            "This branch has no commits with 'Entire-Checkpoint:' trailers.\n"
            "Checkpoint trailers are added automatically by Entire when you create checkpoints.\n\n"
            "To use this reviewer:\n"
            "  1. Create checkpoints during your development session\n"
            "  2. Ensure commits have 'Entire-Checkpoint: <hash>' trailers",
            file=sys.stderr,
        )
        return 1

    # Step 2: Check if any transcripts exist
    folders_with_transcripts = [f for f in folders if transcript_exists(f)]

    if not folders_with_transcripts:
        print(
            "Error: No checkpoint transcripts found.\n\n"
            f"Found {len(folders)} checkpoint reference(s), but no transcripts exist on "
            f"the '{_CHECKPOINT_BRANCH}' branch.\n\n"
            "This can happen if:\n"
            "  - The checkpoint branch hasn't been fetched: git fetch origin entire/checkpoints/v1\n"
            "  - Transcripts weren't pushed from Entire\n"
            "  - The checkpoint references point to missing data",
            file=sys.stderr,
        )
        return 1

    # Step 3: Check for existing intents, generate if missing
    folders_missing_intent = [f for f in folders_with_transcripts if not intent_exists(f)]

    if folders_missing_intent:
        print(
            f"Generating intent files for {len(folders_missing_intent)} checkpoint(s)...",
            file=sys.stderr,
        )
        generate_intents()

    # Step 4: Collect and output all intent contents
    all_intents: list[str] = []
    missing_after_generation: list[str] = []

    for folder in folders_with_transcripts:
        content = get_intent_content(folder)
        if content:
            all_intents.append(content.strip())
        else:
            missing_after_generation.append(folder)

    if missing_after_generation:
        print(
            f"Warning: Could not retrieve intent for {len(missing_after_generation)} folder(s): "
            f"{', '.join(missing_after_generation)}",
            file=sys.stderr,
        )

    if not all_intents:
        print(
            "Error: No intent files could be retrieved or generated.\n\n"
            "Intent generation may have failed. Check that:\n"
            "  - The 'claude' CLI is installed and configured\n"
            "  - You have API access for intent extraction",
            file=sys.stderr,
        )
        return 1

    # Output all intents separated by horizontal rules
    print("\n\n---\n\n".join(all_intents))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
