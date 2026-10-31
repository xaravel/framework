---
status: blocked
unit: epic-15-retro-item-5-getenv-equals-name
---

# BMad Build Auto Result

Status: blocked
Blocking condition: the item asks for an Oracle probe row, and no route within its scope can produce one. The Oracle image (`php:8.5.11-cli-trixie`, glibc) cannot run on this host (no Docker). The host's PHP 8.5.11 runs on macOS libc, which gives `"bar=baz"` for `getenv("FOO=bar")` and even for `getenv("FOO=b")`, so a host probe record would pin the wrong libc. Per-Story Oracle requests (`conformance/oracle-requests/<story-id>.jsonl`, `oracle.yml`) run only for a `story/*` branch, and an action item has none. The CI `php-fixtures` job runs in the Oracle image but only on a fixed list of tests in `.github/workflows/ci.yml`, a Protected Path. The questions are under finding L3 in `_bmad-output/implementation-artifacts/epic-15-retro-2026-10-30.md`.
