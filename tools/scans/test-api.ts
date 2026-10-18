// The test-API usage scan (Story 3.7; the grader coverage reports of Stories
// 4.4 and 4.6 read it, FR-116, FR-100).
//
//   bun tools/scans/test-api.ts [--check] [--root <dir>]
//       reads `conformance/upstream/` and the committed Inventory only (it runs
//       no PHP and no container) and writes two files. The suites are every
//       `.php` file (not `.blade.php`) under each repository's `tests/`, walked
//       in sorted order.
//
//       `conformance/scans/phpunit-assertions.jsonl`, `{"name","calls","executions"}`
//       per name, sorted by name (ESC-3.7-1):
//       - N matches `assert[A-Z]…` or `expect[A-Z]…`, is `fail`,
//         `markTestSkipped` or `markTestIncomplete`, or matches an Inventory
//         kind case-insensitively;
//       - `calls` counts `$this->N(`, `self::N(`, `static::N(` and `parent::N(`
//         inside a suite class C, unless C's indexed hierarchy (C, its
//         ancestors and the traits they use, transitively, among the `src/` and
//         `tests/` declarations) declares N as a method, case-insensitively;
//         plus `X::N(` where X resolves to `PHPUnit\Framework\Assert`,
//         `PHPUnit\Framework\TestCase` or an indexed class whose chain reaches
//         `PHPUnit\Framework\Assert`;
//       - names group case-insensitively, spelled as the matching Inventory
//         kind, else as their first call site in walk order;
//       - `executions` sums `assertions[N]` over every
//         `conformance/inventory/<component>.jsonl` (not the non-determinism
//         file); a null `assertions` (a test the baseline did not run) adds nothing.
//       A name is listed when either count is above 0. Names with calls but no
//       executions are printed for review.
//
//       `conformance/scans/mockery-api.jsonl`, `{"name","static","count"}` per
//       Mockery method, sorted by name, `false` before `true`. Names group
//       case-insensitively, as PHP calls them, spelled as their first call site
//       in walk order:
//       - static: `X::N(` where X resolves to `Mockery`. After its `)`, only a
//         chain starter starts a chain; any other `->M(` is not counted;
//       - chain: from `->E(`, or a facade's `X::E(`, for a chain starter E
//         (`allows` and `expects` with arguments only when the first is a
//         string literal or `[`). E counts, and so does every following `->M(`
//         in the chain, except the mocked method right after an argument-less
//         `shouldReceive()`, `shouldHaveReceived()`, `shouldNotHaveReceived()`,
//         `allows()` or `expects()`. Argument lists are skipped. The chain ends
//         at the first token after a `)` that is not `->`.
//
//   … --check
//       builds both files in memory and compares them byte for byte with the
//       committed ones: a `test-api drift: <file> …` line when one differs or
//       is missing. It writes nothing.
//
// Exit codes: 0 pass, 1 any failure (nothing is written), 2 usage error.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NONDETERMINISM_FILE } from "../inventory/inventory";
import { compareUnits, renderJson } from "../oracle/request";
import { UPSTREAM_REPOS, upstreamPath } from "../upstream/upstream";
import { memberDeclarations } from "./div12";
import { FACADE_BASE, runScan } from "./facades";
import { buildIndex, codeIndexes, extendsChainReaches, matching, parseFile, parseUse, phpFiles, resolveName, ScanError, type Declaration, type Index, type NameScope, type ParsedFile } from "./php";

export const ASSERTIONS_FILE = "conformance/scans/phpunit-assertions.jsonl";
export const MOCKERY_FILE = "conformance/scans/mockery-api.jsonl";
const INVENTORY_DIR = "conformance/inventory";

const PHPUNIT_ASSERT = "PHPUnit\\Framework\\Assert";
const PHPUNIT_CLASSES: ReadonlySet<string> = new Set([PHPUNIT_ASSERT, "PHPUnit\\Framework\\TestCase"]);
const RELATIVE: ReadonlySet<string> = new Set(["self", "static", "parent"]);
const ASSERTION = /^(?:assert|expect)[A-Z]/;
/** PHPUnit names outside the `assert`/`expect` pattern, lowercased. */
const EXTRA_ASSERTIONS: ReadonlySet<string> = new Set(["fail", "marktestskipped", "marktestincomplete"]);
const MOCKERY = "Mockery";

/** The methods that start a Mockery expectation chain. */
export const CHAIN_STARTERS: ReadonlySet<string> = new Set([
  "shouldReceive",
  "shouldNotReceive",
  "shouldHaveReceived",
  "shouldNotHaveReceived",
  "shouldHaveBeenCalled",
  "shouldNotHaveBeenCalled",
  "shouldIgnoreMissing",
  "shouldAllowMockingProtectedMethods",
  "shouldAllowMockingMethod",
  "shouldDeferMissing",
  "makePartial",
  "allows",
  "expects",
]);
/** The chain starters that, given arguments, need a string literal or `[` as their first one. */
const ARGUMENT_STARTERS: ReadonlySet<string> = new Set(["allows", "expects"]);
/** The chain starters after which, argument-less, the next `->M(` is the mocked method. */
const MOCKED_METHOD_STARTERS: ReadonlySet<string> = new Set(["shouldReceive", "shouldHaveReceived", "shouldNotHaveReceived", "allows", "expects"]);

export interface AssertionLine {
  name: string;
  calls: number;
  executions: number;
}

export interface MockeryLine {
  name: string;
  static: boolean;
  count: number;
}

/** Every suite file of the four repositories, parsed, in walk order. */
export function suiteFiles(root: string): ParsedFile[] {
  const out: ParsedFile[] = [];
  for (const { name } of UPSTREAM_REPOS) {
    const tests = upstreamPath(root, name, "tests");
    if (!existsSync(tests)) {
      continue;
    }
    for (const rel of phpFiles(tests, root)) {
      out.push(parseFile(readFileSync(join(root, rel), "utf8"), rel.split("\\").join("/")));
    }
  }
  return out;
}

/** The suite-plus-`src/` index: `src/` first, then the suites' declarations (the first declaration of a FQCN wins). */
export function combinedIndex(index: Index, suites: readonly ParsedFile[]): Index {
  const byFqcn = new Map(index.byFqcn);
  for (const parsed of suites) {
    for (const decl of parsed.declarations) {
      if (!byFqcn.has(decl.fqcn)) {
        byFqcn.set(decl.fqcn, decl);
      }
    }
  }
  return { byFqcn, files: [...index.files, ...suites] };
}

/** How a suite file's call sites are judged. */
export interface UsageContext {
  /** The `src/` index (facades). */
  index: Index;
  /** The `src/` and `tests/` index (PHPUnit hierarchies and `Assert` subclasses). */
  combined: Index;
  /** The Inventory kinds, by lowercased name. */
  kinds: ReadonlyMap<string, string>;
  /** The lowercased method names declared in each suite class's indexed hierarchy, cached. */
  hierarchies: Map<Declaration, Set<string>>;
}

/** Whether `name` is a PHPUnit assertion name (ESC-3.7-1). */
function isAssertionName(name: string, kinds: ReadonlyMap<string, string>): boolean {
  const lower = name.toLowerCase();
  return ASSERTION.test(name) || EXTRA_ASSERTIONS.has(lower) || kinds.has(lower);
}

/** The lowercased method names declared in `decl`'s indexed hierarchy: itself, its ancestors and the traits they use, transitively. */
function hierarchyMethods(context: UsageContext, decl: Declaration): Set<string> {
  let out = context.hierarchies.get(decl);
  if (out === undefined) {
    out = new Set(memberDeclarations(context.combined, decl).flatMap((level) => level.methods.map((method) => method.name.toLowerCase())));
    context.hierarchies.set(decl, out);
  }
  return out;
}

const STATEMENT_START: ReadonlySet<string> = new Set([";", "{", "}"]);

/** The call sites one suite file holds. `assertions` and `mockery` are keyed by lowercased name, holding the first call site's spelling. */
export function fileUsage(parsed: ParsedFile, context: UsageContext, assertions: Map<string, { name: string; calls: number }>, mockery: Map<string, { name: string; count: number }>): void {
  const { tokens, file } = parsed;
  const code = codeIndexes(tokens);
  const text = (k: number): string => (k >= 0 && k < code.length ? tokens[code[k]!]!.text : "");
  const kind = (k: number): string => (k >= 0 && k < code.length ? tokens[code[k]!]!.kind : "");
  const mock = (name: string, isStatic: boolean): void => {
    const key = `${name.toLowerCase()}\u0000${isStatic ? "1" : "0"}`;
    const line = mockery.get(key);
    if (line === undefined) {
      mockery.set(key, { name, count: 1 });
    } else {
      line.count++;
    }
  };
  /** The code index after the `)` of the argument list opening at code index `open`. */
  const after = (open: number): number => code.indexOf(matching(tokens, code[open]!, file) - 1, open) + 1;
  /** Whether the argument list opening at code index `open` is empty. */
  const empty = (open: number): boolean => text(open + 1) === ")";
  /** Method-name tokens already counted or skipped by a chain. */
  const handled = new Set<number>();
  /**
   * Counts the chain from the starter E at code index `at` (its `(` at `at + 1`): E itself, then every
   * `->M(` that follows. After an argument-less mocked-method starter, the next `->M(` is skipped.
   */
  const chain = (at: number): void => {
    let name = text(at);
    let open = at + 1;
    mock(name, false);
    handled.add(at);
    for (;;) {
      let m = after(open);
      if (MOCKED_METHOD_STARTERS.has(name) && empty(open) && text(m) === "->" && kind(m + 1) === "name" && text(m + 2) === "(") {
        // The mocked method: not Mockery API.
        handled.add(m + 1);
        m = after(m + 2);
      }
      if (!(text(m) === "->" && kind(m + 1) === "name" && text(m + 2) === "(")) {
        return;
      }
      name = text(m + 1);
      open = m + 2;
      mock(name, false);
      handled.add(m + 1);
    }
  };
  /** Whether a chain starter at code index `k` starts a chain (`allows`/`expects` need no argument, a string literal or `[`). */
  const starts = (k: number): boolean => CHAIN_STARTERS.has(text(k)) && (!ARGUMENT_STARTERS.has(text(k)) || empty(k + 1) || kind(k + 2) === "string" || text(k + 2) === "[");
  /** The innermost suite class declaration holding token index `j`. */
  const enclosing = (j: number): Declaration | null => {
    let found: Declaration | null = null;
    for (const decl of parsed.declarations) {
      if (j > decl.start && j < decl.end && (found === null || decl.start > found.start)) {
        found = decl;
      }
    }
    return found;
  };
  const isFacade = (fqcn: string): boolean => {
    const decl = context.index.byFqcn.get(fqcn);
    return decl !== undefined && decl.kind === "class" && extendsChainReaches(context.index, decl, FACADE_BASE);
  };
  const isPhpunitAssert = (fqcn: string): boolean => {
    if (PHPUNIT_CLASSES.has(fqcn)) {
      return true;
    }
    const decl = context.combined.byFqcn.get(fqcn);
    return decl !== undefined && decl.kind === "class" && extendsChainReaches(context.combined, decl, PHPUNIT_ASSERT);
  };

  let scope: { namespace: string; imports: Map<string, string> } = { namespace: "", imports: new Map() };
  let depth = 0;
  let base = 0;
  let pendingBrace = false;
  for (let k = 0; k < code.length; k++) {
    const t = tokens[code[k]!]!;
    if (t.kind === "punct" && t.text === "{") {
      depth++;
      if (pendingBrace) {
        base = depth;
        pendingBrace = false;
      }
      continue;
    }
    if (t.kind === "punct" && t.text === "}") {
      depth--;
      continue;
    }
    if (t.kind !== "name") {
      continue;
    }
    const lower = t.text.toLowerCase();
    if (lower === "namespace" && (k === 0 || STATEMENT_START.has(text(k - 1))) && (kind(k + 1) === "name" || text(k + 1) === "{")) {
      const name = kind(k + 1) === "name" ? text(k + 1) : "";
      scope = { namespace: name, imports: new Map() };
      const next = name === "" ? k + 1 : k + 2;
      if (text(next) === "{") {
        pendingBrace = true;
      } else {
        base = depth;
      }
      k = next - 1;
      continue;
    }
    if (lower === "use" && depth === base && kind(k + 1) === "name") {
      k = parseUse(tokens, code, k + 1, scope.imports, file) - 1;
      continue;
    }
    if (text(k + 1) !== "(" || handled.has(k)) {
      continue;
    }
    const prev = text(k - 1);
    const owner = k >= 2 ? tokens[code[k - 2]!]! : null;
    const relative = prev === "::" && owner?.kind === "name" && RELATIVE.has(owner.text.toLowerCase());
    const resolved = prev === "::" && owner !== null && owner.kind === "name" && !relative && text(k - 3) !== "::" && text(k - 3) !== "->" ? resolveName(owner.text, scope as NameScope) : null;
    if (isAssertionName(t.text, context.kinds)) {
      const viaThis = prev === "->" && owner?.kind === "variable" && owner.text === "$this" && text(k - 3) !== "::" && text(k - 3) !== "->";
      let counted = false;
      if (viaThis || relative) {
        const cls = enclosing(code[k]!);
        counted = cls !== null && !hierarchyMethods(context, cls).has(lower);
      } else if (resolved !== null) {
        counted = isPhpunitAssert(resolved);
      }
      if (counted) {
        const entry = assertions.get(lower);
        if (entry === undefined) {
          assertions.set(lower, { name: t.text, calls: 1 });
        } else {
          entry.calls++;
        }
      }
    }
    if (resolved === MOCKERY) {
      // A static Mockery call; a chain after it starts only at a chain starter, which the walk reaches on its own.
      mock(t.text, true);
      continue;
    }
    if (((prev === "->" && owner !== null) || (resolved !== null && isFacade(resolved))) && starts(k)) {
      chain(k);
    }
  }
}

/** The summed `assertions` of the committed Inventory under `root`. */
export function inventoryExecutions(root: string): Map<string, number> {
  const dir = join(root, INVENTORY_DIR);
  if (!existsSync(dir)) {
    throw new ScanError(`${INVENTORY_DIR} is missing; the assertion executions come from the committed Inventory`);
  }
  const out = new Map<string, number>();
  for (const name of readdirSync(dir).sort(compareUnits)) {
    if (!name.endsWith(".jsonl") || name === NONDETERMINISM_FILE) {
      continue;
    }
    const lines = readFileSync(join(dir, name), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line === "") {
        return;
      }
      const where = `${INVENTORY_DIR}/${name}:${i + 1}`;
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        throw new ScanError(`${where}: not JSON`);
      }
      const assertions = (record as { assertions?: unknown }).assertions;
      if (assertions === null) {
        // A test the baseline did not run records no assertions.
        return;
      }
      if (typeof assertions !== "object" || assertions === null || Array.isArray(assertions)) {
        throw new ScanError(`${where}: assertions is not an object`);
      }
      for (const [kind, count] of Object.entries(assertions)) {
        if (!Number.isInteger(count) || (count as number) < 0) {
          throw new ScanError(`${where}: assertions.${kind} is not a count`);
        }
        out.set(kind, (out.get(kind) ?? 0) + (count as number));
      }
    });
  }
  return out;
}

export interface TestApiResult {
  files: Map<string, string>;
  assertions: AssertionLine[];
  mockery: MockeryLine[];
  /** Names called in the suites but never executed at the baseline, for review. */
  unexecuted: string[];
}

/** Builds both files from the snapshot and the Inventory under `root`. */
export function buildTestApi(root: string, index: Index = buildIndex(root)): TestApiResult {
  const executions = inventoryExecutions(root);
  const kinds = new Map<string, string>();
  for (const kind of [...executions.keys()].sort(compareUnits)) {
    if (!kinds.has(kind.toLowerCase())) {
      kinds.set(kind.toLowerCase(), kind);
    }
  }
  const suites = suiteFiles(root);
  const context: UsageContext = { index, combined: combinedIndex(index, suites), kinds, hierarchies: new Map() };
  const sites = new Map<string, { name: string; calls: number }>();
  const mockeryCounts = new Map<string, { name: string; count: number }>();
  for (const parsed of suites) {
    fileUsage(parsed, context, sites, mockeryCounts);
  }
  // One line per case-insensitive name, spelled as the Inventory kind, else as the first call site.
  const calls = new Map<string, number>();
  for (const [lower, site] of sites) {
    calls.set(kinds.get(lower) ?? site.name, site.calls);
  }
  const executionsByName = new Map<string, number>();
  for (const [kind, count] of executions) {
    const name = kinds.get(kind.toLowerCase())!;
    executionsByName.set(name, (executionsByName.get(name) ?? 0) + count);
  }
  const names = [...new Set([...calls.keys(), ...executionsByName.keys()])].filter((name) => (calls.get(name) ?? 0) > 0 || (executionsByName.get(name) ?? 0) > 0).sort(compareUnits);
  const assertions = names.map((name) => ({ name, calls: calls.get(name) ?? 0, executions: executionsByName.get(name) ?? 0 }));
  const mockery = [...mockeryCounts]
    .map(([key, line]) => ({ name: line.name, static: key.endsWith("\u00001"), count: line.count }))
    .sort((a, b) => compareUnits(a.name, b.name) || Number(a.static) - Number(b.static));
  const files = new Map([
    [ASSERTIONS_FILE, assertions.map((line) => `${renderJson({ name: line.name, calls: line.calls, executions: line.executions })}\n`).join("")],
    [MOCKERY_FILE, mockery.map((line) => `${renderJson({ name: line.name, static: line.static, count: line.count })}\n`).join("")],
  ]);
  const unexecuted = assertions.filter((line) => line.calls > 0 && line.executions === 0).map((line) => `${line.name} (${line.calls} calls)`);
  return { files, assertions, mockery, unexecuted };
}

const USAGE = ["Usage:", "  bun tools/scans/test-api.ts [--check] [--root <dir>]"].join("\n");

export function main(argv: readonly string[]): number {
  return runScan("test-api", argv, USAGE, (root) => {
    const result = buildTestApi(root);
    return {
      files: result.files,
      summary: `${result.assertions.length} assertions, ${result.mockery.length} Mockery methods`,
      notes: result.unexecuted.map((line) => `test-api: never executed at the baseline, for review: ${line}`),
    };
  });
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
