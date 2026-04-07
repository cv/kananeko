#!/usr/bin/env bash
set -euo pipefail

msg_file=${1:?commit message path is required}

mapfile -t message_lines < <(grep -Ev '^[[:space:]]*#' "$msg_file" | sed 's/[[:space:]]*$//')

while ((${#message_lines[@]} > 0)) && [[ -z ${message_lines[0]} ]]; do
  message_lines=("${message_lines[@]:1}")
done

while ((${#message_lines[@]} > 0)) && [[ -z ${message_lines[${#message_lines[@]} - 1]} ]]; do
  unset "message_lines[${#message_lines[@]} - 1]"
done

if grep -Eiq '^[[:space:]]*Co-Authored-By:' "$msg_file"; then
  echo "ERROR: commit messages must not contain Co-Authored-By trailers." >&2
  echo "Remove any 'Co-Authored-By:' lines and try again." >&2
  exit 1
fi

if ((${#message_lines[@]} == 0)); then
  echo "ERROR: commit message is empty." >&2
  exit 1
fi

has_body=false
for ((i = 1; i < ${#message_lines[@]}; i++)); do
  if [[ -n ${message_lines[i]} ]]; then
    has_body=true
    break
  fi
done

if [[ $has_body == false ]]; then
  echo "ERROR: commit messages must include a descriptive body, not just a title." >&2
  echo "Write a short explanation after the subject line (preferably separated by a blank line)." >&2
  exit 1
fi
