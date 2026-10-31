// The entry-script check (ESC-15.3-1, FR-20.2; the spine's Config row:
// "`--no-env-file` in every entry script"; epic 15 retro item 4, finding L1).
//
//   bun tools/entry-scripts/entry-scripts.ts check [--root <dir>]
//       reads the `scripts` of the root `package.json`, `skeleton/package.json`,
//       every `packages/*/package.json`, and every `package.json` the root's
//       `workspaces` globs name (an array, or an object's `packages` array),
//       except one under a `node_modules/` or `fixtures/` segment
//
// Reading: each script value is read as a POSIX shell script, quote-aware. It
// is split into simple commands on unquoted `&&`, `||`, `;`, `|`, `&`,
// newlines and `(`/`)`; `'…'`, `"…"` and `\` are read as the shell does, so a
// separator inside quotes does not split; `$( … )`, backtick and `<( … )`
// substitutions (also inside `"…"`, `${ … }` and `$(( … ))`) are read as nested scripts; redirections
// (`2>&1`, `> file`) are dropped with their target; `#` starts a comment.
// Per simple command, leading `{`, `!`, `function NAME` and the other reserved words and
// `NAME=value` assignments (quoted values too) are skipped, then the wrappers
// `env` (with its options, assignments and `-S <string>`), `exec`, `time` (and its `-o`/`-f` values),
// `command` (but `command -v` runs nothing) and `nohup`. `sh|bash|zsh|dash -c
// <string>` and `bun exec <string>` are read as nested scripts. A word whose
// basename is `bun` or `bunx` (`./node_modules/.bin/bun`, `/usr/bin/bun`) is
// Bun.
//
// Rules:
//   1. A `bun` command starts a Bun process that would autoload `.env`, so it
//      must carry `--no-env-file` among the options before its subcommand or
//      entry file: `bun --no-env-file test`, `bun --no-env-file run <script>`,
//      `bun --no-env-file --bun <bin>`, `bun --no-env-file <file>`. A
//      package-manager subcommand that runs no project code (PM_SUBCOMMANDS) is
//      exempt; `bunx` is not this rule's (rule 2).
//   2. A bin launch cannot carry the flag to the process it starts: probed on
//      Bun 1.4.3, `bunx <bin>`, `bun --no-env-file x <bin>`,
//      `bun --no-env-file --bun <bin>` and `bun --no-env-file run <bin>` all
//      let the bin's child Bun process autoload `.env`. A bin launch is `bunx`,
//      `bun x`, or a `bun` (or `bun run`) target that is not a builtin
//      subcommand, a file path (a `/`, or a `.ts`/`.js`/`.sh`-like extension)
//      or a script of the same `package.json`. Outside the root `package.json`
//      it is a violation. In the root it passes only when `<root>/bunfig.toml`
//      sets `env = false` at its top level (before any `[section]`), which the
//      check reads: that file is read from the cwd, which is the root for a
//      root script, so it reaches the child too (XT-conformance-273 runs it).
//      A root script that changes directory (a `cd` or `pushd` command, or a
//      `bun` call with `--cwd`) loses that exemption. A workspace package's
//      script runs with the package directory as its cwd, where that
//      `bunfig.toml` is not read.
//
// Limits: only the wrappers above are looked through. `nice`, `timeout`,
// `xargs`, `sudo`, `stdbuf`, `cross-env`, `concurrently`, and a script file run
// by `sh <file>` are not, so a `bun` they start is not seen.
//
// Exit codes: 0 pass, 1 violations or any failure (fail closed), 2 usage error.
// Violations go to stderr, one line each, per file in file order, then per
// script in script order:
//
//   entry-scripts: <file>: scripts.<name>: bun command lacks --no-env-file (FR-20.2)
//   entry-scripts: <file>: scripts.<name>: bunx or a package bin cannot carry --no-env-file; Bun's .env autoload reaches its child process (FR-20.2)
//   entry-scripts: <file>: scripts.<name>: cannot be read as a shell command: <reason> (FR-20.2)
//
// The root `package.json` is required; a missing `skeleton/package.json` or
// `packages/` is not a violation. A file that is not valid JSON, a `scripts`
// that is not an object, a script value that is not a string, a script the
// reader cannot read (an unterminated quote, substitution or `(`, an unmatched
// `)`, a redirection with no target, a here-document, or a command name built
// from an expansion such as `$BUN` or `$(which bun)`), or a root `workspaces` that is not an array of strings or an
// object whose `packages` is one, is one.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const FLAG = "--no-env-file";
/** The `bun` subcommands that only manage packages and run no project code, so need no `--no-env-file`. */
export const PM_SUBCOMMANDS = ["install", "add", "remove", "update", "pm", "link", "unlink", "outdated", "patch", "publish"] as const;

const BIN_PROBLEM = "bunx or a package bin cannot carry --no-env-file; Bun's .env autoload reaches its child process";

/** Bun 1.4.3's builtin subcommands and aliases other than PM_SUBCOMMANDS, `x`, `run` and `exec`: a `bun` target naming one is not a bin. */
const BUILTINS = new Set(["test", "build", "check", "repl", "init", "create", "c", "upgrade", "completions", "discord", "help", "i", "a", "rm", "audit", "info", "why", "dedupe", "prune", "patch-commit", "getcompletes"]);
/** `bun` (and `bun run`) options that take the next word as their value. */
const VALUE_OPTIONS = new Set([
  "--cwd",
  "-c",
  "--config",
  "--env-file",
  "-r",
  "--preload",
  "--require",
  "--import",
  "-e",
  "--eval",
  "-p",
  "--print",
  "-d",
  "--define",
  "-l",
  "--loader",
  "--tsconfig-override",
  "--port",
  "--conditions",
  "--main-fields",
  "--extension-order",
  "--console-depth",
  "--title",
  "-F",
  "--filter",
  "--elide-lines",
  "--shell",
]);
/** Shell reserved words that may lead a simple command without changing what it runs. */
const RESERVED = new Set(["{", "}", "!", "if", "then", "else", "elif", "do", "while", "until"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** A file target: a path, or a name with a `.<ext>` suffix. */
const FILE_TARGET = /\/|\.[^./]+$/;

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// The shell reader

/** A script the reader cannot read; the check reports it rather than guessing (fail closed). */
export class ShellReadError extends Error {}

interface Word {
  /** The word's source text, quotes included. */
  raw: string;
  /** The word after quote removal; a substitution keeps its source text. */
  value: string;
}

interface SimpleCommand {
  /** The command's source text, trimmed. */
  text: string;
  /** Its words, redirections and their targets dropped. */
  words: Word[];
  /** The simple commands of every substitution inside it. */
  nested: SimpleCommand[];
}

class Reader {
  private i = 0;

  constructor(private readonly src: string) {}

  /** Reads a list of simple commands up to the end, or, inside `$( … )`, up to its closing `)`, which it consumes. */
  list(inSubstitution: boolean): SimpleCommand[] {
    const src = this.src;
    const commands: SimpleCommand[] = [];
    let depth = 0;
    let start = this.i;
    let words: Word[] = [];
    let nested: SimpleCommand[] = [];
    let wordStart = -1;
    let value = "";
    let redirectTarget = false;

    const begin = (): void => {
      if (wordStart < 0) {
        wordStart = this.i;
      }
    };
    const endWord = (): void => {
      if (wordStart >= 0) {
        if (redirectTarget) {
          redirectTarget = false;
        } else {
          words.push({ raw: src.slice(wordStart, this.i), value });
        }
      }
      wordStart = -1;
      value = "";
    };
    const endCommand = (): void => {
      endWord();
      if (redirectTarget) {
        throw new ShellReadError("a redirection has no target");
      }
      if (words.length > 0 || nested.length > 0) {
        commands.push({ text: src.slice(start, this.i).trim(), words, nested });
      }
      words = [];
      nested = [];
    };
    const separator = (length: number): void => {
      endCommand();
      this.i += length;
      start = this.i;
    };

    while (this.i < src.length) {
      const c = src[this.i]!;
      const next = src[this.i + 1];
      if (c === " " || c === "\t") {
        endWord();
        this.i++;
      } else if (c === "\\" && next === "\n") {
        // A line continuation: dropped, and it starts no word.
        this.i += 2;
      } else if (c === "\n" || c === ";") {
        separator(1);
      } else if (c === "#" && wordStart < 0) {
        endCommand();
        while (this.i < src.length && src[this.i] !== "\n") {
          this.i++;
        }
        start = this.i;
      } else if (c === "&" && next === ">") {
        endWord();
        this.i += src[this.i + 2] === ">" ? 3 : 2;
        redirectTarget = true;
      } else if (c === "&") {
        separator(next === "&" ? 2 : 1);
      } else if (c === "|") {
        separator(next === "|" || next === "&" ? 2 : 1);
      } else if (c === "(") {
        depth++;
        separator(1);
      } else if (c === ")") {
        if (depth === 0) {
          if (!inSubstitution) {
            throw new ShellReadError("unmatched )");
          }
          endCommand();
          this.i++;
          return commands;
        }
        depth--;
        separator(1);
      } else if ((c === "<" || c === ">") && next === "(") {
        // Process substitution, read like `$( … )`.
        begin();
        const from = this.i;
        this.i += 2;
        nested.push(...this.list(true));
        value += src.slice(from, this.i);
      } else if (c === "<" || c === ">") {
        if (wordStart >= 0 && /^\d+$/.test(src.slice(wordStart, this.i))) {
          wordStart = -1;
          value = "";
        } else {
          endWord();
        }
        if (redirectTarget) {
          throw new ShellReadError("a redirection has no target");
        }
        if (c === "<" && next === "<" && src[this.i + 2] !== "<") {
          throw new ShellReadError("here-documents are not read");
        }
        this.i += next === ">" || next === "&" || next === "|" || next === "<" ? (src[this.i + 2] === "<" ? 3 : 2) : 1;
        redirectTarget = true;
      } else {
        begin();
        value += this.wordPart(nested);
      }
    }
    if (inSubstitution) {
      throw new ShellReadError("unterminated $( substitution");
    }
    if (depth > 0) {
      throw new ShellReadError("unterminated (");
    }
    endCommand();
    return commands;
  }

  /** Reads one part of a word at the cursor, returning its value; substitutions' commands go to `nested`. */
  private wordPart(nested: SimpleCommand[]): string {
    const src = this.src;
    const c = src[this.i]!;
    if (c === "'") {
      const end = src.indexOf("'", this.i + 1);
      if (end < 0) {
        throw new ShellReadError("unterminated single quote");
      }
      const text = src.slice(this.i + 1, end);
      this.i = end + 1;
      return text;
    }
    if (c === '"') {
      this.i++;
      let text = "";
      while (this.i < src.length && src[this.i] !== '"') {
        const d = src[this.i]!;
        if (d === "\\" && this.i + 1 < src.length && '"\\$`\n'.includes(src[this.i + 1]!)) {
          text += src[this.i + 1] === "\n" ? "" : src[this.i + 1];
          this.i += 2;
        } else if (d === "$" || d === "`") {
          text += this.dollarOrBacktick(nested);
        } else {
          text += d;
          this.i++;
        }
      }
      if (this.i >= src.length) {
        throw new ShellReadError("unterminated double quote");
      }
      this.i++;
      return text;
    }
    if (c === "\\") {
      if (this.i + 1 >= src.length) {
        throw new ShellReadError("trailing backslash");
      }
      const escaped = src[this.i + 1]!;
      this.i += 2;
      return escaped === "\n" ? "" : escaped;
    }
    if (c === "$" || c === "`") {
      return this.dollarOrBacktick(nested);
    }
    this.i++;
    return c;
  }

  /** Reads `$( … )`, `$(( … ))`, `${ … }`, a backtick substitution or a plain `$` at the cursor, returning its source text. */
  private dollarOrBacktick(nested: SimpleCommand[]): string {
    const src = this.src;
    const from = this.i;
    if (src[this.i] === "`") {
      let body = "";
      this.i++;
      while (this.i < src.length && src[this.i] !== "`") {
        if (src[this.i] === "\\" && this.i + 1 < src.length && "\\`$".includes(src[this.i + 1]!)) {
          body += src[this.i + 1];
          this.i += 2;
        } else {
          body += src[this.i];
          this.i++;
        }
      }
      if (this.i >= src.length) {
        throw new ShellReadError("unterminated backtick substitution");
      }
      this.i++;
      nested.push(...readShell(body));
      return src.slice(from, this.i);
    }
    const next = src[this.i + 1];
    if (next === "(" && src[this.i + 2] === "(") {
      this.i = this.matching(this.i + 1, "(", ")", "unterminated $(( arithmetic");
      new Reader(src.slice(from + 3, this.i - 2)).substitutions(nested);
      return src.slice(from, this.i);
    }
    if (next === "(") {
      this.i += 2;
      nested.push(...this.list(true));
      return src.slice(from, this.i);
    }
    if (next === "{") {
      this.i = this.matching(this.i + 1, "{", "}", "unterminated ${ expansion");
      new Reader(src.slice(from + 2, this.i - 1)).substitutions(nested);
      return src.slice(from, this.i);
    }
    this.i++;
    return "$";
  }

  /** Reads every substitution in an expansion's body (`${ … }`, `$(( … ))`) into `nested`; the rest is text. */
  substitutions(nested: SimpleCommand[]): void {
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      if (c === "\\") {
        this.i += 2;
      } else if (c === "$" || c === "`") {
        this.dollarOrBacktick(nested);
      } else {
        this.i++;
      }
    }
  }

  /** The index just past the bracket matching the one at `at`. */
  private matching(at: number, open: string, close: string, problem: string): number {
    let depth = 0;
    for (let j = at; j < this.src.length; j++) {
      if (this.src[j] === open) {
        depth++;
      } else if (this.src[j] === close && --depth === 0) {
        return j + 1;
      }
    }
    throw new ShellReadError(problem);
  }
}

/** The simple commands of a script, in source order; throws ShellReadError on a script it cannot read. */
function readShell(script: string): SimpleCommand[] {
  return new Reader(script).list(false);
}

// ---------------------------------------------------------------------------
// The per-command analysis

interface BunCall {
  /** A `bun` command without `--no-env-file` before its subcommand or entry file (rule 1). */
  lacksFlag: boolean;
  /** A bin launch (rule 2). */
  bin: boolean;
  /** Whether it changes directory (`--cwd`, or a `cd`/`pushd` command), so the root's bunfig.toml may not apply. */
  changesDir: boolean;
  /** False for a `cd`/`pushd` command, which is recorded but starts no Bun process. */
  bun: boolean;
}

const CHANGES_DIR: BunCall = { lacksFlag: false, bin: false, changesDir: true, bun: false };

function basename(word: string): string {
  return word.slice(word.lastIndexOf("/") + 1);
}

/** The Bun processes the commands start, nested ones included; `scripts` are the same package.json's script names. */
function bunCalls(commands: readonly SimpleCommand[], scripts: ReadonlySet<string>): BunCall[] {
  const calls: BunCall[] = [];
  for (const command of commands) {
    calls.push(...bunCalls(command.nested, scripts), ...wordCalls(command.words, scripts));
  }
  return calls;
}

function scriptCalls(script: string, scripts: ReadonlySet<string>): BunCall[] {
  return bunCalls(readShell(script), scripts);
}

/** The Bun processes one simple command's words start. */
function wordCalls(words: readonly Word[], scripts: ReadonlySet<string>): BunCall[] {
  const value = (k: number): string => words[k]?.value ?? "";
  let i = 0;
  for (;;) {
    while (i < words.length && (RESERVED.has(words[i]!.raw) || words[i]!.raw === "function" || ASSIGNMENT.test(words[i]!.raw))) {
      i += words[i]!.raw === "function" ? 2 : 1;
    }
    if (i >= words.length) {
      return [];
    }
    if (/[$`]/.test(words[i]!.raw)) {
      throw new ShellReadError("a command name built from an expansion");
    }
    const head = basename(value(i));
    i++;
    if (head === "cd" || head === "pushd") {
      return [CHANGES_DIR];
    }
    if (head === "env") {
      while (i < words.length && value(i).startsWith("-")) {
        const option = value(i);
        if (option === "--" || option === "-") {
          i++;
          break;
        }
        if (option === "-S" || option === "--split-string") {
          return scriptCalls(value(i + 1), scripts);
        }
        if (option.startsWith("-S") || option.startsWith("--split-string=")) {
          return scriptCalls(option.startsWith("-S") ? option.slice(2) : option.slice("--split-string=".length), scripts);
        }
        i += ["-u", "--unset", "-C", "--chdir", "-P"].includes(option) ? 2 : 1;
      }
      while (i < words.length && ASSIGNMENT.test(value(i))) {
        i++;
      }
    } else if (head === "exec" || head === "time" || head === "nohup" || head === "command") {
      while (i < words.length && value(i).startsWith("-")) {
        const option = value(i);
        if (option === "--") {
          i++;
          break;
        }
        if (head === "command" && /[vV]/.test(option)) {
          return [];
        }
        const takesValue = (head === "exec" && option === "-a") || (head === "time" && ["-o", "-f", "--output", "--format"].includes(option));
        i += takesValue ? 2 : 1;
      }
    } else if (SHELLS.has(head)) {
      let dashC = false;
      while (i < words.length && /^[-+]/.test(value(i))) {
        const option = value(i);
        if (option === "--" || option === "-") {
          i++;
          break;
        }
        if (["-o", "+o", "-O", "+O", "--rcfile", "--init-file"].includes(option)) {
          i += 2;
          continue;
        }
        if (/^-[A-Za-z]*c/.test(option)) {
          dashC = true;
        }
        i++;
      }
      return dashC && i < words.length ? scriptCalls(value(i), scripts) : [];
    } else if (head === "bunx") {
      return [{ lacksFlag: false, bin: true, changesDir: false, bun: true }];
    } else if (head === "bun") {
      return bunArguments(words.slice(i).map((word) => word.value), scripts);
    } else {
      return [];
    }
  }
}

/** Skips options from `from`, a value option with its value; returns the index of the first non-option word. */
function skipOptions(args: readonly string[], from: number): number {
  let j = from;
  while (j < args.length && args[j]!.startsWith("-")) {
    j += VALUE_OPTIONS.has(args[j]!) ? 2 : 1;
  }
  return j;
}

/** Whether a `bun` (or `bun run`) target is a bin rather than a file or a script of the same package.json. */
function isBin(target: string, scripts: ReadonlySet<string>): boolean {
  return !FILE_TARGET.test(target) && !scripts.has(target);
}

/** The Bun processes `bun <args>` starts. */
function bunArguments(args: readonly string[], scripts: ReadonlySet<string>): BunCall[] {
  let hasFlag = false;
  let j = 0;
  while (j < args.length && args[j]!.startsWith("-")) {
    if (args[j] === FLAG) {
      hasFlag = true;
    }
    j += VALUE_OPTIONS.has(args[j]!) ? 2 : 1;
  }
  const target = args[j];
  const changesDir = args.some((arg) => arg === "--cwd" || arg.startsWith("--cwd="));
  if (target === undefined) {
    return [{ lacksFlag: !hasFlag, bin: false, changesDir, bun: true }];
  }
  if ((PM_SUBCOMMANDS as readonly string[]).includes(target)) {
    return [{ lacksFlag: false, bin: false, changesDir, bun: true }];
  }
  const call: BunCall = { lacksFlag: !hasFlag, bin: false, changesDir, bun: true };
  if (target === "x") {
    call.bin = true;
  } else if (target === "exec") {
    const k = skipOptions(args, j + 1);
    return k < args.length ? [call, ...scriptCalls(args[k]!, scripts)] : [call];
  } else if (target === "run") {
    const k = skipOptions(args, j + 1);
    const options = args.slice(j + 1, k);
    const filtered = options.some((option) => option === "-F" || option === "--filter" || option.startsWith("--filter=") || option === "--workspaces");
    call.bin = !filtered && k < args.length && isBin(args[k]!, scripts);
  } else if (!BUILTINS.has(target)) {
    call.bin = isBin(target, scripts);
  }
  return [call];
}

/** The commands of a script value, split as the shell reader splits them, each its trimmed source text; throws ShellReadError on a script it cannot read. */
export function splitCommands(value: string): string[] {
  return readShell(value).map((command) => command.text);
}

const NO_SCRIPTS: ReadonlySet<string> = new Set();

/** Whether one command (or anything nested in it) is a `bun` command that needs `--no-env-file` before its subcommand or entry file and lacks it; throws ShellReadError on a command it cannot read. */
export function lacksFlag(command: string): boolean {
  return scriptCalls(command, NO_SCRIPTS).some((call) => call.lacksFlag);
}

/** The commands of a script value that lack the flag, in order; throws ShellReadError on a script it cannot read. */
export function commandsLackingFlag(value: string): string[] {
  return readShell(value)
    .filter((command) => bunCalls([command], NO_SCRIPTS).some((call) => call.lacksFlag))
    .map((command) => command.text);
}

// ---------------------------------------------------------------------------
// The files

const SKIPPED_SEGMENTS = new Set(["node_modules", "fixtures"]);

/** The root `package.json`'s workspace globs, or a problem; none when it has no `workspaces` or cannot be read (checkPackageJson reports that). */
function workspaceGlobs(root: string): { globs: string[]; problem: string | null } {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    return { globs: [], problem: null };
  }
  if (!isObject(data) || data["workspaces"] === undefined) {
    return { globs: [], problem: null };
  }
  const workspaces = data["workspaces"];
  const list = isObject(workspaces) ? (workspaces["packages"] === undefined ? [] : workspaces["packages"]) : workspaces;
  if (!Array.isArray(list) || !list.every((glob) => typeof glob === "string")) {
    return { globs: [], problem: "entry-scripts: package.json: workspaces is not an array of glob strings or an object whose packages is one (FR-20.2)" };
  }
  return { globs: list as string[], problem: null };
}

/** The repo-relative `package.json` files the check reads, and a problem with the root's `workspaces`, if any. */
function discoverPackageFiles(root: string): { files: string[]; problem: string | null } {
  const files = ["package.json"];
  if (existsSync(join(root, "skeleton", "package.json"))) {
    files.push("skeleton/package.json");
  }
  const packages = join(root, "packages");
  if (existsSync(packages)) {
    for (const entry of readdirSync(packages, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      if (entry.isDirectory() && existsSync(join(packages, entry.name, "package.json"))) {
        files.push(`packages/${entry.name}/package.json`);
      }
    }
  }
  const { globs, problem } = workspaceGlobs(root);
  const excluded = globs.filter((glob) => glob.startsWith("!")).map((glob) => new Bun.Glob(glob.slice(1).replace(/\/+$/, "")));
  const found = new Set<string>();
  for (const glob of globs.filter((pattern) => !pattern.startsWith("!"))) {
    const pattern = glob.replace(/^\.\//, "").replace(/\/+$/, "");
    if (pattern === "" || pattern === ".") {
      continue;
    }
    for (const file of new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: root, onlyFiles: true })) {
      const path = file.split("\\").join("/");
      const dir = path.slice(0, -"/package.json".length);
      const segments = path.split("/");
      if (segments.includes("..") || segments.some((segment) => SKIPPED_SEGMENTS.has(segment)) || excluded.some((exclude) => exclude.match(dir))) {
        continue;
      }
      found.add(path);
    }
  }
  for (const file of [...found].sort(compare)) {
    if (!files.includes(file)) {
      files.push(file);
    }
  }
  return { files, problem };
}

/** The repo-relative `package.json` files the check reads under `root`: the root's, the Skeleton's, each package's sorted, then each other `workspaces` match sorted. */
export function packageFiles(root: string): string[] {
  return discoverPackageFiles(root).files;
}

/**
 * The violations of one `package.json` and the number of `bun` commands in its scripts; `file` is its repo-relative path,
 * and `package.json` is the root. `rootEnvOff` says whether the root's bunfig.toml sets `env = false` (see rootBunfigEnvOff);
 * only then do the root's bin launches that do not change directory pass.
 */
export function checkPackageJson(file: string, text: string, rootEnvOff = false): { commands: number; violations: string[] } {
  const bad = (problem: string): string => `entry-scripts: ${file}: ${problem} (FR-20.2)`;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { commands: 0, violations: [bad(`is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)] };
  }
  if (!isObject(data)) {
    return { commands: 0, violations: [bad("is not a JSON object")] };
  }
  const scripts = data["scripts"];
  if (scripts === undefined) {
    return { commands: 0, violations: [] };
  }
  if (!isObject(scripts)) {
    return { commands: 0, violations: [bad("scripts is not an object")] };
  }
  const names: ReadonlySet<string> = new Set(Object.keys(scripts));
  const exemptBins = file === "package.json" && rootEnvOff;
  let commands = 0;
  const violations: string[] = [];
  for (const [name, value] of Object.entries(scripts)) {
    if (typeof value !== "string") {
      violations.push(bad(`scripts.${name}: is not a string`));
      continue;
    }
    let calls: BunCall[];
    try {
      calls = scriptCalls(value, names);
    } catch (error) {
      if (error instanceof ShellReadError) {
        violations.push(bad(`scripts.${name}: cannot be read as a shell command: ${error.message}`));
        continue;
      }
      throw error;
    }
    commands += calls.filter((call) => call.bun).length;
    if (calls.some((call) => call.lacksFlag)) {
      violations.push(bad(`scripts.${name}: bun command lacks ${FLAG}`));
    }
    if (calls.some((call) => call.bin) && !(exemptBins && !calls.some((call) => call.changesDir))) {
      violations.push(bad(`scripts.${name}: ${BIN_PROBLEM}`));
    }
  }
  return { commands, violations };
}

/** Whether `<root>/bunfig.toml` sets `env = false` at its top level, before any `[section]`; a missing file does not. */
export function rootBunfigEnvOff(root: string): boolean {
  const path = join(root, "bunfig.toml");
  if (!existsSync(path)) {
    return false;
  }
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) {
      return false;
    }
    if (/^\s*env\s*=\s*false\s*(?:#.*)?$/.test(line)) {
      return true;
    }
  }
  return false;
}

/** Checks every entry script under `root`. A root without a `package.json` is a violation (fail closed). */
export function checkEntryScripts(root: string): { files: string[]; commands: number; violations: string[] } {
  if (!existsSync(join(root, "package.json"))) {
    return { files: [], commands: 0, violations: ["entry-scripts: package.json does not exist (FR-20.2)"] };
  }
  const { files, problem } = discoverPackageFiles(root);
  const rootEnvOff = rootBunfigEnvOff(root);
  let commands = 0;
  const violations: string[] = [];
  for (const file of files) {
    const result = checkPackageJson(file, readFileSync(join(root, file), "utf8"), rootEnvOff);
    commands += result.commands;
    violations.push(...result.violations);
    if (file === "package.json" && problem !== null) {
      violations.push(problem);
    }
  }
  return { files, commands, violations };
}

// ---------------------------------------------------------------------------
// CLI

class UsageError extends Error {}

const USAGE = ["Usage:", "  bun tools/entry-scripts/entry-scripts.ts check [--root <dir>]"].join("\n");

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
  const [command, ...rest] = argv;
  try {
    if (command !== "check") {
      throw new UsageError(command === undefined ? "Missing command" : `Unknown command: ${command}`);
    }
    const result = checkEntryScripts(parseRoot(rest));
    if (result.violations.length > 0) {
      process.stderr.write(`${result.violations.join("\n")}\n`);
      return 1;
    }
    process.stdout.write(`Entry scripts OK: ${result.commands} bun command(s) in ${result.files.length} package.json file(s) checked.\n`);
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    process.stderr.write(`entry-scripts: check failed: ${error instanceof Error ? error.message : String(error)} (FR-20.2)\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
