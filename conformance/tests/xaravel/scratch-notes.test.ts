// Xaravel Test for Epic 13 retrospective item 4 (decisions/MAINT-2026-10-25-epic-13-items.md): a committed
// `bmad-build-auto-result-*.md` note names its unit, and is deleted in the PR that marks that unit done.
import { expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const ARTIFACTS = "_bmad-output/implementation-artifacts";
const NOTE = /^bmad-build-auto-result-.+\.md$/;

interface SprintStatus {
  development_status: Record<string, string>;
  action_items: { id: string; status: string }[];
}

/** Each unit's status: sprint keys from `development_status`, action item ids from `action_items`. */
function unitStatuses(text: string): Map<string, string> {
  const status = Bun.YAML.parse(text) as SprintStatus;
  const units = new Map(Object.entries(status.development_status));
  for (const item of status.action_items) {
    units.set(item.id, item.status);
  }
  return units;
}

/** The problem with one note, or null: it must name a known unit that is not done. */
export function noteProblem(file: string, text: string, units: ReadonlyMap<string, string>): string | null {
  const unit = /^---\n[\s\S]*?^unit:\s*"?([^"\n]+?)"?\s*$[\s\S]*?^---$/m.exec(text)?.[1];
  if (unit === undefined) {
    return `${file}: no \`unit:\` in its frontmatter (the action item id or sprint key it records)`;
  }
  const status = units.get(unit);
  if (status === undefined) {
    return `${file}: unit ${unit} is neither a sprint key nor an action item id`;
  }
  return status === "done" ? `${file}: unit ${unit} is done, so the note must be deleted in the PR that marks it done` : null;
}

xaravelTest("XT-conformance-1000", "every committed bmad-build-auto-result note names its unit, and none outlives a unit that is done (Epic 13 retro item 4)", () => {
  const units = unitStatuses(readFileSync(join(root, ARTIFACTS, "sprint-status.yaml"), "utf8"));
  const problems = readdirSync(join(root, ARTIFACTS))
    .filter((name) => NOTE.test(name))
    .map((name) => noteProblem(`${ARTIFACTS}/${name}`, readFileSync(join(root, ARTIFACTS, name), "utf8"), units))
    .filter((problem) => problem !== null);
  expect(problems).toEqual([]);

  // The rule itself, on fixtures.
  const fixture = new Map([["13-1-reflector", "in-progress"], ["epic-13-retro-item-1-x", "open"], ["epic-12-item-1-y", "done"]]);
  const note = (unit: string | null): string => `---\nstatus: blocked\n${unit === null ? "" : `unit: ${unit}\n`}---\n\n# BMad Build Auto Result\n`;
  expect(noteProblem("n.md", note("13-1-reflector"), fixture)).toBeNull();
  expect(noteProblem("n.md", note('"epic-13-retro-item-1-x"'), fixture)).toBeNull();
  expect(noteProblem("n.md", note("epic-12-item-1-y"), fixture)).toContain("is done");
  expect(noteProblem("n.md", note("nope"), fixture)).toContain("neither a sprint key nor an action item id");
  expect(noteProblem("n.md", note(null), fixture)).toContain("no `unit:`");
  // `unit:` outside the frontmatter does not count.
  expect(noteProblem("n.md", "---\nstatus: blocked\n---\n\nunit: 13-1-reflector\n", fixture)).toContain("no `unit:`");
});
