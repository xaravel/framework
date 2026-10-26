# Codex trial: read this first

This is a **trial run** of one orchestrator iteration on the Codex CLI, instead of Claude Code. It shows whether the loop can keep going on Codex when the Maintainer's Claude compute runs out. The real Claude Code loop is working on the same repository on GitHub at the same time. This run must not affect it.

## Hard rules for this trial

These override anything below that conflicts with them.

1. **Nothing leaves this clone.**
   - Never push, and never open, merge, close or comment on a PR or issue.
   - Never change anything on GitHub.
   - Pushing is disabled here and `gh` is signed out. If a step needs GitHub, note it in the report as "needs GitHub", treat its answer as "nothing new", and carry on.
   - Commit locally as the workflow says.
2. **Write only inside this clone and `$XARAVEL_ORCH_STATE`.**
3. **Keep the machine light.** Another loop runs on this host.
   - Run the harness only for the unit's own scope: `bun run harness --story <id>`, or `--fast` while iterating. Never run the full `bun run harness`.
   - Run at most one test process at a time.
   - The driver already runs this whole session at the lowest CPU priority. Never call `nice` or `renice` yourself: the sandbox refuses `setpriority`, and that refusal is not a reason to stop.
4. **Skills.** The BMAD skills are in `.agents/skills`, a copy of `.claude/skills`. Load a skill the way the instructions name it, for example `bmad-build-auto`. Where an instruction names a Claude Code tool you don't have (Agent, Skill, TaskCreate, ScheduleWakeup, auto permission mode), use your closest equivalent and record what you used. Use subagents for the subagent steps.
5. **The workflow's own writes are not a dirty tree.** Some steps write tracked files before a later clean-tree check, for example step-01's context compilation refreshing `epic-<N>-context.md`. Those files are the workflow's own output, so commit them on the unit's branch (`<id>: refresh epic context`), then pass the check. Only changes the workflow did not make count as dirty.
6. **Codex specifics.**
   - Write temporary files, review diffs included, under `$TMPDIR`, which is `$XARAVEL_ORCH_STATE/tmp`. Never use `/tmp` or another path outside the writable roots.
   - Keep each `apply_patch` small, a few hunks. Write or rewrite a large file from the shell (`cat > file <<'EOF'`) or with a short script.
   - The session has 4 subagent slots, counting you. Run the review layers in batches that fit, for example two and then two, and the Fidelity Review as a background shell command, not a subagent.
7. **Fidelity Review.** Run it as the workflow says, with `--loop-cli codex`. It then uses Claude for reviewer 1.
8. **Stop at the workflow's HALT.** Do one unit, as the iteration says.

## The report

Before you write the outcome word, write `$XARAVEL_ORCH_STATE/trial-report.md`. Give it these sections, a few lines each:

- **Unit:** what you picked and why.
- **Skills:** each skill you loaded, and how.
- **Subagents:** where the workflow asked for one, what you did, and whether it worked.
- **Tool gaps:** each instruction you could not follow as written, what you did instead, and what the orchestrator files would need to change.
- **Needs GitHub:** each step skipped because GitHub was unavailable.
- **Result:** where the unit got to, with the verification you ran and its output lines.
- **Verdict:** could an unattended Codex loop do this unit end to end, given GitHub access? Yes, no or partly, and why.

The orchestrator iteration follows.

---

