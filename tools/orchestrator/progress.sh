#!/usr/bin/env bash
# Prints one line of overall progress for the status issue: Stories done out
# of all Stories in sprint status, and a loose finish estimate from the pace of
# Story merges on origin/main over the last few days. Story PRs are squash
# merges titled `<story-id>: <title>`; Escalation-only PRs (`raise ESC-…`) are
# not counted.
set -euo pipefail

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
status="$root/_bmad-output/implementation-artifacts/sprint-status.yaml"
days=3

total=$(grep -cE '^  [0-9]+-[0-9]+-[a-z0-9-]+: ' "$status")
done=$(grep -cE '^  [0-9]+-[0-9]+-[a-z0-9-]+: done( |$)' "$status")
left=$((total - done))
pct=$((done * 100 / total))
recent=$(git -C "$root" log origin/main --since="$days days ago" --format='%s' \
  | grep -E '^[0-9]+\.[0-9]+: ' | grep -vi 'raise ESC' | awk '{print $1}' | sort -u | wc -l | tr -d ' ')

if [ "$recent" -gt 0 ]; then
  eta=$(((left * days + recent - 1) / recent))
  echo "Progress: $done/$total Stories done ($pct%). Loose estimate: ~$eta days left at the last $days days' pace ($recent Stories); later Stories are larger and usage limits slow it."
else
  echo "Progress: $done/$total Stories done ($pct%). No Story merged in the last $days days, so no estimate."
fi
