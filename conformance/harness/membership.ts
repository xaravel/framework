// Variant membership of a Ported Test (retro epic-5 item 14, ESC-5.3-4, AD-15).
//
// `membership(dir, variant)` returns `(id) => boolean`: whether the full Test
// ID `id` (`<id>` or `<id>#<key>`; Inventory IDs are per dataset row) belongs
// to `variant`, that is whether its Inventory `backends` list `variant`
// (AD-15: "Variants: from the Test Inventory's `backends`"). An ID that is not
// in the Inventory belongs to every Variant, so the harness reports it as
// `UNKNOWN` instead of hiding it.
//
// It is lazy: the first call reads every `*.jsonl` in `dir` except
// `oracle-nondeterminism.jsonl` (which is not Inventory entries), one
// `JSON.parse` per non-empty line, taking only `id` and `backends`. A
// malformed line throws on that call, naming the file and the line. The
// preload (./preload.ts) installs the result as
// `Symbol.for('xaravel.harness.member')`; it is the child process's only
// Inventory reader, and it imports nothing from tools/ so a Ported Test run
// loads no tooling.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The Oracle's nondeterminism record, which lives beside the Inventory files (tools/inventory's `NONDETERMINISM_FILE`). */
const NONDETERMINISM_FILE = "oracle-nondeterminism.jsonl";

/** The full Test IDs of `dir`'s Inventory, each with its `backends`. */
function readBackends(dir: string): Map<string, ReadonlySet<string>> {
  const backends = new Map<string, ReadonlySet<string>>();
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl") && name !== NONDETERMINISM_FILE)
    .sort();
  for (const name of names) {
    const lines = readFileSync(join(dir, name), "utf8").split("\n");
    lines.forEach((text, index) => {
      if (text.trim() === "") {
        return;
      }
      const where = `${join(dir, name)}:${index + 1}`;
      let record: unknown;
      try {
        record = JSON.parse(text);
      } catch (error) {
        throw new Error(`Inventory line ${where} is malformed: ${error instanceof Error ? error.message : String(error)}`);
      }
      const value = typeof record === "object" && record !== null && !Array.isArray(record) ? (record as Record<string, unknown>) : null;
      const id = value?.["id"];
      const list = value?.["backends"];
      if (typeof id !== "string" || !Array.isArray(list) || !list.every((item) => typeof item === "string")) {
        throw new Error(`Inventory line ${where} is malformed: it needs a string "id" and a "backends" list of strings`);
      }
      backends.set(id, new Set(list as string[]));
    });
  }
  return backends;
}

/** Whether a full Test ID belongs to `variant`, from the Inventory in `dir` (see the header). */
export function membership(dir: string, variant: string): (id: string) => boolean {
  let backends: Map<string, ReadonlySet<string>> | null = null;
  return (id: string): boolean => {
    backends ??= readBackends(dir);
    const list = backends.get(id);
    return list === undefined || list.has(variant);
  };
}
