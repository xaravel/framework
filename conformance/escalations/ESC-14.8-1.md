---
test_ids:
  - "XT-collections-16"
trigger: protected-path
proposed: >-
  Authorize scoped Infrastructure work to repair API-surface inherited/mixin and alias analysis, triage the remaining genuine Collections signatures, and add justified citations only where an existing decision applies. Separately authorize Reflection to implement and re-verify its Collection dependency. Preserve the actual failing gate and pending Epic-close acceptance; no waiver is proposed.
evidence: >-
  At baseline 76b387f397bcc37339fe95966900678fd181cffc, bun run api-surface:gate collections exits 1 with 268 unexplained findings. The tool explicitly states inherited members, mixin trait members, aliases and unregistered exported classes are not seen. It reports Collection/LazyCollection sum, mapInto, mapSpread and chunkBy missing although EnumeratesValues supplies them. Other findings include genuine parameter-name differences and unresolved helper exports. Tool/citation edits are Protected and outside Story 14.8. Reflection getClassAttributes still unconditionally throws BlockedByComponentError(collections); changing that Component or its Expectations is outside this Story. XT-collections-16 remains unregistered and incomplete, not passing, expected-failing or dependency-skipped.
---

# ESC-14.8-1: Collections Epic-close gates need scoped work

## Observed baseline gate

`bun run api-surface:gate collections` exits 1 and ends with:

```text
api-surface:gate collections: 268 unexplained (AD-15)
```

Concrete reports include:

```text
collections: missing method Illuminate\Support\Collection::chunkBy
collections: missing method Illuminate\Support\Collection::mapInto
collections: missing method Illuminate\Support\Collection::mapSpread
collections: missing method Illuminate\Support\Collection::sum
collections: missing method Illuminate\Support\LazyCollection::chunkBy
collections: missing method Illuminate\Support\LazyCollection::sum
collections: mismatch method Illuminate\Support\Arr::add: parameter 3 is value_, Upstream value
collections: missing function data_has
```

`Collection` and `LazyCollection` extend `mixin(null, EnumeratesValues, Macroable)`.
`packages/collections/src/Traits/EnumeratesValues.ts` supplies `sum`, `mapInto`,
`mapSpread` and `chunkBy`; their canonical tests execute successfully.
`tools/api-surface/api-surface.ts:90` expressly documents that this syntactic
walk cannot see inherited members, mixin members and aliases. Adding duplicate
class methods to placate this limitation would obscure the shared trait design.
The remaining genuine signature and export findings still require triage;
no blanket citation or assertion weakening is proposed.

## Reflection re-verification

The existing Expectations line for
`Illuminate\Tests\Support\SupportReflectorTest::testGetClassAttributes` remains
`blocked-by:collections`. Both the retained test's setup boundary and
`packages/reflection/src/Reflector.ts:161` still throw the exact dependency
error unconditionally. Collections is now available, but implementing the
Reflection method and removing its boundary require editing that Component and
its own Expectations. This Story records the read-only re-verification and
requests separate authorization; it does not clear the line based on availability
alone.

## Pending complete Epic-close test

This test is preserved for activation after the repairs. It is intentionally
unregistered: the criterion is incomplete, and an expected failure or invented
`blocked-by` classification would conceal that fact. The fixture copies the production package closure into an isolated workspace,
installs it there and executes public imports outside the repository, with no
original-root node_modules links. This proves the source installation closure.
It does not prove a published tarball installation: the version `0.0.0` is
unpublished, a direct tarball attempt received registry 404 for transitive
dependencies, and the override attempt hung and was stopped. Release packaging
verification remains separate and incomplete.

```ts
xaravelTest(
  "XT-collections-16",
  "Collections closes its Epic only when all four canonical files have no not-ported-yet outcomes, the unchanged API gate passes, async companions and divergence docs exist, notices are retained, and a standalone installation works (FR-23, AD-2, AD-6)",
  () => {
    const files = ["SupportCollectionTest", "SupportLazyCollectionTest", "SupportLazyCollectionIsLazyTest", "SupportArrTest"];
    for (const file of files) {
      const rows = readFileSync(join(REPO, "conformance/expectations/collections/framework/tests/Support", `${file}.jsonl`), "utf8").trim().split("\n").map(line => JSON.parse(line) as { reason: string | null });
      Assert.assertFalse(rows.some(row => row.reason === "not-ported-yet"), file);
    }
    const reflection = readFileSync(join(REPO, "conformance/expectations/reflection/framework/tests/Support/SupportReflectorTest.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line) as { id: string; reason: string | null });
    const attributes = reflection.filter(row => row.id.endsWith("::testGetClassAttributes"));
    Assert.assertNotEmpty(attributes);
    for (const row of attributes) Assert.assertNotSame("blocked-by:collections", row.reason, row.id);
    const surface = JSON.parse(readFileSync(join(REPO, "packages/collections/async-surface.json"), "utf8")) as { method: string; root: string }[];
    for (const klass of ["Collection", "LazyCollection", "Enumerable"]) {
      for (const companion of ["eachAsync", "mapAsync", "filterAsync", "rejectAsync", "firstAsync", "everyAsync", "containsAsync", "partitionAsync"]) {
        Assert.assertTrue(surface.some(row => row.method === `${klass}.${companion}` && row.root === "callback"));
      }
    }
    const docs = readFileSync(join(REPO, "packages/collections/docs/collections.md"), "utf8");
    Assert.assertStringContainsString("## Divergences", docs);
    Assert.assertStringContainsString("DIV-1", docs);
    Assert.assertStringContainsString("DIV-12", docs);
    const license = readFileSync(join(REPO, "packages/collections/LICENSE"), "utf8");
    Assert.assertStringContainsString("Taylor Otwell", license);
    Assert.assertStringContainsString("Xaravel", license);
    standaloneCollectionsInstall();
    const gate = Bun.spawnSync([process.execPath, "run", "api-surface:gate", "collections"], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
    Assert.assertSame(0, gate.exitCode, new TextDecoder().decode(gate.stdout) + new TextDecoder().decode(gate.stderr));
  },
  120_000,
);
```

The complete source-installation fixture, based on the observed isolated smoke
script, adds cleanup around that script's unchanged copy/install/smoke sequence:

```ts
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Assert, xaravelTest } from "@xaravel/assert";

function standaloneCollectionsInstall(): void {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-collections-standalone-"));
  try {
    for (const name of ["runtime", "contracts", "macroable", "conditionable", "collections"]) {
      const target = join(dir, "packages", name);
      mkdirSync(join(dir, "packages"), { recursive: true });
      cpSync(join(REPO, "packages", name), target, {
        recursive: true,
        filter: path => !path.includes("/node_modules") && !path.includes("/dist") && !path.includes("/tests"),
      });
      const path = join(target, "package.json");
      const pkg = JSON.parse(readFileSync(path, "utf8")) as { devDependencies?: unknown };
      delete pkg.devDependencies;
      writeFileSync(path, JSON.stringify(pkg));
    }
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      private: true, type: "module", workspaces: ["packages/*"],
      dependencies: { "@xaravel/collections": "workspace:*" },
    }));
    const install = Bun.spawnSync([process.execPath, "install", "--production", "--ignore-scripts"], {
      cwd: dir, timeout: 60_000, stdout: "pipe", stderr: "pipe",
    });
    Assert.assertSame(0, install.exitCode, install.stdout.toString() + install.stderr.toString());
    writeFileSync(join(dir, "smoke.ts"), `
import { Collection, LazyCollection } from "@xaravel/collections";
if (new Collection([1, 2, 3]).map(x => Number(x) * 2).toJson() !== "[2,4,6]") throw new Error("collection");
let seen = 0;
const lazy = LazyCollection.make(function* () { for (let i = 1; ; i++) { seen++; yield i; } }).map(x => Number(x) * 2);
if (seen !== 0 || lazy.take(3).toJson() !== "[2,4,6]" || seen !== 3) throw new Error("lazy " + seen);
`);
    const smoke = Bun.spawnSync([process.execPath, "--no-env-file", "smoke.ts"], {
      cwd: dir, timeout: 60_000, stdout: "pipe", stderr: "pipe",
    });
    Assert.assertSame(0, smoke.exitCode, smoke.stdout.toString() + smoke.stderr.toString());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
```

Before activation, place this complete fixture beside the pending test and verify
public API docblocks against the full gate triage. The snippets are documentary
code, not a passing XT registration. The observed source installation ran with
Bun 1.4.3 and passed both Collection mapping and exact finite consumption of an
infinite lazy source. The added cleanup wrapper is not independently executed here.
