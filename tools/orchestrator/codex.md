# Running this iteration on Codex

`run.sh` is running the iteration below with the Codex CLI instead of Claude Code (`XARAVEL_ORCH_CLI=codex`; `decisions/MAINT-2026-10-25-codex-fallback.md`). Everything in the iteration applies. These notes map its Claude Code parts to Codex, and record what the 2026-10-25 trial runs taught. Where a note and the iteration conflict, the note wins only for the tool mechanics it names.

1. **Skills.** The BMAD skills are in `.agents/skills`, a copy of `.claude/skills` that `run.sh` makes before each iteration. Load a skill the iteration names (`bmad-build-auto`, `bmad-retrospective`, …) by reading its `SKILL.md` and following it, including its `uv run` renderer.
2. **Tools.**
   - Claude's Read, Edit and Bash are your shell and `apply_patch`.
   - Its Agent tool is `spawn_agent` plus `wait_agent`. Wait in the same turn, and never end the turn to wait for a subagent.
   - TaskCreate and ScheduleWakeup are not needed.
   - "Auto permission mode" is this sandbox plus `--approve-for-me`.
     - When the sandbox refuses a command the unit needs (`operation not permitted`, a write outside the writable roots, or a step too slow to finish inside it), request escalated permissions for that same command once, with a one-line justification.
     - Codex's automatic reviewer decides, as Claude's classifier does.
     - An approved command runs outside the sandbox. A reviewer denial counts as denied: do not retry it another way.
     - Never request escalation to change `~/.codex`, `~/.ssh`, git or `gh` credentials, launchd, or anything outside this clone and the state directory, beyond what the command needs.
3. **Edits.**
   - Keep each `apply_patch` small, a few hunks. Write or rewrite a large file from the shell (`cat > file <<'EOF'`) or with a short script.
   - If a tool call has not returned after 3 minutes, cancel it, check the file, and redo the change from the shell. A stalled call is not a denial.
4. **Subagents.**
   - The session has 4 slots, counting you. Run the review layers in batches that fit, two and then two.
   - A subagent that fails with "Selected model is at capacity": retry it once after a minute. Then record that layer as not run, and let the iteration's review rules decide.
5. **Sandbox.**
   - You may write in the clone (`.git` included), `$XARAVEL_ORCH_STATE`, `~/.cache`, `~/.claude`, `~/.bun`, `~/.config/gh` and `~/.codex`. The network is on. `~/.codex` is writable only so the Fidelity Review's Codex reviewer, a nested `codex exec`, can start. Never edit anything in it, `config.toml` and `auth.json` included.
   - Put temporary files, review diffs included, under `$TMPDIR` (`$XARAVEL_ORCH_STATE/tmp`), never `/tmp`.
   - `git push` and `gh` authenticate through `~/.config/gh/hosts.yml`.
   - The sandbox refuses some calls, such as `ps`, `pkill`, `nice`, `renice` and `setpriority`. When the unit needs one, for example to find and stop a hung harness run by its PID, escalate it as item 2 says.
   - If an optional diagnostic command is refused, skip it and go on. The iteration's rule "if an action is denied, do not retry it another way" applies to actions the unit needs, and only those stop the unit.
6. **Long commands.** Run the Fidelity Review and the full harness in the foreground and wait for them: they take minutes. Never background them and poll. The full harness spawns many processes (`tsc`, the tools' CLIs), and inside the sandbox some infrastructure tests time out, XT-conformance-135 among them. Request escalation to run `bun run harness` outside the sandbox (item 2) before treating such a timeout as a failure.
7. **The workflow's own writes are not a dirty tree.** Some steps write tracked files before a later clean-tree check, for example step-01's context compilation refreshing `epic-<N>-context.md`. Commit them on the unit's branch (`<id>: refresh epic context`), then pass the check.
8. **One spec per Story.** When resuming a unit whose spec exists, invoke `bmad-build-auto` with that spec file's path, so step-01 takes its early exit and updates the spec in place. Never create a second spec such as `…-2.md`: `story:check` requires exactly one per Story. A spec with `status: blocked` makes step-01 halt. When sprint status shows the unit `in-progress` again because its blocker is resolved on `main` (a ruling merged, a tool fixed), first set the spec's `status` to where the work stopped: `in-review` when implementation was complete and only the review was missing, otherwise `draft`, which re-plans with the rulings. Record that in its Change Log, then invoke `bmad-build-auto`. This is the resume transition the Claude loop has used since Story 14.1.
9. **Fidelity Review.** Pass `--loop-cli codex`. Reviewer 1 is then Claude, or Codex if Claude is unavailable, with the reason recorded (`docs/ops/fidelity-review.md`).
10. **Commit trailer.** End each commit message with `Co-Authored-By: Codex <noreply@openai.com>`, in place of the Claude trailer the iteration names.

The orchestrator iteration follows.

---

