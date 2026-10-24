// Xaravel Test for Story 10.1: the compile-time brand (AD-1.1, ESC-10.1-1). A temp project that imports
// `@xaravel/contracts` is built with the repo's pinned `tsc -b`, once with a class missing a brand getter and once
// with a class carrying both brands.
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";

const REPO = resolve(import.meta.dir, "..", "..", "..", "..");

/** The two contracts every fixture declares, as Story 10.2's generators will emit them. */
const PRELUDE = `import { contract } from "@xaravel/contracts";

declare const ArrayableBrand: unique symbol;
export interface Arrayable {
  readonly [Arrayable.brand]: true;
  toArray(): unknown;
}
export const Arrayable = contract<Arrayable, typeof ArrayableBrand>("Illuminate\\\\Contracts\\\\Support\\\\Arrayable", { toArray: [] });

declare const JsonableBrand: unique symbol;
export interface Jsonable {
  readonly [Jsonable.brand]: true;
  toJson(options?: number): string;
}
export const Jsonable = contract<Jsonable, typeof JsonableBrand>("Illuminate\\\\Contracts\\\\Support\\\\Jsonable", { toJson: ["options"] });
`;

const MISSING = `${PRELUDE}
export class B implements Arrayable {
  toArray(): unknown {
    return [];
  }
}
`;

const COMPLETE = `${PRELUDE}
export class C implements Arrayable, Jsonable {
  get [Arrayable.brand](): true {
    return true as const;
  }

  get [Jsonable.brand](): true {
    return true as const;
  }

  toArray(): unknown[] {
    return [];
  }

  toJson(options: number = 0): string {
    return String(options);
  }

  *[Symbol.iterator](): Iterator<unknown> {
    yield* this.toArray();
  }
}

export function encode(value: unknown): string | null {
  return value instanceof Jsonable ? value.toJson() : null;
}
`;

/** Runs the repo's pinned `tsc -b` in `cwd`; returns its exit code and combined output. */
async function tscBuild(cwd: string): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn([process.execPath, "--bun", join(REPO, "node_modules", "typescript", "bin", "tsc"), "-b", "--pretty", "false"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, output: `${stdout}${stderr}` };
}

/**
 * Whether `output` reports a TS2420 diagnostic naming `[Arrayable.brand]`. Under `--pretty false` tsc writes the
 * missing property on the diagnostic's indented elaboration line, so a diagnostic is its line plus those.
 */
function namesMissingBrand(output: string): boolean {
  const lines = output.split("\n");
  return lines.some((line, index) => {
    if (!line.includes("TS2420")) {
      return false;
    }
    const block = [line];
    for (let next = index + 1; next < lines.length && /^\s/.test(lines[next] ?? ""); next++) {
      block.push(lines[next] ?? "");
    }
    return block.some((entry) => entry.includes("[Arrayable.brand]"));
  });
}

xaravelTest(
  "XT-contracts-2",
  "a class that implements Arrayable without the brand getter fails to compile with TS2420 naming [Arrayable.brand]; a class with both brands and [Symbol.iterator] compiles, and instanceof narrows to the interface (AD-1.1)",
  async () => {
    const tmp = mkdtempSync(join(tmpdir(), "xaravel-contract-brand-"));
    try {
      copyFileSync(join(REPO, "tsconfig.base.json"), join(tmp, "tsconfig.base.json"));
      // The project is configured as every Xaravel package is (`types: ["bun"]`, XT-conformance-9): `contract()` imports
      // `@xaravel/runtime/registry`'s `isContractToken` (MAINT-2026-10-24 Item 4), and the runtime uses Bun's and
      // Node's globals and built-in modules.
      writeFileSync(join(tmp, "tsconfig.json"), JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { types: ["bun"] }, include: ["fixture.ts"] }, null, 2) + "\n");
      mkdirSync(join(tmp, "node_modules", "@xaravel"), { recursive: true });
      symlinkSync(join(REPO, "node_modules", "@types"), join(tmp, "node_modules", "@types"));
      symlinkSync(join(REPO, "packages", "contracts"), join(tmp, "node_modules", "@xaravel", "contracts"));
      const fixture = join(tmp, "fixture.ts");

      writeFileSync(fixture, MISSING);
      const missing = await tscBuild(tmp);
      Assert.assertNotEquals(0, missing.code);
      Assert.assertTrue(namesMissingBrand(missing.output), missing.output);
      const codes = [...missing.output.matchAll(/error (TS\d+)/g)].map((match) => match[1]);
      Assert.assertNotEmpty(codes);
      for (const code of codes) {
        Assert.assertSame("TS2420", code, missing.output);
      }

      writeFileSync(fixture, COMPLETE);
      const complete = await tscBuild(tmp);
      Assert.assertSame(0, complete.code, complete.output);
      Assert.assertFalse(namesMissingBrand(complete.output), complete.output);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
  120_000,
);
