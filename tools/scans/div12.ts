// The DIV-12 property/method pair scan (Story 3.7; `PORTING.md` reads it,
// AD-7, AD-26).
//
//   bun tools/scans/div12.ts [--check] [--root <dir>]
//       reads `conformance/upstream/` only (it runs no PHP and no container) and writes
//       `conformance/scans/div12-pairs.jsonl`: one line per indexed class, trait
//       or enum D (not interfaces) and name N that is both a property and a
//       method in D's member set (case-sensitive),
//       `{"class","name","classification","property","method"}`, sorted by
//       `class`, then `name`.
//
//       - D's member set is its own methods and properties, those of the
//         traits it uses, and those of its indexed ancestors and their traits,
//         transitively. Promoted constructor properties are properties.
//       - `property` and `method` are `{"declaredIn","static"}`: the nearest
//         declaration that declares the member, in the order D, D's traits,
//         then each ancestor followed by its traits.
//       - `classification`, first match wins (ESC-3.7-1):
//         - Model hierarchy: D is `Illuminate\Database\Eloquent\Model`, a class
//           whose chain reaches it, or a trait in Model's transitive trait set.
//           N = `casts` is `option-pair` (AD-7); every other N is `model-config`;
//         - `option-pair`: N is an option name and D is an option holder. An
//           option name is one of AD-26's named option pairs, or a name read in
//           the `src/` trees as `method_exists($v, 'N')` together with a
//           property read `$v->N` (not followed by `(` or an assignment
//           operator) on one plain, non-`$this` variable in one method body.
//           An option holder is a class or trait whose hierarchy implements
//           `ShouldQueue` or `ShouldBroadcast` (directly or through an indexed
//           interface), uses `Illuminate\Bus\Queueable`, or whose chain
//           reaches `Illuminate\Mail\Mailable` or
//           `Illuminate\Notifications\Notification`;
//         - `method-plus-state`: otherwise.
//
//   … --check
//       builds the file in memory and compares it byte for byte with the
//       committed one: a `div12 drift: <file> …` line when it differs or is
//       missing. It writes nothing.
//
// Exit codes: 0 pass, 1 any failure (nothing is written), 2 usage error.
import { compareUnits, renderJson } from "../oracle/request";
import { runScan } from "./facades";
import { ancestors, buildIndex, codeRange, COMPOUND_ASSIGNMENTS, extendsChainReaches, matching, type Declaration, type Index, type Method } from "./php";

export const DIV12_FILE = "conformance/scans/div12-pairs.jsonl";
export const MODEL = "Illuminate\\Database\\Eloquent\\Model";

/** AD-26's named option pairs. */
export const AD26_OPTION_NAMES: readonly string[] = ["casts", "middleware", "backoff", "tries", "timeout", "uniqueId", "uniqueFor", "retryUntil", "attachments", "envelope", "content", "via", "broadcastOn"];
/** The interfaces whose implementers are option holders (directly or through an indexed interface that extends one). */
const HOLDER_INTERFACES: readonly string[] = ["Illuminate\\Contracts\\Queue\\ShouldQueue", "Illuminate\\Contracts\\Broadcasting\\ShouldBroadcast"];
const HOLDER_TRAIT = "Illuminate\\Bus\\Queueable";
const HOLDER_BASES: readonly string[] = ["Illuminate\\Mail\\Mailable", "Illuminate\\Notifications\\Notification"];

export type Classification = "option-pair" | "model-config" | "method-plus-state";

export interface MemberSource {
  declaredIn: string;
  static: boolean;
}

export interface Div12Pair {
  class: string;
  name: string;
  classification: Classification;
  property: MemberSource;
  method: MemberSource;
}

/** `decl`'s traits, transitively, in use order (depth first), each once, indexed ones only. */
function traitsOf(index: Index, decl: Declaration, seen: Set<string>): Declaration[] {
  const out: Declaration[] = [];
  for (const name of decl.traits) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    const trait = index.byFqcn.get(name);
    if (trait === undefined) {
      continue;
    }
    out.push(trait, ...traitsOf(index, trait, seen));
  }
  return out;
}

/** The declarations whose members D has, nearest first: D, its traits, then each ancestor and its traits. */
export function memberDeclarations(index: Index, decl: Declaration): Declaration[] {
  const seen = new Set<string>([decl.fqcn]);
  const out: Declaration[] = [];
  for (const level of [decl, ...ancestors(index, decl)]) {
    if (level !== decl) {
      if (seen.has(level.fqcn)) {
        continue;
      }
      seen.add(level.fqcn);
    }
    out.push(level, ...traitsOf(index, level, seen));
  }
  return out;
}

const VISIBILITY: ReadonlySet<string> = new Set(["public", "protected", "private", "readonly"]);

/** The properties a constructor promotes. */
export function promotedProperties(decl: Declaration, method: Method): string[] {
  if (method.name.toLowerCase() !== "__construct") {
    return [];
  }
  const { tokens } = decl;
  const code = codeRange(tokens, method.start, method.end);
  const fn = code.findIndex((j) => tokens[j]!.kind === "name" && tokens[j]!.text.toLowerCase() === "function");
  const open = code.findIndex((j, k) => k > fn && tokens[j]!.text === "(");
  if (fn === -1 || open === -1) {
    return [];
  }
  const close = matching(tokens, code[open]!, decl.file) - 1;
  const out: string[] = [];
  let depth = 0;
  let promoted = false;
  let variable: string | null = null;
  const flush = (): void => {
    if (promoted && variable !== null) {
      out.push(variable);
    }
    promoted = false;
    variable = null;
  };
  for (let k = open + 1; code[k]! < close; k++) {
    const t = tokens[code[k]!]!;
    if (t.kind === "punct" && (t.text === "(" || t.text === "[" || t.text === "{")) {
      depth++;
    } else if (t.kind === "punct" && (t.text === ")" || t.text === "]" || t.text === "}")) {
      depth--;
    } else if (depth === 0 && t.kind === "punct" && t.text === ",") {
      flush();
    } else if (depth === 0 && t.kind === "name" && VISIBILITY.has(t.text.toLowerCase())) {
      promoted = true;
    } else if (depth === 0 && t.kind === "variable" && variable === null) {
      variable = t.text.slice(1);
    }
  }
  flush();
  return out;
}

/** The option names read in a method body: `method_exists($v, 'N')` plus a property read `$v->N` on one plain, non-`$this` variable. */
export function optionReads(decl: Declaration, method: Method): Set<string> {
  const out = new Set<string>();
  if (method.bodyStart < 0) {
    return out;
  }
  const { tokens } = decl;
  const code = codeRange(tokens, method.bodyStart, method.end);
  const at = (k: number): { kind: string; text: string; value?: string | null } => tokens[code[k]!] ?? { kind: "", text: "" };
  const reads = new Map<string, Set<string>>();
  const checks = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, receiver: string, name: string): void => {
    let set = map.get(receiver);
    if (set === undefined) {
      set = new Set();
      map.set(receiver, set);
    }
    set.add(name);
  };
  const plain = (k: number): boolean => at(k).kind === "variable" && at(k).text !== "$this" && at(k - 1).text !== "::" && at(k - 1).text !== "->" && at(k - 1).text !== "?->";
  for (let k = 0; k < code.length; k++) {
    const t = at(k);
    if (plain(k) && at(k + 1).text === "->" && at(k + 2).kind === "name") {
      const after = at(k + 3).text;
      if (after !== "(" && after !== "=" && !COMPOUND_ASSIGNMENTS.has(after)) {
        add(reads, t.text, at(k + 2).text);
      }
      continue;
    }
    if (
      t.kind === "name" &&
      (t.text.toLowerCase() === "method_exists" || t.text.toLowerCase() === "\\method_exists") &&
      at(k - 1).text !== "->" &&
      at(k - 1).text !== "?->" &&
      at(k - 1).text !== "::" &&
      at(k + 1).text === "(" &&
      plain(k + 2) &&
      at(k + 3).text === "," &&
      at(k + 4).kind === "string" &&
      typeof at(k + 4).value === "string" &&
      at(k + 5).text === ")"
    ) {
      add(checks, at(k + 2).text, at(k + 4).value!);
    }
  }
  for (const [receiver, names] of reads) {
    const checked = checks.get(receiver);
    if (checked === undefined) {
      continue;
    }
    for (const name of names) {
      if (checked.has(name)) {
        out.add(name);
      }
    }
  }
  return out;
}

/** The option names: AD-26's named pairs plus every option name read in the `src/` trees. */
export function optionNames(index: Index): Set<string> {
  const out = new Set<string>(AD26_OPTION_NAMES);
  for (const parsed of index.files) {
    for (const decl of parsed.declarations) {
      for (const method of decl.methods) {
        for (const name of optionReads(decl, method)) {
          out.add(name);
        }
      }
    }
  }
  return out;
}

/** The traits in Model's transitive trait set (its own and its ancestors'). */
function modelTraits(index: Index): Set<string> {
  const model = index.byFqcn.get(MODEL);
  if (model === undefined) {
    return new Set();
  }
  return new Set(
    memberDeclarations(index, model)
      .filter((decl) => decl.kind === "trait")
      .map((decl) => decl.fqcn),
  );
}

/** Whether an interface is, or extends through indexed interfaces, one of the holder interfaces. */
function reachesHolderInterface(index: Index, name: string, seen: Set<string>): boolean {
  if (HOLDER_INTERFACES.includes(name)) {
    return true;
  }
  if (seen.has(name)) {
    return false;
  }
  seen.add(name);
  const decl = index.byFqcn.get(name);
  return decl !== undefined && decl.kind === "interface" && decl.implements.some((parent) => reachesHolderInterface(index, parent, seen));
}

/** Whether a class or trait is an option holder (AD-26, ESC-3.7-1). */
export function isOptionHolder(index: Index, decl: Declaration): boolean {
  if (decl.kind !== "class" && decl.kind !== "trait") {
    return false;
  }
  const hierarchy = memberDeclarations(index, decl);
  const seen = new Set<string>();
  return (
    hierarchy.some((level) => level.traits.includes(HOLDER_TRAIT) || level.implements.some((name) => reachesHolderInterface(index, name, seen))) ||
    (decl.kind === "class" && HOLDER_BASES.some((base) => extendsChainReaches(index, decl, base)))
  );
}

/** The classification rule (ESC-3.7-1), first match wins: the Model hierarchy, then option-pair, then method-plus-state. */
export function classifier(index: Index): (decl: Declaration, name: string) => Classification {
  const options = optionNames(index);
  const traitsOfModel = modelTraits(index);
  const holders = new Map<Declaration, boolean>();
  return (decl, name) => {
    const isModel = decl.fqcn === MODEL || (decl.kind === "class" && extendsChainReaches(index, decl, MODEL)) || (decl.kind === "trait" && traitsOfModel.has(decl.fqcn));
    if (isModel) {
      return name === "casts" ? "option-pair" : "model-config";
    }
    if (options.has(name)) {
      let holder = holders.get(decl);
      if (holder === undefined) {
        holder = isOptionHolder(index, decl);
        holders.set(decl, holder);
      }
      if (holder) {
        return "option-pair";
      }
    }
    return "method-plus-state";
  };
}

/** The DIV-12 pairs of the index, sorted by class, then name. */
export function div12Pairs(index: Index): Div12Pair[] {
  const classify = classifier(index);
  const pairs: Div12Pair[] = [];
  for (const decl of index.byFqcn.values()) {
    if (decl.kind === "interface") {
      continue;
    }
    const properties = new Map<string, MemberSource>();
    const methods = new Map<string, MemberSource>();
    for (const level of memberDeclarations(index, decl)) {
      for (const method of level.methods) {
        if (!methods.has(method.name)) {
          methods.set(method.name, { declaredIn: level.fqcn, static: method.static });
        }
      }
      for (const property of level.properties) {
        if (!properties.has(property.name)) {
          properties.set(property.name, { declaredIn: level.fqcn, static: property.static });
        }
      }
      for (const method of level.methods) {
        for (const name of promotedProperties(level, method)) {
          if (!properties.has(name)) {
            properties.set(name, { declaredIn: level.fqcn, static: false });
          }
        }
      }
    }
    for (const [name, property] of properties) {
      const method = methods.get(name);
      if (method === undefined) {
        continue;
      }
      pairs.push({ class: decl.fqcn, name, classification: classify(decl, name), property, method });
    }
  }
  return pairs.sort((a, b) => compareUnits(a.class, b.class) || compareUnits(a.name, b.name));
}

export function renderPair(pair: Div12Pair): string {
  return renderJson({
    class: pair.class,
    name: pair.name,
    classification: pair.classification,
    property: { declaredIn: pair.property.declaredIn, static: pair.property.static },
    method: { declaredIn: pair.method.declaredIn, static: pair.method.static },
  });
}

/** Builds `div12-pairs.jsonl` from the snapshot under `root`. */
export function buildDiv12(root: string, index: Index = buildIndex(root)): { text: string; pairs: Div12Pair[] } {
  const pairs = div12Pairs(index);
  return { text: pairs.map((pair) => `${renderPair(pair)}\n`).join(""), pairs };
}

const USAGE = ["Usage:", "  bun tools/scans/div12.ts [--check] [--root <dir>]"].join("\n");

export function main(argv: readonly string[]): number {
  return runScan("div12", argv, USAGE, (root) => {
    const { text, pairs } = buildDiv12(root);
    const count = (c: Classification): number => pairs.filter((pair) => pair.classification === c).length;
    return {
      files: new Map([[DIV12_FILE, text]]),
      summary: `${pairs.length} pairs (${count("option-pair")} option-pair, ${count("model-config")} model-config, ${count("method-plus-state")} method-plus-state)`,
    };
  });
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
