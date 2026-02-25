#!/usr/bin/env python3
"""
Intent extraction script for Claude Code session transcripts.

Single-file script using only Python stdlib, git CLI, and claude CLI.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional


# -----------------------------
# Git Operations Module
# -----------------------------

_CHECKPOINT_BRANCH = "entire/checkpoints/v1"


def _run_git(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], capture_output=True, text=True)


def get_checkpoint_folders() -> list[str]:
    """Get checkpoint folders for commits not in main.

    Calls the get-checkpoint-folders.py script and returns list of folder paths.
    """
    # Use CLAUDE_PLUGIN_ROOT if available, otherwise use script's directory
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


def get_intent_path(folder: str) -> str:
    """Convert checkpoint folder to intent file path.

    Example: "df/9cdff458c3/0" -> "df/9cdff458c3/0/intent.md"
    """
    return f"{folder}/intent.md"


def commit_intent_to_checkpoint(folder: str, intent_content: str) -> str:
    """Commit intent.md to entire/checkpoints/v1 branch without switching branches.

    Uses git plumbing commands to create a commit on the checkpoint branch.
    Returns the path where the file was committed.
    Raises RuntimeError if the commit fails.
    """
    rel_path = get_intent_path(folder)

    # 1. Create blob from intent content
    blob_proc = subprocess.run(
        ["git", "hash-object", "-w", "--stdin"],
        input=intent_content,
        capture_output=True,
        text=True,
    )
    if blob_proc.returncode != 0:
        raise RuntimeError(f"Failed to create blob: {blob_proc.stderr}")
    blob_hash = blob_proc.stdout.strip()

    # 2. Use a temporary index file to avoid affecting the working directory
    with tempfile.NamedTemporaryFile(delete=False, suffix=".git-index") as tmp:
        index_file = tmp.name

    try:
        env = os.environ.copy()
        env["GIT_INDEX_FILE"] = index_file

        # Read current tree from checkpoint branch into temp index
        read_tree_proc = subprocess.run(
            ["git", "read-tree", _CHECKPOINT_BRANCH],
            env=env,
            capture_output=True,
            text=True,
        )
        if read_tree_proc.returncode != 0:
            raise RuntimeError(f"Failed to read tree: {read_tree_proc.stderr}")

        # Add new file to index
        update_index_proc = subprocess.run(
            ["git", "update-index", "--add", "--cacheinfo", f"100644,{blob_hash},{rel_path}"],
            env=env,
            capture_output=True,
            text=True,
        )
        if update_index_proc.returncode != 0:
            raise RuntimeError(f"Failed to update index: {update_index_proc.stderr}")

        # Write tree
        write_tree_proc = subprocess.run(
            ["git", "write-tree"],
            env=env,
            capture_output=True,
            text=True,
        )
        if write_tree_proc.returncode != 0:
            raise RuntimeError(f"Failed to write tree: {write_tree_proc.stderr}")
        new_tree = write_tree_proc.stdout.strip()

        # Get parent commit
        parent_proc = subprocess.run(
            ["git", "rev-parse", _CHECKPOINT_BRANCH],
            capture_output=True,
            text=True,
        )
        if parent_proc.returncode != 0:
            raise RuntimeError(f"Failed to get parent commit: {parent_proc.stderr}")
        parent = parent_proc.stdout.strip()

        # Create commit
        commit_proc = subprocess.run(
            ["git", "commit-tree", new_tree, "-p", parent, "-m", f"Add intent for {folder}"],
            capture_output=True,
            text=True,
        )
        if commit_proc.returncode != 0:
            raise RuntimeError(f"Failed to create commit: {commit_proc.stderr}")
        new_commit = commit_proc.stdout.strip()

        # Update branch reference
        update_ref_proc = subprocess.run(
            ["git", "update-ref", f"refs/heads/{_CHECKPOINT_BRANCH}", new_commit],
            capture_output=True,
            text=True,
        )
        if update_ref_proc.returncode != 0:
            raise RuntimeError(f"Failed to update branch: {update_ref_proc.stderr}")

    finally:
        # Clean up temporary index file
        if os.path.exists(index_file):
            os.unlink(index_file)

    return rel_path


# -----------------------------
# Transcript Retrieval Module
# -----------------------------


def get_transcript_path(folder: str) -> str:
    """Convert checkpoint folder to transcript path.

    Example: "df/9cdff458c3/0" -> "df/9cdff458c3/0/full.jsonl"
    """
    return f"{folder}/full.jsonl"


def fetch_transcript(folder: str) -> Optional[str]:
    """Fetch transcript content from entire/checkpoints/v1 branch.

    Returns the raw JSONL content as a string, or None if not found.
    """
    path = get_transcript_path(folder)
    spec = f"{_CHECKPOINT_BRANCH}:{path}"
    res = _run_git(["show", spec])  # type: ignore[call-arg]
    if res.returncode != 0:
        return None
    return res.stdout


# -----------------------------
# Message Filtering Module
# -----------------------------


@dataclass
class ConvMsg:
    role: str  # "user" or "assistant"
    text: str


def _extract_assistant_text(content: object) -> Optional[str]:
    """From assistant content array, extract visible text blocks only.

    Excludes tool_result, tool_use, thinking, etc. Returns concatenated text, or None.
    """
    if not isinstance(content, list):
        return None
    texts: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            continue
        typ = item.get("type") if isinstance(item.get("type"), str) else None
        if typ != "text":
            continue
        t = item.get("text")
        if isinstance(t, str) and t.strip():
            texts.append(t)
    joined = "\n".join(texts).strip()
    return joined or None


def filter_conversation(transcript_lines: Iterable[str]) -> list[ConvMsg]:
    """Extract user and assistant text messages only from JSONL transcript.

    - Include: type == "user" where message.content is a string
    - Include: type == "assistant" where message.content array contains text blocks
    - Exclude: tool_result, tool_use, thinking blocks
    """
    msgs: list[ConvMsg] = []
    for raw in transcript_lines:
        raw = raw.strip()
        if not raw:
            continue
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue

        typ = obj.get("type") if isinstance(obj, dict) else None
        if not isinstance(typ, str):
            continue

        message = obj.get("message") if isinstance(obj, dict) else None
        if not isinstance(message, dict):
            continue

        content = message.get("content")

        if typ == "user":
            if isinstance(content, str) and content.strip():
                msgs.append(ConvMsg(role="user", text=content.strip()))
            # If user content is not a string, it's likely a tool_result or non-chat event; skip
            continue

        if typ == "assistant":
            text = _extract_assistant_text(content)
            if text:
                msgs.append(ConvMsg(role="assistant", text=text))
            continue

        # Other types (tool_use, tool_result, system, thinking, etc.) are ignored
    return msgs


# -----------------------------
# Claude CLI Integration
# -----------------------------


PROMPT = (
    "You are a product manager reviewing the conversation between two engineers in a pair programming exercise.\n\n"
    'Your role is to describe what the leading engineer (role: "user") is expressing as the objective of the work, what they want to achieve, why and what are the success criteria that emerge naturally from the conversation.\n\n'
    "You will return only a document in the format:\n\n"
    "# [Conversation Title]\n\n"
    "[Conversation Summary: 1-2 lines describing what the user wanted to achieve and what the assistant ended up doing]\n\n"
    "## Requirements\n\n"
    "* Bullet list of success criteria\n"
    "* ...\n\n"
    "## Drift\n\n"
    'A description of how much what the leading engineer (role: "user") was respected / implemented by the implementing engineer (role: "assistant")\n'
)


def _serialize_conversation_for_input(conversation: list[ConvMsg]) -> str:
    lines: list[str] = []
    lines.append("Conversation transcript (role: text):\n")
    for msg in conversation:
        role = msg.role
        text = msg.text.strip()
        lines.append(f"[{role}]\n{text}\n")
    return "\n".join(lines).strip() + "\n"


def analyze_intent(conversation: list[ConvMsg]) -> str:
    """Run claude -p with intent analysis prompt.

    Serializes the conversation to a readable format and pipes it to `claude -p`.
    Raises RuntimeError if the CLI is unavailable or invocation fails.
    """
    if shutil.which("claude") is None:
        raise RuntimeError("`claude` CLI not found in PATH. Please install/configure it.")

    input_text = _serialize_conversation_for_input(conversation)
    proc = subprocess.run(
        ["claude", "-p", PROMPT, "--model", "claude-sonnet-4-6"],
        input=input_text,
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        stderr = proc.stderr.strip() or "claude CLI failed"
        raise RuntimeError(stderr)
    return proc.stdout


# -----------------------------
# Main Entry Point
# -----------------------------


def format_output(intent_content: str, intent_path: str) -> str:
    """Format the output with sections for intent, path, and git show command."""
    git_show_cmd = f"git show {_CHECKPOINT_BRANCH}:{intent_path}"
    return f"""{intent_content.strip()}

---

## File Information

**Path:** `{intent_path}`

**View command:**
```bash
{git_show_cmd}
```"""


def main(argv: Optional[List[str]] = None) -> int:
    del argv  # unused; script takes no arguments for now
    try:
        folders = get_checkpoint_folders()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if not folders:
        print(
            "Error: no checkpoint folders found. Ensure commits reference Entire-Checkpoint.",
            file=sys.stderr,
        )
        return 1

    any_processed = False
    for folder in folders:
        transcript = fetch_transcript(folder)
        if not transcript:
            print(
                f"Warning: transcript not found for folder {folder}",
                file=sys.stderr,
            )
            continue

        conversation = filter_conversation(transcript.splitlines())
        if not conversation:
            print(
                f"Warning: no conversational messages found for folder {folder}",
                file=sys.stderr,
            )
            continue

        try:
            result = analyze_intent(conversation)
        except Exception as e:
            print(f"Error analyzing intent for {folder}: {e}", file=sys.stderr)
            continue

        # Commit intent to checkpoint branch
        try:
            intent_path = commit_intent_to_checkpoint(folder, result)
        except Exception as e:
            print(f"Error committing intent for {folder}: {e}", file=sys.stderr)
            continue

        # Separate outputs for multiple checkpoints with a clear divider
        if any_processed:
            print("\n\n---\n\n")
        print(format_output(result, intent_path))
        any_processed = True

    if not any_processed:
        print(
            "Error: no valid transcripts analyzed. Ensure commits reference Entire-Checkpoint and claude CLI is available.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
