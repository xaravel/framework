// Xaravel Tests for Story 9.1: the Scope Frame primitive and `interleave` (AD-5, AD-6, AD-9, AD-10, NFR-4;
// ESC-4.2-1, ESC-9.1-1, ESC-9.1-2), as Story 9.2 extends it (frame kinds and the defer drain; its own tests are in
// frames.test.ts) and Story 9.3 extends it (Applications, overlays and `frameStatic`; its own tests are in
// overlays.test.ts). One test per acceptance criterion, in order. `xaravelTest` opens no frame
// (ESC-4.2-1 item 7), so each body starts outside any Scope Frame.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";
import * as scope from "@xaravel/runtime/scope";
import { currentFrame, frameDefer, frameSlot, interleave, runInFrame, ScopeFrameException } from "@xaravel/runtime/scope";
import * as root from "../../src/index";
import { fqcn, registerClass } from "../../src/registry/registry";

const PACKAGE_DIR = resolve(import.meta.dir, "..", "..");
const REPO_ROOT = resolve(PACKAGE_DIR, "..", "..");
const SCOPE_RUN = Symbol.for("xaravel.scope.run");
/**
 * `checkGraph(root)` from tools/graph/graph.ts, run in a child process: the package's generated tsconfig.json keeps
 * its `rootDir`, so this project must not import tools/.
 */
async function checkGraph(root: string): Promise<string[]> {
  const tool = resolve(REPO_ROOT, "tools", "graph", "graph.ts");
  const run = await child("const { checkGraph } = await import(process.env.GRAPH_TOOL); console.log(JSON.stringify(checkGraph(process.env.GRAPH_ROOT)));", { GRAPH_TOOL: tool, GRAPH_ROOT: root });
  Assert.assertSame(0, run.code, run.err);
  return JSON.parse(run.out) as string[];
}

/** Runs `code` in a fresh `bun -e` (no harness preload) with `env` added; its exit code, stdout and stderr. */
async function child(code: string, env: Record<string, string> = {}): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn([process.execPath, "--no-env-file", "-e", code], { cwd: PACKAGE_DIR, env: { ...inherited(), ...env }, stdout: "pipe", stderr: "pipe" });
  const [exit, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: exit, out: stdout, err: stderr };
}

/** This process's env without the scope-global opt-out, so a child installs the global unless a test opts out. */
function inherited(): Record<string, string | undefined> {
  const { XARAVEL_NO_SCOPE_GLOBAL: _optOut, ...rest } = process.env;
  return rest;
}

/** The value `fn` throws, or null when it returns. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return null;
}

/** Settles after `n` turns of the microtask queue. */
async function ticks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
}

xaravelTest(
  "XT-runtime-1",
  "@xaravel/runtime/scope exports currentFrame(), runInFrame(kind, fn) and frameSlot(key, init) and installs globalThis[Symbol.for('xaravel.scope.run')] on load, which the grader calls without importing anything (AD-5.1)",
  async () => {
    const functions = ["currentFrame", "runInFrame", "runInRootFrame", "runInNarrowFrame", "frameSlot", "frameDefer", "bindToFrame", "frameStreamSource", "frameAsyncGenerator", "interleave", "ScopeFrameException", "currentApplication", "setDefaultApplication", "frameOverlay", "frameStatic"] as const;
    for (const name of functions) {
      Assert.assertSame("function", typeof scope[name], `@xaravel/runtime/scope exports ${name}`);
      Assert.assertSame(scope[name], root[name], `the package root re-exports ${name}`);
    }
    for (const name of ["REQUEST_SLOT", "ROUTE_SLOT", "CSP_NONCE_SLOT"] as const) {
      Assert.assertSame("symbol", typeof scope[name], `@xaravel/runtime/scope exports ${name}`);
      Assert.assertSame(scope[name], root[name], `the package root re-exports ${name}`);
    }
    const manifest = JSON.parse(readFileSync(resolve(PACKAGE_DIR, "package.json"), "utf8")) as { exports: Record<string, string> };
    Assert.assertSame("./src/scope/index.ts", manifest.exports["./scope"]);

    // The global is runInFrame itself, locked in place (ESC-4.2-1 items 2 and 4).
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, SCOPE_RUN);
    Assert.assertTrue(descriptor !== undefined, "the global is installed");
    Assert.assertSame(runInFrame, descriptor?.value);
    Assert.assertSame(false, descriptor?.writable);
    Assert.assertSame(false, descriptor?.configurable);
    Assert.assertSame(false, descriptor?.enumerable);

    // No frame read: null, never undefined (AD-9).
    Assert.assertNull(currentFrame());

    // Grader call. The recorded decision is decisions/ESC-4.2-1.md (decision: approved, decided_by: Maintainer,
    // 2026-10-18), which reads: "Every item is approved exactly as the Escalation's `proposed` text states: - **(1)-(3)**
    // The reporter, scope and case contracts are adopted. Stories 5.3, 9.1 and 57 build to them." The adopted item (2)
    // in conformance/escalations/ESC-4.2-1.md reads: "(2) Scope call shape, for Story 9.1. When
    // `globalThis[Symbol.for('xaravel.scope.run')]` is a function, `portedTest` calls it as `run('test', inner)` and
    // awaits its result; `inner` returns a promise and must run with the `test` frame active for its whole duration
    // (case construction, `setUp`, body, `tearDown`), mirroring AD-5's `runInFrame(kind, fn)`." It does not require run
    // to return inner's own promise. AD-5.9 ("A unit ends only after ... the frame's `defer` list has drained") makes
    // run return a promise that settles with inner's value after inner, and after every promise inner deferred. The
    // Maintainer's ruling decisions/ESC-9.2-1.md (Option 1) approves this settle-after-drain check in place of Story
    // 9.1's identity check: run('test', inner) "may return a promise other than `inner`'s own", settling with inner's
    // value only after the frame's defer list has drained. The three reads below check the ESC-4.2-1 decision, the
    // adopted item (2) and the ESC-9.2-1 quotation against their files, so the citations cannot drift from the records.
    const flat = (path: string): string => readFileSync(resolve(REPO_ROOT, path), "utf8").replace(/\s+/g, " ");
    Assert.assertStringContainsString("The reporter, scope and case contracts are adopted.", flat("decisions/ESC-4.2-1.md"));
    Assert.assertStringContainsString("`portedTest` calls it as `run('test', inner)` and awaits its result;", flat("conformance/escalations/ESC-4.2-1.md"));
    Assert.assertStringContainsString("may return a promise other than `inner`'s own", flat("decisions/ESC-9.2-1.md"));
    const run = (globalThis as Record<symbol, unknown>)[SCOPE_RUN] as <T>(kind: string, fn: () => T) => T;
    const kinds: Array<string | null> = [];
    const inner = async (): Promise<string> => {
      kinds.push(currentFrame()?.kind ?? null);
      await ticks(3);
      kinds.push(currentFrame()?.kind ?? null);
      await new Promise((done) => setTimeout(done, 1));
      kinds.push(currentFrame()?.kind ?? null);
      frameDefer(
        new Promise<void>((done) =>
          setTimeout(() => {
            deferredSettled = true;
            done();
          }, 5),
        ),
      );
      return "done";
    };
    let deferredSettled = false;
    let innerSettled = false;
    const returned = run("test", () => {
      const innerPromise = inner();
      void innerPromise.then(() => {
        innerSettled = true;
      });
      return innerPromise;
    });
    Assert.assertTrue(returned instanceof Promise, "run returns a promise");
    let settledFirst: boolean | null = null;
    let deferredFirst: boolean | null = null;
    const value = await returned.then((done) => {
      settledFirst = innerSettled;
      deferredFirst = deferredSettled;
      return done;
    });
    Assert.assertSame("done", value);
    Assert.assertSame(true, settledFirst, "run's promise settles after inner's");
    Assert.assertSame(true, deferredFirst, "run's promise settles after the promise inner deferred");
    Assert.assertSame("test,test,test", kinds.join(","));
    Assert.assertNull(currentFrame());

    // Sync stays sync (AD-6).
    Assert.assertSame(42, runInFrame("test", () => 42));

    // A rejection propagates.
    const failure = new Error("inner failed");
    let caught: unknown = null;
    try {
      await run("test", async () => {
        await ticks(1);
        throw failure;
      });
    } catch (error) {
      caught = error;
    }
    Assert.assertSame(failure, caught);

    // The env opt-out skips the install; a global already defined by other code throws.
    const probe = `const s = Symbol.for("xaravel.scope.run"); await import("@xaravel/runtime/scope"); console.log(typeof globalThis[s]);`;
    const installed = await child(probe);
    Assert.assertSame(0, installed.code, installed.err);
    Assert.assertSame("function", installed.out.trim(), installed.err);
    const optedOut = await child(probe, { XARAVEL_NO_SCOPE_GLOBAL: "1" });
    Assert.assertSame(0, optedOut.code, optedOut.err);
    Assert.assertSame("undefined", optedOut.out.trim(), optedOut.err);
    const taken = await child(
      `Object.defineProperty(globalThis, Symbol.for("xaravel.scope.run"), { value: () => null }); try { await import("@xaravel/runtime/scope"); console.log("installed"); } catch (e) { console.log(e.name + ": " + e.message); }`,
    );
    Assert.assertSame(0, taken.code, taken.err);
    Assert.assertSame(
      "ScopeFrameException: Symbol.for('xaravel.scope.run') was already defined by other code or another copy of @xaravel/runtime; @xaravel/runtime will not install over it",
      taken.out.trim(),
      taken.err,
    );
  },
  30_000,
);

xaravelTest(
  "XT-runtime-2",
  "two units started with interleave([a, b]) each read only their own frameSlot value across several awaits, and switch in the same order on every run: the helper NFR-4 concurrency tests use to interleave two units at their awaits (AD-5.10)",
  async () => {
    const slot = frameSlot<string | null>("xt-runtime-2.owner", () => null);
    const STEPS = 4;

    /** Runs the two-unit scenario from the calling frame (or none); its step log. */
    async function onceIn(): Promise<string[]> {
      const log: string[] = [];
      const unit = (name: string) => async (): Promise<string> => {
        const frame = currentFrame();
        Assert.assertSame("unit", frame?.kind);
        Assert.assertNull(slot.get(), `${name} starts with the slot's init value`);
        slot.set(name);
        log.push(`${name}:set`);
        for (let step = 1; step <= STEPS; step++) {
          await Promise.resolve();
          Assert.assertSame(frame, currentFrame(), `${name} keeps its own frame at step ${step}`);
          Assert.assertSame(name, slot.get(), `${name} reads its own value at step ${step}`);
          log.push(`${name}:${step}`);
        }
        return name;
      };
      const results = await interleave([unit("a"), unit("b")]);
      Assert.assertSame("a,b", results.join(","));
      return log;
    }

    async function once(): Promise<string[]> {
      const log = await onceIn();
      Assert.assertNull(currentFrame());
      return log;
    }

    const expected = ["a:set", "b:set", "a:1", "b:1", "a:2", "b:2", "a:3", "b:3", "a:4", "b:4"].join(",");
    for (let run = 1; run <= 3; run++) {
      Assert.assertSame(expected, (await once()).join(","), `the switch order of run ${run}`);
    }

    // Inside the grader's test frame: each unit gets a fresh unit frame, and the outer frame and slot are untouched.
    for (let run = 1; run <= 3; run++) {
      await runInFrame("test", async () => {
        const outer = currentFrame();
        slot.set("outer");
        Assert.assertSame(expected, (await onceIn()).join(","), `the switch order inside a test frame, run ${run}`);
        Assert.assertSame(outer, currentFrame());
        Assert.assertSame("test", currentFrame()?.kind);
        Assert.assertSame("outer", slot.get(), "the outer frame's slot keeps its value");
      });
    }

    // With two failing units, interleave rejects with the first rejection in array order, not the first in time.
    const e0 = new Error("e0");
    const e1 = new Error("e1");
    let first: unknown = null;
    try {
      await interleave([
        async () => {
          await ticks(2);
          throw e0;
        },
        () => {
          throw e1;
        },
      ]);
    } catch (error) {
      first = error;
    }
    Assert.assertSame(e0, first);

    // A unit's failure rejects interleave, a synchronous throw included, only after its siblings have finished.
    const failure = new Error("unit failed");
    const siblingLog: string[] = [];
    let caught: unknown = null;
    try {
      await interleave([
        async () => {
          for (let step = 1; step <= STEPS; step++) {
            await Promise.resolve();
            siblingLog.push(`sibling:${step}`);
          }
          return "ok";
        },
        () => {
          throw failure;
        },
      ]);
    } catch (error) {
      caught = error;
    }
    Assert.assertSame(failure, caught);
    Assert.assertSame(`sibling:${STEPS}`, siblingLog.at(-1) ?? null, "the failed unit's sibling finished before interleave rejected");
  },
);

xaravelTest("XT-runtime-3", "code with no active frame that writes a frame slot throws ScopeFrameException (AD-5.5), fqcn() throws for an unregistered class (AD-10.2), and registering a different class under an existing key throws (AD-10.5)", () => {
  Assert.assertNull(currentFrame());
  let inits = 0;
  const slot = frameSlot("xt-runtime-3.value", () => ++inits);

  const thrown = thrownBy(() => slot.set(7));
  Assert.assertInstanceOf(ScopeFrameException, thrown);
  Assert.assertInstanceOf(Error, thrown);
  Assert.assertSame("ScopeFrameException", (thrown as Error).name);
  Assert.assertSame("Cannot write the frame slot xt-runtime-3.value with no active Scope Frame; run the code inside runInFrame()", (thrown as Error).message);
  Assert.assertSame("Xaravel\\Runtime\\Scope\\ScopeFrameException", fqcn(ScopeFrameException));
  Assert.assertSame("Xaravel\\Runtime\\Scope\\ScopeFrameException", fqcn(thrown as object));

  // A read outside a frame returns init() without storing it.
  Assert.assertSame(1, slot.get());
  Assert.assertSame(2, slot.get());

  // Inside a frame, init runs once and the same key shares storage; a new frame starts fresh.
  runInFrame("unit", () => {
    Assert.assertSame(3, slot.get());
    Assert.assertSame(3, slot.get());
    slot.set(10);
    Assert.assertSame(10, frameSlot("xt-runtime-3.value", () => -1).get());
  });
  runInFrame("unit", () => {
    Assert.assertSame(4, slot.get());
  });
  Assert.assertInstanceOf(ScopeFrameException, thrownBy(() => slot.set(8)));

  // The Registry core (ESC-9.1-2), on throwaway classes under unique FQCNs.
  class Registered {}
  class Other {}
  class Unregistered {}
  class UnregisteredChild extends Registered {}
  const name = "Xaravel\\Runtime\\Tests\\Scope\\Registered";
  registerClass(name, Registered);
  registerClass(name, Registered);
  Assert.assertSame(name, fqcn(Registered));
  Assert.assertSame(name, fqcn(new Registered()));
  for (const taken of [`\\${name}`, name.toLowerCase()]) {
    const conflict = thrownBy(() => registerClass(taken, Other));
    Assert.assertInstanceOf(TypeError, conflict);
    const shown = taken.startsWith("\\") ? taken.slice(1) : taken;
    Assert.assertSame(`registerClass(): ${shown} is already registered to another class`, (conflict as Error).message);
  }
  const second = thrownBy(() => registerClass("Xaravel\\Runtime\\Tests\\Scope\\SecondName", Registered));
  Assert.assertInstanceOf(TypeError, second);
  Assert.assertSame(`registerClass(): the class registered as ${name} cannot also be registered as Xaravel\\Runtime\\Tests\\Scope\\SecondName`, (second as Error).message);
  for (const value of [Unregistered, new UnregisteredChild(), null]) {
    Assert.assertInstanceOf(TypeError, thrownBy(() => fqcn(value as object)));
  }
});

xaravelTest(
  "XT-runtime-4",
  "the @xaravel/runtime package lists no workspace dependencies, peerDependencies or optionalDependencies, so any package may depend on it without a cycle (AD-2.2), and the graph check reports the dependency cycle (AD-2.4) and the layer edge an added dependency makes",
  async () => {
    const manifest = JSON.parse(readFileSync(resolve(PACKAGE_DIR, "package.json"), "utf8")) as Record<string, unknown>;
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      Assert.assertTrue(!(field in manifest), `@xaravel/runtime has no ${field}`);
    }
    const namesRuntime = (lines: readonly string[]): string => lines.filter((line) => line.includes("@xaravel/runtime")).join("\n");
    Assert.assertSame("", namesRuntime(await checkGraph(REPO_ROOT)), "the graph check reports nothing for @xaravel/runtime");

    // A temp root with the real runtime, support and assert rows and manifests (assert is runtime's devDependency).
    const table = readFileSync(resolve(REPO_ROOT, "tools/scaffold/packages.jsonl"), "utf8").split("\n");
    const rows = ["runtime", "support", "assert"].map((name) => {
      const row = table.find((line) => line.includes(`"name":"${name}"`)) ?? null;
      Assert.assertNotNull(row, `tools/scaffold/packages.jsonl has a row for ${name}`);
      return row as string;
    });
    const tmp = mkdtempSync(join(tmpdir(), "xt-runtime-4-"));
    try {
      mkdirSync(join(tmp, "tools", "scaffold"), { recursive: true });
      writeFileSync(join(tmp, "tools", "scaffold", "packages.jsonl"), `${rows.join("\n")}\n`);
      for (const name of ["runtime", "support", "assert"]) {
        mkdirSync(join(tmp, "packages", name), { recursive: true });
        cpSync(resolve(REPO_ROOT, "packages", name, "package.json"), join(tmp, "packages", name, "package.json"));
      }
      Assert.assertSame("", namesRuntime(await checkGraph(tmp)), "the unmodified copy reports nothing for @xaravel/runtime");

      writeFileSync(join(tmp, "packages", "runtime", "package.json"), `${JSON.stringify({ ...manifest, dependencies: { "@xaravel/support": "workspace:*" } }, null, 2)}\n`);
      // support already depends on runtime, so the added edge is also a cycle.
      Assert.assertSame(
        [
          "cycle: @xaravel/runtime -> @xaravel/support -> @xaravel/runtime",
          "layer edge: @xaravel/runtime lists @xaravel/support in dependencies; @xaravel/runtime may depend on no workspace package (AD-2)",
        ].join("\n"),
        namesRuntime(await checkGraph(tmp)),
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
  60_000,
);
