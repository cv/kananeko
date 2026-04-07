#!/usr/bin/env bash
set -euo pipefail

msg_file=${1:?commit message path is required}

if grep -Eiq '^[[:space:]]*Co-Authored-By:' "$msg_file"; then
  echo "ERROR: commit messages must not contain Co-Authored-By trailers." >&2
  echo "Remove any 'Co-Authored-By:' lines and try again." >&2
  exit 1
fi
