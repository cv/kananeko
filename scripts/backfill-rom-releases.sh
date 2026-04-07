#!/usr/bin/env bash
set -euo pipefail

workflow_file="release-rom.yml"
range="${1:-origin/main..HEAD}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI (gh) is required to backfill releases." >&2
  exit 1
fi

if ! git rev-list -1 "$range" >/dev/null 2>&1; then
  echo "ERROR: invalid revision range: $range" >&2
  exit 1
fi

echo "Queueing release workflow runs for commits in range: $range"

while IFS= read -r sha; do
  short_sha="${sha:0:12}"
  tag="rom-${short_sha}"
  title="ROM build ${short_sha}"

  echo "- $short_sha"
  gh workflow run "$workflow_file" \
    -f ref="$sha" \
    -f tag="$tag" \
    -f release_name="$title"
done < <(git rev-list --reverse "$range")

cat <<EOF

Queued workflow runs for every commit in $range.
Watch progress with:
  gh run list --workflow "$workflow_file"
EOF
