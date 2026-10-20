// pilot/porting: Story 8.7 pilot tooling, never merged.
//
// The static assertion floor (ESC-8.7-1 item 2). For each sampled Test ID it
// finds the `portedTest(...)` whose id is the Test ID without its `#<key>`,
// counts the assertion call sites in its body by kind, and compares them with
// the Inventory row's `assertions`:
//
//   this.assertX(...), Assert.assertX(...)   kind assertX
//   this.expectExceptionObject(...)          3 × assertThat (class, message, code; as PHPUnit records them)
//   this.expectException*(...) otherwise     1 × assertThat
//
// A kind below its Inventory count is `short`, unless the body carries an
// `adapted:DIV-<n>.<k>` marker, which names the floor `adapted:DIV-<n>.<k>`.
// A body that loops, asserts inside a nested callback, or is shared by dataset
// rows is `approximate` (when not short): its static count is not the executed
// one. Otherwise `met`. Prints a table and JSON (`--json`); exits 1 on any
// `short` or missing translation.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseSync } from "oxc-parser";

const root = resolve(import.meta.dir, "..");
const sample = JSON.parse(readFileSync(join(import.meta.dir, "sample.json"), "utf8")) as { strata: { name: string; ids: string[] }[] };

const inventory = new Map<string, Record<string, number>>();
for (const component of ["collections", "support"]) {
  for (const line of readFileSync(join(root, "conformance", "inventory", `${component}.jsonl`), "utf8").split("\n")) {
    if (line.trim() !== "") {
      const row = JSON.parse(line) as { id: string; assertions: Record<string, number> };
      inventory.set(row.id, row.assertions);
    }
  }
}

type Node = { type: string; [key: string]: unknown };
interface Found {
  counts: Record<string, number>;
  approximate: string[];
  markers: string[];
  file: string;
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}

function walk(node: unknown, visit: (node: Node, depth: number) => void, depth = 0): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child, visit, depth);
    }
    return;
  }
  if (!isNode(node)) {
    return;
  }
  visit(node, depth);
  const inner = node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression" || node.type === "FunctionDeclaration" ? depth + 1 : depth;
  for (const [key, value] of Object.entries(node)) {
    if (key !== "type" && typeof value === "object") {
      walk(value, visit, inner);
    }
  }
}

const LOOPS = new Set(["ForStatement", "ForOfStatement", "ForInStatement", "WhileStatement", "DoWhileStatement"]);

/** The value of a string literal or a template literal whose expressions are top-level string constants. */
function stringValue(node: unknown, constants: ReadonlyMap<string, string>): string | null {
  if (!isNode(node)) {
    return null;
  }
  if (node.type === "Literal" && typeof node["value"] === "string") {
    return node["value"];
  }
  if (node.type === "TemplateLiteral") {
    const quasis = node["quasis"] as { value: { cooked: string } }[];
    const expressions = node["expressions"] as Node[];
    let out = quasis[0]!.value.cooked;
    for (let i = 0; i < expressions.length; i++) {
      const expression = expressions[i]!;
      const value = expression.type === "Identifier" ? (constants.get(expression["name"] as string) ?? null) : null;
      if (value === null) {
        return null;
      }
      out += value + quasis[i + 1]!.value.cooked;
    }
    return out;
  }
  return null;
}

const found = new Map<string, Found>();
const dirs = ["packages/collections/tests/ported/framework/tests/Support", "packages/support/tests/ported/framework/tests/Support"];
for (const dir of dirs) {
  for (const name of readdirSync(join(root, dir)).filter((file) => file.endsWith(".test.ts"))) {
    const file = `${dir}/${name}`;
    const source = readFileSync(join(root, file), "utf8");
    const program = parseSync(file, source).program as unknown as { body: Node[] };
    const constants = new Map<string, string>();
    for (const statement of program.body) {
      if (statement.type === "VariableDeclaration") {
        for (const declaration of statement["declarations"] as Node[]) {
          const id = declaration["id"] as Node;
          const value = stringValue(declaration["init"], constants);
          if (id.type === "Identifier" && value !== null) {
            constants.set(id["name"] as string, value);
          }
        }
      }
    }
    walk(program, (node) => {
      if (node.type !== "CallExpression" || !isNode(node["callee"]) || (node["callee"] as Node)["name"] !== "portedTest") {
        return;
      }
      const args = node["arguments"] as Node[];
      const id = stringValue(args[0], constants);
      if (id === null) {
        throw new Error(`${file}: a portedTest id is not a constant string`);
      }
      const options = args[1]!;
      const body = args[2]!;
      const approximate: string[] = [];
      if (options.type === "ObjectExpression" && (options["properties"] as Node[]).some((p) => isNode(p["key"]) && (p["key"] as Node)["name"] === "dataset")) {
        approximate.push("shared by dataset rows");
      }
      const counts: Record<string, number> = {};
      const add = (kind: string, n: number): void => {
        counts[kind] = (counts[kind] ?? 0) + n;
      };
      walk(body["body"], (inner, depth) => {
        if (LOOPS.has(inner.type) && !approximate.includes("loops")) {
          approximate.push("loops");
        }
        if (inner.type !== "CallExpression" || !isNode(inner["callee"]) || (inner["callee"] as Node).type !== "MemberExpression") {
          return;
        }
        const callee = inner["callee"] as Node;
        const object = callee["object"] as Node;
        const property = callee["property"] as Node;
        const method = property.type === "Identifier" ? (property["name"] as string) : "";
        const receiver = object.type === "ThisExpression" ? "this" : object.type === "Identifier" ? (object["name"] as string) : "";
        let counted = false;
        if ((receiver === "this" || receiver === "Assert") && /^assert[A-Z]/.test(method)) {
          add(method, 1);
          counted = true;
        } else if (receiver === "this" && method === "expectExceptionObject") {
          add("assertThat", 3);
          counted = true;
        } else if (receiver === "this" && /^expectException/.test(method)) {
          add("assertThat", 1);
          counted = true;
        }
        if (counted && depth > 0 && !approximate.includes("asserts in a callback")) {
          approximate.push("asserts in a callback");
        }
      });
      const text = source.slice(body["start"] as number, body["end"] as number);
      const markers = [...new Set([...text.matchAll(/adapted:(DIV-\d+\.\d+)/g)].map((m) => m[1]!))];
      found.set(id, { counts, approximate, markers, file });
    });
  }
}

interface Row {
  id: string;
  stratum: string;
  floor: string;
  detail: string;
}
const rows: Row[] = [];
for (const stratum of sample.strata) {
  for (const id of stratum.ids) {
    const base = id.split("#")[0]!;
    const translation = found.get(base);
    const expected = inventory.get(id) ?? {};
    if (translation === undefined) {
      rows.push({ id, stratum: stratum.name, floor: "short", detail: "no portedTest for this id" });
      continue;
    }
    const shortfalls = Object.entries(expected)
      .filter(([kind, n]) => (translation.counts[kind] ?? 0) < n)
      .map(([kind, n]) => `${kind} ${translation.counts[kind] ?? 0}/${n}`);
    const counts = Object.entries(expected)
      .map(([kind, n]) => `${kind} ${translation.counts[kind] ?? 0}/${n}`)
      .join(", ");
    let floor = "met";
    if (shortfalls.length > 0) {
      floor = translation.markers.length > 0 ? `adapted:${translation.markers.join(",")}` : "short";
    } else if (translation.approximate.length > 0) {
      floor = "approximate";
    }
    rows.push({ id, stratum: stratum.name, floor, detail: `${counts}${translation.approximate.length > 0 ? `; ${translation.approximate.join(", ")}` : ""}` });
  }
}

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
} else {
  for (const row of rows) {
    process.stdout.write(`${row.floor.padEnd(12)} ${row.id}  (${row.detail})\n`);
  }
  const tally = new Map<string, number>();
  for (const row of rows) {
    tally.set(row.floor, (tally.get(row.floor) ?? 0) + 1);
  }
  process.stdout.write(`FLOOR ${rows.length} ids: ${[...tally].map(([k, n]) => `${k} ${n}`).join(", ")}\n`);
}
process.exit(rows.some((row) => row.floor === "short") ? 1 : 0);
