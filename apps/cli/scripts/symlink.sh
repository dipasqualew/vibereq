#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI_DIR="$(dirname "$SCRIPT_DIR")"
DIST_PATH="$CLI_DIR/dist/vibx"
LOCAL_BIN="$HOME/.local/bin"

cd "$CLI_DIR"
bun run build

mkdir -p "$LOCAL_BIN"

BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$BRANCH" = "main" ]; then
  TARGET="$LOCAL_BIN/vibx"
else
  TARGET="$LOCAL_BIN/vibx-dev"
fi

ln -sf "$DIST_PATH" "$TARGET"
echo "Linked $DIST_PATH -> $TARGET"
