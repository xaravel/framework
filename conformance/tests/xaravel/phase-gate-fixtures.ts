// Fixtures for the Phase 1 gate tests (Story 8.8): a hermetic base checkout
// with the gate open. Shared by phase-gate.test.ts, ownership.test.ts and
// ownership-lines.test.ts; a plain module, so importing it registers no tests.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DIV_RECORDS, PHASE_0_EXIT, PILOT_REPORT } from "../../../tools/ownership/phase-gate";
import { DIV12_FILE, FIXTURE_FILE, PORTING_FILE, SPINE_FILE } from "../../../tools/porting/porting";

const root = resolve(import.meta.dir, "..", "..", "..");

/** A Maintainer-signed `PHASE-0-EXIT.md` in the form of the `MAINT-*` rulings; a fixture, never the real file. */
export const SIGNED_EXIT = "---\ndecision: approved\ndecided_by: Maintainer\ndate: 2026-10-20\n---\n\n# Phase 0 exit\n\nThe Maintainer accepts Phase 0 as complete.\n";

/** Every repo-relative file `checkPorting` and the gate read on the real root: the gate inputs and the files they are checked against. */
export function gateInputs(): string[] {
  const requests = new Set<string>();
  for (const line of readFileSync(join(root, FIXTURE_FILE), "utf8").split("\n")) {
    if (line.trim() !== "") {
      const source = (JSON.parse(line) as { source: string }).source;
      const match = /^(conformance\/oracle\/requests\/[^/#]+\.jsonl)#/.exec(source);
      if (match !== null) {
        requests.add(match[1]!);
      }
    }
  }
  return [PORTING_FILE, SPINE_FILE, DIV12_FILE, FIXTURE_FILE, ...[...requests].sort(), ...DIV_RECORDS, PILOT_REPORT];
}

/** Writes `text` to `rel` under `dir`, creating its directory. */
export function put(dir: string, rel: string, text: string): void {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
}

/** Copies the real gate inputs into `dir` and writes `exit` as `PHASE-0-EXIT.md`, so the Phase 1 gate is open on that base. */
export function writeGateInputs(dir: string, exit: string = SIGNED_EXIT): void {
  for (const rel of gateInputs()) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    copyFileSync(join(root, rel), join(dir, rel));
  }
  put(dir, PHASE_0_EXIT, exit);
}

/** A new temp base checkout with the Phase 1 gate open. The caller removes it. */
export function gateRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "xt-phase-gate-"));
  writeGateInputs(dir);
  return dir;
}
