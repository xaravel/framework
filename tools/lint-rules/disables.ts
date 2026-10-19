// The lint-disable check (Story 6.1; NFR-3, AD-6, AD-16.4, AD-28.1).
//
//   bun --no-env-file tools/lint-rules/disables.ts [--root <dir>]
//       (`bun run lint:disables`, chained into `bun run lint`) fails on any
//       way of switching off a rule the spine names (`SPINE_RULES`); it only
//       reads files
//
// It checks two things.
//
// Disable directives. The scanned files are `git ls-files -co
// --exclude-standard` under the root with oxlint's extensions (`LINTED_EXTENSIONS`),
// minus those the root `.oxlintrc.json` `ignorePatterns` match. Each file is
// tokenized (strings, template literals with `${}` nesting and regex literals
// are skipped), so only real `//` and `/* */` comments count. A comment whose
// trimmed text starts with `oxlint-disable`, `oxlint-disable-line`,
// `oxlint-disable-next-line` or the `eslint-` spelling of one is a directive;
// its rule list is the comma-separated text after it, up to a ` -- `
// description. A rule matches a spine rule by its last `/` segment
// (`no-floating-promises`, `typescript/…`, `@typescript-eslint/…`). A
// directive naming a spine rule, or naming no rule (which disables every
// rule), is a violation.
//
// Lint configs. The root `.oxlintrc.json` and every nested `.oxlintrc.json` /
// `.oxlintrc.jsonc` (not under an ignored path) must leave each spine rule an
// error with its `SPINE_RULE_OPTIONS`: a nested config replaces the root's for
// its directory unless it `extends` it, so a nested config that drops a rule
// disables it. A config's effective rules are its `extends` (relative JSON
// paths, in order) and then its own `rules`. Also a violation: an `overrides`
// entry that sets a spine rule below `error` or weakens its options, a
// `plugins` list without `typescript`, a root config whose `jsPlugins` does not
// load `./tools/lint-rules/plugin.ts` (Story 6.2), an `ignorePatterns` entry (in any
// config, relative to its directory) or root `.eslintignore` line (oxlint
// honours it by default) that excludes a protected path (`protectedPaths`:
// `IGNORE_PROBES`, a `packages/demo/src/Demo<ext>` per linted extension, and
// every listed linted file under `packages/*/src`, `packages/*/tests` or
// `skeleton/`), a config that does not parse, and an `oxlint.config.*` (a JS
// config this check cannot read).
//
// Each violation is one line, `<path>:<line>:<col>: <message> (AD-16)`, on
// stderr. Exit codes: 0 none (prints `lint disables: ok (<n> files)`), 1 any
// violation or failure, 2 usage error.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";

/**
 * The rules the spine names: AD-6 async safety (NFR-3, Story 6.1), then the `xaravel` plugin's identity, value and
 * test-hygiene rules (`./plugin.ts`, Story 6.2; AD-10, AD-23, AD-15, AD-1, AD-7, AD-3). Story 6.3 appends its custom
 * rule names here; a rule is named by its last `/` segment, so a name must not collide with an oxlint built-in.
 */
export const SPINE_RULES: readonly string[] = [
  "no-floating-promises",
  "await-thenable",
  "no-misused-promises",
  "no-identity-constructor-name",
  "no-framework-json-stringify",
  "no-ported-bun-expect",
  "no-type-import-injection",
  "no-model-private",
  "no-package-default-export",
];

/** The options a spine rule must carry, each with the value it must have. */
export const SPINE_RULE_OPTIONS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  "no-floating-promises": { checkThenables: true },
  "no-misused-promises": { checksVoidReturn: true },
};

/** The file extensions oxlint lints. */
export const LINTED_EXTENSIONS: readonly string[] = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/** Paths the async-safety rules must reach; no root ignore pattern may match one. */
export const IGNORE_PROBES: readonly string[] = [
  "packages/demo/src/Demo.ts",
  "packages/demo/tests/Demo.test.ts",
  "skeleton/app/Demo.ts",
  "packages/view/tests/__snapshots__/demo.ts",
];

export const ROOT_CONFIG = ".oxlintrc.json";
/** The `jsPlugins` entry the root config must carry for the `xaravel` spine rules (Story 6.2). */
export const XARAVEL_PLUGIN = "./tools/lint-rules/plugin.ts";
export const ESLINTIGNORE = ".eslintignore";
const JSON_CONFIG_NAMES = new Set([".oxlintrc.json", ".oxlintrc.jsonc"]);
const JS_CONFIG = /(^|\/)oxlint\.config\.[cm]?[jt]s$/;
const DIRECTIVES = ["oxlint-disable-next-line", "oxlint-disable-line", "oxlint-disable", "eslint-disable-next-line", "eslint-disable-line", "eslint-disable"];

export interface Violation {
  readonly path: string;
  readonly line: number;
  readonly col: number;
  readonly message: string;
}

export function formatViolation(violation: Violation): string {
  return `${violation.path}:${violation.line}:${violation.col}: ${violation.message} (AD-16)`;
}

/** A rule's name for comparison: its last `/` segment. */
export function ruleName(rule: string): string {
  const slash = rule.lastIndexOf("/");
  return slash === -1 ? rule : rule.slice(slash + 1);
}

// ---------------------------------------------------------------------------
// Comments

export interface Comment {
  /** The text between `//` and the line end, or between `/*` and `*\/`. */
  readonly text: string;
  /** 1-based line and column of the comment's first `/`. */
  readonly line: number;
  readonly col: number;
}

const REGEX_KEYWORDS = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

/**
 * The comments in a JS/TS source. Strings, template literals (with `${}` nesting) and regex literals are skipped,
 * so a directive inside one is not a comment. A `/` starts a regex unless it follows an identifier (not a keyword
 * like `return`), a number, `)`, `]` or `}`.
 */
export function comments(source: string): Comment[] {
  const out: Comment[] = [];
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  const position = (offset: number): { line: number; col: number } => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return { line: lo + 1, col: offset - lineStarts[lo]! + 1 };
  };

  // Brace depths at which an open template's `${` expression closes back into the template.
  const templates: number[] = [];
  let depth = 0;
  // The last significant token: "word" (identifier or keyword, with its text), "value" (number, `)`, `]`, `}`, string), or "punct".
  let last: { kind: "word" | "value" | "punct"; text: string } = { kind: "punct", text: "" };
  let i = 0;
  const n = source.length;

  const skipTemplate = (): void => {
    // At the character after "`" or after the "}" closing a `${}`; stops after "`" or after "${".
    while (i < n) {
      const c = source[i]!;
      if (c === "\\") {
        i += 2;
      } else if (c === "`") {
        i++;
        last = { kind: "value", text: "`" };
        return;
      } else if (c === "$" && source[i + 1] === "{") {
        i += 2;
        templates.push(depth);
        depth++;
        last = { kind: "punct", text: "${" };
        return;
      } else {
        i++;
      }
    }
  };

  while (i < n) {
    const c = source[i]!;
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out.push({ text: source.slice(i + 2, stop), ...position(i) });
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end;
      out.push({ text: source.slice(i + 2, stop), ...position(i) });
      i = end === -1 ? n : end + 2;
    } else if (c === "'" || c === '"') {
      i++;
      while (i < n && source[i] !== c && source[i] !== "\n") {
        i += source[i] === "\\" ? 2 : 1;
      }
      i++;
      last = { kind: "value", text: c };
    } else if (c === "`") {
      i++;
      skipTemplate();
    } else if (c === "/") {
      const regex = last.kind === "punct" || (last.kind === "word" && REGEX_KEYWORDS.has(last.text));
      if (regex) {
        i++;
        let inClass = false;
        while (i < n && source[i] !== "\n") {
          const r = source[i]!;
          if (r === "\\") {
            i += 2;
            continue;
          }
          i++;
          if (r === "[") {
            inClass = true;
          } else if (r === "]") {
            inClass = false;
          } else if (r === "/" && !inClass) {
            break;
          }
        }
        while (i < n && /[\w$]/.test(source[i]!)) {
          i++;
        }
        last = { kind: "value", text: "/" };
      } else {
        i++;
        last = { kind: "punct", text: "/" };
      }
    } else if (/[\p{ID_Start}$_\\]/u.test(c)) {
      const start = i;
      while (i < n && /[\p{ID_Continue}$\\\u200c\u200d]/u.test(source[i]!)) {
        i++;
      }
      last = { kind: "word", text: source.slice(start, i) };
    } else if (/[0-9]/.test(c) || (c === "." && next !== undefined && /[0-9]/.test(next))) {
      while (i < n && /[\w.]/.test(source[i]!)) {
        i++;
      }
      last = { kind: "value", text: "0" };
    } else if (/\s/.test(c)) {
      i++;
    } else if (c === "{") {
      depth++;
      i++;
      last = { kind: "punct", text: c };
    } else if (c === "}") {
      depth--;
      i++;
      if (templates.length > 0 && templates[templates.length - 1] === depth) {
        templates.pop();
        skipTemplate();
      } else {
        last = { kind: "value", text: c };
      }
    } else if (c === ")" || c === "]") {
      i++;
      last = { kind: "value", text: c };
    } else {
      i++;
      last = { kind: "punct", text: c };
    }
  }
  return out;
}

export interface Directive {
  readonly directive: string;
  /** The rules it names; empty when it names none (disabling every rule). */
  readonly rules: readonly string[];
}

/** The disable directive a comment holds, or null. */
export function parseDirective(text: string): Directive | null {
  const trimmed = text.trim();
  for (const directive of DIRECTIVES) {
    if (!trimmed.startsWith(directive)) {
      continue;
    }
    const rest = trimmed.slice(directive.length);
    if (rest !== "" && !/^\s/.test(rest)) {
      return null;
    }
    const description = rest.search(/\s-{2,}\s|\s-{2,}$/);
    const list = description === -1 ? rest : rest.slice(0, description);
    const rules = list
      .split(",")
      .map((rule) => rule.trim())
      .filter((rule) => rule !== "");
    return { directive, rules };
  }
  return null;
}

/** The violations in one source's disable directives. */
export function scanSource(path: string, source: string): Violation[] {
  const out: Violation[] = [];
  for (const comment of comments(source)) {
    const directive = parseDirective(comment.text);
    if (directive === null) {
      continue;
    }
    const at = { path, line: comment.line, col: comment.col };
    if (directive.rules.length === 0) {
      out.push({ ...at, message: `\`${directive.directive}\` with no rule list disables every rule, including ${SPINE_RULES.join(", ")}` });
      continue;
    }
    for (const rule of directive.rules) {
      if (SPINE_RULES.includes(ruleName(rule))) {
        out.push({ ...at, message: `\`${directive.directive}\` disables ${ruleName(rule)}` });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Files

/** `git ls-files -co --exclude-standard` under `root`, as `/`-separated relative paths. */
export function gitFiles(root: string): string[] {
  const proc = Bun.spawnSync(["git", "ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`git ls-files failed in ${root}: ${proc.stderr.toString().trim()}`);
  }
  return [...new Set(proc.stdout.toString().split("\0").filter((path) => path !== ""))].sort();
}

/** Whether a gitignore-style `ignorePatterns` entry matches a relative path. */
export function ignoreMatches(pattern: string, path: string): boolean {
  let body = pattern.trim();
  if (body === "" || body.startsWith("#") || body.startsWith("!")) {
    return false;
  }
  if (body.endsWith("/")) {
    body = body.slice(0, -1);
  }
  const anchored = body.startsWith("/") || body.includes("/");
  body = body.replace(/^\//, "");
  const globs = anchored ? [body, `${body}/**`] : [`**/${body}`, `**/${body}/**`];
  return globs.some((glob) => new Bun.Glob(glob).match(path));
}

function ignoredBy(patterns: readonly string[], path: string): boolean {
  return patterns.some((pattern) => ignoreMatches(pattern, path));
}

// ---------------------------------------------------------------------------
// Configs

type Json = Record<string, unknown>;

/** A JSON or JSONC config's value: comments and trailing commas are dropped before parsing. */
export function parseConfig(text: string): unknown {
  let stripped = "";
  let last = 0;
  for (const comment of commentRanges(text)) {
    stripped += text.slice(last, comment.start);
    last = comment.end;
  }
  stripped += text.slice(last);
  return JSON.parse(stripped.replace(/,(\s*[}\]])/g, "$1"));
}

function commentRanges(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '"') {
      i++;
      while (i < text.length && text[i] !== '"') {
        i += text[i] === "\\" ? 2 : 1;
      }
      i++;
    } else if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      out.push({ start: i, end: end === -1 ? text.length : end });
      i = end === -1 ? text.length : end;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      out.push({ start: i, end: end === -1 ? text.length : end + 2 });
      i = end === -1 ? text.length : end + 2;
    } else {
      i++;
    }
  }
  return out;
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Why a rule setting falls short of the spine's, or null when it holds. */
export function ruleShortfall(rule: string, setting: unknown): string | null {
  const severity = Array.isArray(setting) ? (setting[0] as unknown) : setting;
  if (setting === undefined) {
    return `does not set ${rule} (a spine rule must be "error")`;
  }
  if (severity !== "error" && severity !== "deny" && severity !== 2) {
    return `sets ${rule} to ${JSON.stringify(severity)} (a spine rule must be "error")`;
  }
  const required = SPINE_RULE_OPTIONS[rule];
  if (required === undefined) {
    return null;
  }
  const options = Array.isArray(setting) && isObject(setting[1]) ? setting[1] : {};
  for (const [option, value] of Object.entries(required)) {
    if (options[option] !== value) {
      return `sets ${rule} without ${option}: ${JSON.stringify(value)}`;
    }
  }
  return null;
}

/** A config's rules keyed by rule name (last `/` segment); a later spelling of the same rule wins, as in oxlint. */
function rulesOf(config: Json): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (isObject(config["rules"])) {
    for (const [rule, setting] of Object.entries(config["rules"])) {
      out.set(ruleName(rule), setting);
    }
  }
  return out;
}

/** The effective rules of the config at `file`: its `extends` (relative JSON paths), then its own `rules`. */
function effectiveRules(file: string, config: Json, seen: Set<string>): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const extendsList = config["extends"];
  if (Array.isArray(extendsList)) {
    for (const entry of extendsList) {
      if (typeof entry !== "string" || !(entry.startsWith("./") || entry.startsWith("../") || entry.startsWith("/"))) {
        continue;
      }
      const target = resolve(dirname(file), entry);
      if (seen.has(target) || !existsSync(target)) {
        continue;
      }
      seen.add(target);
      let parsed: unknown;
      try {
        parsed = parseConfig(readFileSync(target, "utf8"));
      } catch {
        continue;
      }
      if (isObject(parsed)) {
        for (const [rule, setting] of effectiveRules(target, parsed, seen)) {
          out.set(rule, setting);
        }
      }
    }
  }
  for (const [rule, setting] of rulesOf(config)) {
    out.set(rule, setting);
  }
  return out;
}

/** 1-based line and column of the first occurrence of `needle` in `text`, else 1:1. */
function locate(text: string, needle: string): { line: number; col: number } {
  const at = text.indexOf(needle);
  if (at === -1) {
    return { line: 1, col: 1 };
  }
  const before = text.slice(0, at);
  const line = before.split("\n").length;
  return { line, col: at - before.lastIndexOf("\n") };
}

/**
 * The paths the spine rules must reach, relative to the root: `IGNORE_PROBES`, one `packages/demo/src/Demo<ext>` per
 * linted extension, and every linted file in `files` under `packages/*\/src`, `packages/*\/tests` or `skeleton/`.
 */
export function protectedPaths(files: readonly string[] = []): string[] {
  const real = files.filter((path) => LINTED_EXTENSIONS.some((extension) => path.endsWith(extension)) && /^(packages\/[^/]+\/(src|tests)\/|skeleton\/)/.test(path));
  return [...new Set([...IGNORE_PROBES, ...LINTED_EXTENSIONS.map((extension) => `packages/demo/src/Demo${extension}`), ...real])];
}

/** The first of `paths` (relative to the root) that `pattern`, relative to the directory `base` ("" for the root), excludes. */
function excluded(pattern: string, base: string, paths: readonly string[]): string | undefined {
  const prefix = base === "" ? "" : `${base}/`;
  return paths.find((path) => path.startsWith(prefix) && ignoreMatches(pattern, path.slice(prefix.length)));
}

/** The violations in a root `.eslintignore` (which oxlint honours by default): each entry that excludes a protected path. */
export function checkEslintignore(root: string, paths: readonly string[] = protectedPaths()): Violation[] {
  const file = join(root, ESLINTIGNORE);
  if (!existsSync(file)) {
    return [];
  }
  const out: Violation[] = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      const pattern = line.trim();
      if (pattern === "" || pattern.startsWith("#")) {
        return;
      }
      const path = excluded(pattern, "", paths);
      if (path !== undefined) {
        out.push({ path: ESLINTIGNORE, line: index + 1, col: 1, message: `entry ${JSON.stringify(pattern)} excludes ${path} from the spine rules` });
      }
    });
  return out;
}

/** The violations in the config at relative `path` under `root`; its `ignorePatterns` (relative to its directory) may exclude none of `paths`. */
export function checkConfig(root: string, path: string, paths: readonly string[] = protectedPaths()): Violation[] {
  const file = join(root, path);
  if (JS_CONFIG.test(path)) {
    return [{ path, line: 1, col: 1, message: `is a JS lint config, which this check cannot read; use ${ROOT_CONFIG}` }];
  }
  const text = readFileSync(file, "utf8");
  let config: unknown;
  try {
    config = parseConfig(text);
  } catch (error) {
    return [{ path, line: 1, col: 1, message: `does not parse: ${error instanceof Error ? error.message : String(error)}` }];
  }
  if (!isObject(config)) {
    return [{ path, line: 1, col: 1, message: "is not a JSON object" }];
  }
  const out: Violation[] = [];
  const effective = effectiveRules(file, config, new Set([resolve(file)]));
  for (const rule of SPINE_RULES) {
    const shortfall = ruleShortfall(rule, effective.get(rule));
    if (shortfall !== null) {
      out.push({ path, ...locate(text, rule), message: shortfall });
    }
  }
  const overrides = config["overrides"];
  if (Array.isArray(overrides)) {
    overrides.forEach((override: unknown, index) => {
      if (!isObject(override)) {
        return;
      }
      for (const [rule, setting] of rulesOf(override)) {
        if (!SPINE_RULES.includes(rule)) {
          continue;
        }
        const shortfall = ruleShortfall(rule, setting);
        if (shortfall !== null) {
          out.push({ path, ...locate(text, rule), message: `overrides[${index}] ${shortfall}` });
        }
      }
    });
  }
  if (path === ROOT_CONFIG && !loadsXaravelPlugin(config["jsPlugins"])) {
    out.push({ path, ...locate(text, '"jsPlugins"'), message: `does not load ${XARAVEL_PLUGIN} in jsPlugins, which turns the xaravel spine rules off` });
  }
  const plugins = config["plugins"];
  if (Array.isArray(plugins) && !plugins.includes("typescript")) {
    out.push({ path, ...locate(text, '"plugins"'), message: "sets plugins without typescript, which turns the type-aware spine rules off" });
  }
  const base = posix.dirname(path) === "." ? "" : posix.dirname(path);
  for (const pattern of ignorePatterns(config)) {
    const probe = excluded(pattern, base, paths);
    if (probe !== undefined) {
      out.push({ path, ...locate(text, JSON.stringify(pattern)), message: `ignorePatterns entry ${JSON.stringify(pattern)} excludes ${probe} from the spine rules` });
    }
  }
  return out;
}

/** Whether a `jsPlugins` value loads the `xaravel` plugin, as a string entry or a `{ specifier }` object. */
function loadsXaravelPlugin(jsPlugins: unknown): boolean {
  return Array.isArray(jsPlugins) && jsPlugins.some((entry: unknown) => entry === XARAVEL_PLUGIN || (isObject(entry) && entry["specifier"] === XARAVEL_PLUGIN));
}

function ignorePatterns(config: Json): string[] {
  const patterns = config["ignorePatterns"];
  return Array.isArray(patterns) ? patterns.filter((pattern): pattern is string => typeof pattern === "string") : [];
}

// ---------------------------------------------------------------------------
// The check

export interface DisablesResult {
  readonly violations: readonly Violation[];
  /** How many source files were scanned for directives. */
  readonly scanned: number;
}

/** Every violation under `root`: the configs first (root, then nested by path), then directives by file. */
export function findDisables(root: string): DisablesResult {
  const rootConfig = join(root, ROOT_CONFIG);
  if (!existsSync(rootConfig)) {
    return { violations: [{ path: ROOT_CONFIG, line: 1, col: 1, message: "is missing, so no spine rule runs" }], scanned: 0 };
  }
  let patterns: string[] = [];
  try {
    const parsed = parseConfig(readFileSync(rootConfig, "utf8"));
    patterns = isObject(parsed) ? ignorePatterns(parsed) : [];
  } catch {
    // checkConfig reports it.
  }
  const listed = gitFiles(root).filter((path) => existsSync(join(root, path)));
  const files = listed.filter((path) => !ignoredBy(patterns, path));
  const paths = protectedPaths(listed);
  const violations: Violation[] = [...checkConfig(root, ROOT_CONFIG, paths), ...checkEslintignore(root, paths)];
  for (const path of files) {
    const base = posix.basename(path);
    if (path !== ROOT_CONFIG && (JSON_CONFIG_NAMES.has(base) || JS_CONFIG.test(path))) {
      violations.push(...checkConfig(root, path, paths));
    }
  }
  let scanned = 0;
  for (const path of files) {
    if (!LINTED_EXTENSIONS.some((extension) => path.endsWith(extension))) {
      continue;
    }
    scanned++;
    violations.push(...scanSource(path, readFileSync(join(root, path), "utf8")));
  }
  return { violations, scanned };
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = "Usage: bun --no-env-file tools/lint-rules/disables.ts [--root <dir>]";

function parseRoot(argv: readonly string[]): string {
  let root = resolve(import.meta.dir, "..", "..");
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg !== "--root") {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${arg} needs a value`);
    }
    root = resolve(value);
  }
  return root;
}

export function main(argv: readonly string[]): number {
  try {
    const root = parseRoot(argv);
    const { violations, scanned } = findDisables(root);
    if (violations.length > 0) {
      process.stderr.write(`${violations.map(formatViolation).join("\n")}\n`);
      return 1;
    }
    process.stdout.write(`lint disables: ok (${scanned} files)\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`lint disables: check failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}

