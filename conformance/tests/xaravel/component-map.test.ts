// Xaravel Tests for Story 2.3 (Test-directory → Component map, FR-1, AD-16).
// These run under plain `bun test` until the harness lands in Epic 5. The
// fixture roots are hermetic; the parts that read the real Upstream snapshot
// run only when it is present (`bun run upstream:sync`), as in the
// `component-map` workflow. Nothing here fetches.
import { expect } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  check,
  COMPONENT_MAP_FILE,
  componentForAlias,
  componentForFqcn,
  componentForTest,
  declaredClasses,
  expectedAliases,
  parseMap,
  readMap,
  testFiles,
} from "../../../tools/component-map/component-map";
import { CODEOWNERS_PATH, activePhases, isProtected, LIST_PATH, MAINTAINER, matches, parseList, renderCodeowners } from "../../../tools/protected-paths/protected-paths";
import { UPSTREAM_REPOS } from "../../../tools/upstream/upstream";
import { xaravelTest } from "../../../packages/assert/src/index";

const root = resolve(import.meta.dir, "..", "..", "..");
const CLI = join(root, "tools", "component-map", "component-map.ts");
const HAS_SNAPSHOT = UPSTREAM_REPOS.every(({ name }) => existsSync(join(root, "conformance", "upstream", name)));
const realMap = readMap(root);

// ---------------------------------------------------------------------------
// Fixture

const SUITE = (body: string): string => `<?xml version="1.0"?>\n<phpunit>\n  <testsuites>\n${body}  </testsuites>\n  <source><include><directory suffix=".php">./src</directory></include></source>\n</phpunit>\n`;

/** A minimal four-repository snapshot: Support, Collections, Auth, Config and Foundation, plus ai, mcp and boost. */
const SNAPSHOT: Record<string, string> = {
  "framework/phpunit.xml.dist": SUITE('    <testsuite name="Laravel Test Suite">\n      <directory suffix="Test.php">./tests</directory>\n    </testsuite>\n    <!-- <directory>./src</directory> -->\n'),
  "framework/composer.json": "{}\n",
  "framework/src/Illuminate/Auth/composer.json": '{"autoload": {"psr-4": {"Illuminate\\\\Auth\\\\": ""}}}\n',
  "framework/src/Illuminate/Auth/AuthManager.php": "<?php\n\nnamespace Illuminate\\Auth;\n\nclass AuthManager\n{\n}\n",
  "framework/src/Illuminate/Auth/AuthServiceProvider.php":
    "<?php\n\nnamespace Illuminate\\Auth;\n\nclass AuthServiceProvider\n{\n    public function register()\n    {\n        $this->app->singleton('auth', fn () => new AuthManager);\n        $this->app->singleton(\n            'auth.driver', fn ($app) => $app['auth']->guard()\n        );\n    }\n}\n",
  "framework/src/Illuminate/Collections/composer.json": '{"autoload": {"psr-4": {"Illuminate\\\\Support\\\\": ""}}}\n',
  "framework/src/Illuminate/Collections/Collection.php": "<?php\n\nnamespace Illuminate\\Support;\n\nclass Collection\n{\n}\n",
  "framework/src/Illuminate/Collections/Traits/EnumeratesValues.php": "<?php\n\nnamespace Illuminate\\Support\\Traits;\n\ntrait EnumeratesValues\n{\n}\n",
  "framework/src/Illuminate/Config/composer.json": '{"autoload": {"psr-4": {"Illuminate\\\\Config\\\\": ""}}}\n',
  "framework/src/Illuminate/Config/Repository.php": "<?php\n\nnamespace Illuminate\\Config;\n\nfinal class Repository\n{\n}\n",
  "framework/src/Illuminate/Foundation/Application.php":
    "<?php\n\nnamespace Illuminate\\Foundation;\n\nclass Application\n{\n    public function registerCoreContainerAliases()\n    {\n        foreach ([\n            'app' => [self::class, \\Psr\\Container\\ContainerInterface::class],\n            'auth' => [\\Illuminate\\Auth\\AuthManager::class],\n            'auth.driver' => [\\Illuminate\\Contracts\\Auth\\Guard::class],\n            'config' => [\\Illuminate\\Config\\Repository::class],\n        ] as $key => $aliases) {\n            foreach ($aliases as $alias) {\n                $this->alias($key, $alias);\n            }\n        }\n    }\n}\n",
  "framework/src/Illuminate/Support/composer.json": '{"autoload": {"psr-4": {"Illuminate\\\\Support\\\\": ""}}}\n',
  "framework/src/Illuminate/Support/Str.php": "<?php\n\nnamespace Illuminate\\Support;\n\nabstract class Str\n{\n    public function anonymous()\n    {\n        return new class {};\n    }\n}\n",
  "framework/tests/AfterEachTestExtension.php": "<?php\n",
  "framework/tests/Auth/AuthTest.php": "<?php\n",
  "framework/tests/Foundation/ApplicationTest.php": "<?php\n",
  "framework/tests/Foundation/Cloud/CloudManagerTest.php": "<?php\n",
  "framework/tests/Foundation/LaravelCloudJsonFormatterTest.php": "<?php\n",
  "framework/tests/Integration/Generators/ClassMakeCommandTest.php": "<?php\n",
  "framework/tests/Integration/Generators/TestCase.php": "<?php\n",
  "framework/tests/Support/SupportCollectionTest.php": "<?php\n",
  "framework/tests/Support/SupportStrTest.php": "<?php\n",
  "ai/phpunit.xml.dist": SUITE('    <testsuite name="Unit">\n      <directory suffix="Test.php">./tests/Unit</directory>\n    </testsuite>\n'),
  "ai/composer.json": '{"autoload": {"psr-4": {"Laravel\\\\Ai\\\\": "src/"}}}\n',
  "ai/src/Agent.php": "<?php\n\nnamespace Laravel\\Ai;\n\ninterface Agent\n{\n}\n",
  "ai/tests/Unit/AgentTest.php": "<?php\n",
  "ai/tests/Fixtures/FixtureTest.php": "<?php\n",
  "mcp/phpunit.xml.dist": SUITE(
    '    <testsuite name="Feature">\n      <directory suffix="Test.php">./tests/Feature</directory>\n      <exclude>./tests/Feature/Skipped</exclude>\n    </testsuite>\n    <testsuite name="Arch">\n      <file>tests/ArchTest.php</file>\n    </testsuite>\n',
  ),
  "mcp/composer.json": '{"autoload": {"psr-4": {"Laravel\\\\Mcp\\\\": "src/", "Laravel\\\\Mcp\\\\Server\\\\": "src/Server/"}}}\n',
  "mcp/src/Server/McpServiceProvider.php": "<?php\n\nnamespace Laravel\\Mcp\\Server;\n\nclass McpServiceProvider\n{\n    public function register()\n    {\n        $this->app->singletonIf(\"mcp.sdk\", fn () => null);\n    }\n}\n",
  "mcp/src/Server/Transport.php": "<?php\n\nnamespace Laravel\\Mcp\\Server;\n\nenum Transport: string\n{\n}\n",
  "mcp/tests/ArchTest.php": "<?php\n",
  "mcp/tests/Conformance/ConformanceTest.php": "<?php\n",
  "mcp/tests/Feature/ServerTest.php": "<?php\n",
  "mcp/tests/Feature/Skipped/SkippedTest.php": "<?php\n",
  "boost/phpunit.xml.dist": SUITE('    <testsuite name="Feature">\n      <directory suffix="Test.php">tests/Feature</directory>\n    </testsuite>\n'),
  "boost/composer.json": '{"autoload": {"psr-4": {"Laravel\\\\Boost\\\\": "src/"}}}\n',
  "boost/src/Boost.php": "<?php\n\nnamespace Laravel\\Boost;\n\nclass Boost\n{\n}\n",
  "boost/src/prompt.blade.php": "@boostsnippet('Example', 'php')\nclass Revenue extends Component { }\n",
  "boost/tests/Feature/InstallTest.php": "<?php\n",
};

/** The fixture's map, one hand-written line per record (the map is hand-signed data). */
const MAP_LINES: string[] = [
  '{"component":"ai","tests":[{"path":"ai/tests/","tags":[]}],"namespaces":["Laravel\\\\Ai\\\\"],"classes":[],"aliases":[]}',
  '{"component":"auth","tests":[{"path":"framework/tests/Auth/","tags":[]}],"namespaces":["Illuminate\\\\Auth\\\\"],"classes":[],"aliases":["auth","auth.driver"]}',
  '{"component":"boost","tests":[{"path":"boost/tests/","tags":[]}],"namespaces":["Laravel\\\\Boost\\\\"],"classes":[],"aliases":[]}',
  '{"component":"collections","tests":[{"path":"framework/tests/Support/SupportCollectionTest.php","tags":[]}],"namespaces":[],"classes":["Illuminate\\\\Support\\\\Collection","Illuminate\\\\Support\\\\Traits\\\\EnumeratesValues"],"aliases":[]}',
  '{"component":"config","tests":[],"namespaces":["Illuminate\\\\Config\\\\"],"classes":[],"aliases":["config"]}',
  '{"component":"foundation","tests":[{"path":"framework/tests/Foundation/","tags":[]},{"path":"framework/tests/Foundation/Cloud/","tags":["deferred:foundation-cloud"]},{"path":"framework/tests/Foundation/LaravelCloudJsonFormatterTest.php","tags":["deferred:foundation-cloud"]},{"path":"framework/tests/Integration/Generators/","tags":[]}],"namespaces":["Illuminate\\\\Foundation\\\\"],"classes":[],"aliases":["app"]}',
  '{"component":"mcp","tests":[{"path":"mcp/tests/","tags":[]}],"namespaces":["Laravel\\\\Mcp\\\\","Laravel\\\\Mcp\\\\Server\\\\"],"classes":[],"aliases":["mcp.sdk"]}',
  '{"component":"support","tests":[{"path":"framework/tests/Support/","tags":[]}],"namespaces":["Illuminate\\\\Support\\\\"],"classes":[],"aliases":[]}',
];

const HEADER = "# fixture component map\n#\n";

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}

interface Fixture {
  dir: string;
  /** Rewrites the fixture's map from record lines. */
  writeMap: (lines: readonly string[]) => void;
  /** Writes files into the fixture's snapshot (`framework/…`). */
  snapshot: (files: Record<string, string>) => void;
}

async function withFixture(body: (fx: Fixture) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "xaravel-component-map-"));
  try {
    mkdirSync(join(dir, "tools", "scaffold"), { recursive: true });
    copyFileSync(join(root, "tools", "scaffold", "packages.jsonl"), join(dir, "tools", "scaffold", "packages.jsonl"));
    const upstream = join(dir, "conformance", "upstream");
    writeFiles(upstream, SNAPSHOT);
    const fx: Fixture = {
      dir,
      writeMap: (lines) => writeFileSync(join(dir, COMPONENT_MAP_FILE), HEADER + lines.map((line) => `${line}\n`).join("")),
      snapshot: (files) => writeFiles(upstream, files),
    };
    fx.writeMap(MAP_LINES);
    await body(fx);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function cli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, CLI, ...args], { cwd: root, env: { PATH: process.env["PATH"] ?? "" }, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code, stdout, stderr };
}

/** MAP_LINES with the record of `component` replaced by `line`. */
function replaced(component: string, line: string): string[] {
  return MAP_LINES.map((current) => (current.startsWith(`{"component":"${component}"`) ? line : current));
}

// ---------------------------------------------------------------------------
// XT-conformance-45

xaravelTest("XT-conformance-45", "component-map:check maps every selected Upstream test file to exactly one Component and fails on an unmapped, doubly mapped, stale or redundant entry (FR-1.7)", async () => {
  await withFixture(async (fx) => {
    // The fixture map is current: counts per repository, exit 0.
    const ok = await cli(["check", "--root", fx.dir]);
    expect(ok.stderr).toBe("");
    expect(ok.code).toBe(0);
    expect(ok.stdout).toBe("framework: 7 test files\nai: 1 test files\nmcp: 2 test files\nboost: 1 test files\nComponent map OK: 11 test files map to exactly one Component.\n");

    // Only what phpunit.xml.dist selects is a test file: no extension class, no TestCase, no Conformance or Fixtures suite, no excluded directory.
    expect(testFiles(fx.dir, "framework")).toEqual([
      "framework/tests/Auth/AuthTest.php",
      "framework/tests/Foundation/ApplicationTest.php",
      "framework/tests/Foundation/Cloud/CloudManagerTest.php",
      "framework/tests/Foundation/LaravelCloudJsonFormatterTest.php",
      "framework/tests/Integration/Generators/ClassMakeCommandTest.php",
      "framework/tests/Support/SupportCollectionTest.php",
      "framework/tests/Support/SupportStrTest.php",
    ]);
    expect(testFiles(fx.dir, "ai")).toEqual(["ai/tests/Unit/AgentTest.php"]);
    expect(testFiles(fx.dir, "mcp")).toEqual(["mcp/tests/ArchTest.php", "mcp/tests/Feature/ServerTest.php"]);

    // Unmapped: a test file no entry matches.
    fx.snapshot({ "framework/tests/Cache/CacheRepositoryTest.php": "<?php\n" });
    const unmapped = await cli(["check", "--root", fx.dir]);
    expect(unmapped.code).toBe(1);
    expect(unmapped.stderr).toContain("  unmapped: framework/tests/Cache/CacheRepositoryTest.php\n");
    rmSync(join(fx.dir, "conformance", "upstream", "framework", "tests", "Cache"), { recursive: true });

    // Doubly mapped: the same entry under two Components.
    fx.writeMap(replaced("config", '{"component":"config","tests":[{"path":"framework/tests/Support/SupportCollectionTest.php","tags":[]}],"namespaces":["Illuminate\\\\Config\\\\"],"classes":[],"aliases":["config"]}'));
    const doubly = await cli(["check", "--root", fx.dir]);
    expect(doubly.code).toBe(1);
    expect(doubly.stderr).toContain("  doubly mapped: framework/tests/Support/SupportCollectionTest.php (collections, config)\n");
    // A directory prefix and a name prefix with the same prefix conflict too.
    expect(check(fx.dir).problems).toEqual(["doubly mapped: framework/tests/Support/SupportCollectionTest.php (collections, config)"]);
    fx.writeMap(replaced("config", '{"component":"config","tests":[{"path":"framework/tests/Support/*","tags":[]}],"namespaces":["Illuminate\\\\Config\\\\"],"classes":[],"aliases":["config"]}'));
    expect(check(fx.dir).problems).toEqual(["doubly mapped: framework/tests/Support/SupportStrTest.php (config, support)"]);

    // Stale: an entry that matches no test file, including an exact non-test file.
    fx.writeMap(replaced("config", '{"component":"config","tests":[{"path":"framework/tests/AfterEachTestExtension.php","tags":[]},{"path":"framework/tests/Config/","tags":[]}],"namespaces":["Illuminate\\\\Config\\\\"],"classes":[],"aliases":["config"]}'));
    const stale = await cli(["check", "--root", fx.dir]);
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain("  stale: framework/tests/AfterEachTestExtension.php (config) matches no test file\n");
    expect(stale.stderr).toContain("  stale: framework/tests/Config/ (config) matches no test file\n");

    // Redundant: an entry overriding one with the same Component and tags. A name prefix counts too.
    fx.writeMap(replaced("auth", '{"component":"auth","tests":[{"path":"framework/tests/Auth/","tags":[]},{"path":"framework/tests/Auth/AuthTest.php","tags":[]}],"namespaces":["Illuminate\\\\Auth\\\\"],"classes":[],"aliases":["auth","auth.driver"]}'));
    const redundant = await cli(["check", "--root", fx.dir]);
    expect(redundant.code).toBe(1);
    expect(redundant.stderr).toContain("  redundant: framework/tests/Auth/AuthTest.php (auth) overrides framework/tests/Auth/ with the same Component and tags\n");
    fx.writeMap(replaced("foundation", MAP_LINES[5]!.replace('{"path":"framework/tests/Foundation/LaravelCloudJsonFormatterTest.php"', '{"path":"framework/tests/Foundation/Cloud/Cloud*","tags":["deferred:foundation-cloud"]},{"path":"framework/tests/Foundation/LaravelCloudJsonFormatterTest.php"')));
    expect(check(fx.dir).problems).toEqual(["redundant: framework/tests/Foundation/Cloud/Cloud* (foundation) overrides framework/tests/Foundation/Cloud/ with the same Component and tags"]);
    // The same override with different tags is a remap, not redundant.
    fx.writeMap(MAP_LINES);
    expect(check(fx.dir).problems).toEqual([]);

    // ai, mcp and boost own their whole tests/: a framework Component cannot remap one.
    fx.writeMap(replaced("auth", '{"component":"auth","tests":[{"path":"ai/tests/Unit/AgentTest.php","tags":[]},{"path":"framework/tests/Auth/","tags":[]}],"namespaces":["Illuminate\\\\Auth\\\\"],"classes":[],"aliases":["auth","auth.driver"]}'));
    expect(check(fx.dir).problems).toEqual(["repo ownership: ai/tests/Unit/AgentTest.php resolves to auth, but every ai test belongs to ai"]);
    fx.writeMap(MAP_LINES);

    // A suite path that phpunit.xml.dist selects but that does not exist fails rather than dropping tests.
    rmSync(join(fx.dir, "conformance", "upstream", "mcp", "tests", "ArchTest.php"));
    const gone = await cli(["check", "--root", fx.dir]);
    expect(gone.code).toBe(1);
    expect(gone.stderr).toContain("conformance/upstream/mcp/phpunit.xml.dist selects tests/ArchTest.php, which does not exist");
    fx.snapshot({ "mcp/tests/ArchTest.php": "<?php\n" });
    expect(check(fx.dir).problems).toEqual([]);
  });

  // The real map against the real snapshot.
  if (HAS_SNAPSHOT) {
    const result = check(root);
    expect(result.problems).toEqual([]);
    expect(result.counts["framework"]).toBe(1004);
    const files = UPSTREAM_REPOS.flatMap(({ name }) => testFiles(root, name));
    for (const file of files) {
      expect([file, componentForTest(realMap, file) === null]).toEqual([file, false]);
    }
    expect(files).not.toContain("framework/tests/AfterEachTestExtension.php");
    expect(files.some((file) => file.startsWith("mcp/tests/Conformance/"))).toBe(false);
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-46

xaravelTest("XT-conformance-46", "each hand remap resolves to its Component, Foundation Cloud is tagged deferred:foundation-cloud, and every ai, mcp and boost test is its own Component (FR-1.7)", () => {
  const owner = (path: string): string | null => componentForTest(realMap, path)?.component ?? null;
  const remaps: [string, string][] = [
    ["framework/tests/Support/SupportArrTest.php", "collections"],
    ["framework/tests/Support/SupportCollectionTest.php", "collections"],
    ["framework/tests/Support/SupportLazyCollectionTest.php", "collections"],
    ["framework/tests/Support/SupportLazyCollectionIsLazyTest.php", "collections"],
    ["framework/tests/Support/SupportMacroableTest.php", "macroable"],
    ["framework/tests/Conditionable/ConditionableTest.php", "conditionable"],
    ["framework/tests/Support/SupportConditionableTest.php", "conditionable"],
    ["framework/tests/Support/SupportReflectorTest.php", "reflection"],
    ["framework/tests/Support/SupportReflectsClosuresTest.php", "reflection"],
    ["framework/tests/Integration/Generators/ClassMakeCommandTest.php", "foundation"],
    ["framework/tests/Integration/Migration/MigratorTest.php", "database"],
    ["framework/tests/Integration/Log/ContextTest.php", "log"],
    ["framework/tests/Integration/Log/ContextIntegrationTest.php", "log"],
    ["framework/tests/Http/Middleware/TrimStringsTest.php", "foundation"],
    ["framework/tests/Http/Middleware/PreventRequestForgeryTest.php", "foundation"],
    ["framework/tests/Http/Middleware/VitePreloadingTest.php", "foundation"],
    // Neighbours keep their directory's Component.
    ["framework/tests/Support/SupportStrTest.php", "support"],
    ["framework/tests/Http/Middleware/TrustProxiesTest.php", "http"],
    ["framework/tests/Foundation/FoundationApplicationTest.php", "foundation"],
  ];
  for (const [path, component] of remaps) {
    expect([path, owner(path)]).toEqual([path, component]);
  }
  for (const path of ["framework/tests/Foundation/Cloud/CloudManagerTest.php", "framework/tests/Foundation/Cloud/QueueTest.php", "framework/tests/Foundation/LaravelCloudJsonFormatterTest.php"]) {
    expect([path, componentForTest(realMap, path)]).toEqual([path, { component: "foundation", tags: ["deferred:foundation-cloud"] }]);
  }
  expect(componentForTest(realMap, "framework/tests/Foundation/FoundationApplicationTest.php")).toEqual({ component: "foundation", tags: [] });
  expect(componentForTest(realMap, "framework/AfterEachTestExtension.php")).toBeNull();
  for (const { name } of UPSTREAM_REPOS.filter((repo) => repo.name !== "framework")) {
    expect(componentForTest(realMap, `${name}/tests/Feature/ExampleTest.php`)).toEqual({ component: name, tags: [] });
  }
  // Every Upstream Component has a record, contracts included.
  const components = realMap.records.map((record) => record.component);
  for (const component of ["ai", "boost", "collections", "conditionable", "contracts", "foundation", "json-schema", "macroable", "mcp", "reflection", "support"]) {
    expect(components).toContain(component);
  }
  expect(realMap.records.find((record) => record.component === "contracts")!.tests).toEqual([]);

  if (HAS_SNAPSHOT) {
    for (const { name } of UPSTREAM_REPOS.filter((repo) => repo.name !== "framework")) {
      const files = testFiles(root, name);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        expect([file, componentForTest(realMap, file)]).toEqual([file, { component: name, tags: [] }]);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// XT-conformance-47

xaravelTest("XT-conformance-47", "every Component records its namespaces, classes and aliases, the lookups resolve, and the FQCN and alias derivations match the map (FR-1)", async () => {
  for (const [fqcn, component] of [
    ["Illuminate\\Support\\Collection", "collections"],
    ["\\Illuminate\\Support\\Collection", "collections"],
    ["Illuminate\\Support\\Arr", "collections"],
    ["Illuminate\\Support\\Str", "support"],
    ["Illuminate\\Support\\Facades\\Route", "support"],
    ["Illuminate\\Support\\Traits\\Macroable", "macroable"],
    ["Illuminate\\Support\\Traits\\Conditionable", "conditionable"],
    ["Illuminate\\Support\\Reflector", "reflection"],
    ["Illuminate\\Foundation\\Application", "foundation"],
    ["Illuminate\\Contracts\\Auth\\Guard", "contracts"],
    ["Laravel\\Ai\\Agent", "ai"],
    ["Laravel\\Mcp\\Server\\Tool", "mcp"],
    ["Laravel\\Boost\\Boost", "boost"],
  ] as const) {
    expect([fqcn, componentForFqcn(realMap, fqcn)]).toEqual([fqcn, component]);
  }
  expect(componentForFqcn(realMap, "Symfony\\Component\\HttpFoundation\\Request")).toBeNull();
  for (const [alias, component] of [
    ["auth.driver", "auth"],
    ["app", "foundation"],
    ["config", "config"],
    ["request", "http"],
    ["cache.psr6", "cache"],
    ["blade.compiler", "view"],
    ["mcp.sdk", "mcp"],
  ] as const) {
    expect([alias, componentForAlias(realMap, alias)]).toEqual([alias, component]);
  }
  expect(componentForAlias(realMap, "no.such.alias")).toBeNull();
  for (const record of realMap.records) {
    expect([record.component, record.namespaces.length + record.classes.length > 0]).toEqual([record.component, true]);
  }

  await withFixture(async (fx) => {
    // The fixture's derivations: Blade snippets and anonymous classes are not declarations; core aliases fall back to their first FQCN.
    expect([...declaredClasses(fx.dir)]).toEqual([
      ["Illuminate\\Auth\\AuthManager", "auth"],
      ["Illuminate\\Auth\\AuthServiceProvider", "auth"],
      ["Illuminate\\Config\\Repository", "config"],
      ["Illuminate\\Foundation\\Application", "foundation"],
      ["Illuminate\\Support\\Collection", "collections"],
      ["Illuminate\\Support\\Str", "support"],
      ["Illuminate\\Support\\Traits\\EnumeratesValues", "collections"],
      ["Laravel\\Ai\\Agent", "ai"],
      ["Laravel\\Boost\\Boost", "boost"],
      ["Laravel\\Mcp\\Server\\McpServiceProvider", "mcp"],
      ["Laravel\\Mcp\\Server\\Transport", "mcp"],
    ]);
    expect(expectedAliases(fx.dir)).toEqual({
      aliases: new Map([
        ["app", "foundation"],
        ["auth", "auth"],
        ["auth.driver", "auth"],
        ["config", "config"],
        ["mcp.sdk", "mcp"],
      ]),
      problems: [],
    });

    // FQCN drift: a Collections class missing from `classes`.
    fx.writeMap(replaced("collections", '{"component":"collections","tests":[{"path":"framework/tests/Support/SupportCollectionTest.php","tags":[]}],"namespaces":[],"classes":["Illuminate\\\\Support\\\\Collection"],"aliases":[]}'));
    const missing = await cli(["check", "--root", fx.dir]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("  fqcn drift: Illuminate\\Support\\Traits\\EnumeratesValues is owned by support, expected collections\n");

    // FQCN drift: a namespace listed twice, and a class the snapshot does not declare.
    fx.writeMap(replaced("collections", '{"component":"collections","tests":[{"path":"framework/tests/Support/SupportCollectionTest.php","tags":[]}],"namespaces":["Illuminate\\\\Support\\\\"],"classes":["Illuminate\\\\Support\\\\Collection","Illuminate\\\\Support\\\\Ghost","Illuminate\\\\Support\\\\Traits\\\\EnumeratesValues"],"aliases":[]}'));
    const twice = check(fx.dir).problems;
    expect(twice).toContain("fqcn drift: namespace Illuminate\\Support\\ appears twice (collections, support)");
    expect(twice).toContain("fqcn drift: class Illuminate\\Support\\Ghost is listed under collections, but the snapshot does not declare it");

    // FQCN drift: a namespace that no composer.json PSR-4 gives that Component.
    fx.writeMap(replaced("auth", '{"component":"auth","tests":[{"path":"framework/tests/Auth/","tags":[]}],"namespaces":["Illuminate\\\\Auth\\\\","Illuminate\\\\Bogus\\\\"],"classes":[],"aliases":["auth","auth.driver"]}'));
    expect(check(fx.dir).problems).toEqual(["fqcn drift: namespace Illuminate\\Bogus\\ is listed under auth, but its composer.json PSR-4 owner is no Component"]);

    // Alias drift: missing, extra, under the wrong Component.
    fx.writeMap(
      replaced("auth", '{"component":"auth","tests":[{"path":"framework/tests/Auth/","tags":[]}],"namespaces":["Illuminate\\\\Auth\\\\"],"classes":[],"aliases":["auth","config","made.up"]}').map((line) =>
        line.startsWith('{"component":"config"') ? line.replace('"aliases":["config"]', '"aliases":[]') : line,
      ),
    );
    const aliases = await cli(["check", "--root", fx.dir]);
    expect(aliases.code).toBe(1);
    expect(aliases.stderr).toContain("  alias drift: auth.driver expected auth, map has no Component\n");
    expect(aliases.stderr).toContain("  alias drift: config expected config, map has auth\n");
    expect(aliases.stderr).toContain("  alias drift: made.up expected no Component (not an alias), map has auth\n");

    // Alias drift: one key bound by two Components' providers.
    fx.writeMap(MAP_LINES);
    fx.snapshot({ "boost/src/BoostServiceProvider.php": "<?php\n\nnamespace Laravel\\Boost;\n\nclass BoostServiceProvider\n{\n    public function register()\n    {\n        $this->app->bindIf('auth', fn () => null);\n    }\n}\n" });
    const bound = check(fx.dir).problems;
    expect(bound).toEqual(["alias drift: auth is bound by providers of auth and boost"]);
  });

  if (HAS_SNAPSHOT) {
    const problems = check(root).problems;
    expect(problems.filter((line) => line.startsWith("fqcn drift") || line.startsWith("alias drift"))).toEqual([]);
    const classes = declaredClasses(root);
    expect(classes.get("Illuminate\\Support\\Collection")).toBe("collections");
    expect(classes.get("Illuminate\\Support\\Str")).toBe("support");
    for (const [fqcn, component] of classes) {
      expect([fqcn, componentForFqcn(realMap, fqcn)]).toEqual([fqcn, component]);
    }
    const derived = expectedAliases(root);
    expect(derived.problems).toEqual([]);
    for (const [alias, component] of derived.aliases) {
      expect([alias, componentForAlias(realMap, alias)]).toEqual([alias, component]);
    }
    expect(realMap.records.flatMap((record) => record.aliases).sort()).toEqual([...derived.aliases.keys()]);
  }
});

xaravelTest("XT-conformance-203", "a bad record fails with its line number, and a missing snapshot fails with the sync hint and no fetch (FR-1)", async () => {
  const at = (line: number): string => `${COMPONENT_MAP_FILE}:${line}: `;
  const names = ["ai", "auth", "support"];
  const ok = '{"component":"ai","tests":[],"namespaces":[],"classes":[],"aliases":[]}';
  expect(parseMap(`# header\n${ok}\n`, names).records.map((record) => [record.component, record.line])).toEqual([["ai", 2]]);
  const bad: [string, string][] = [
    [`# h\n{"component":"nope","tests":[],"namespaces":[],"classes":[],"aliases":[]}\n`, `${at(2)}unknown Component "nope"`],
    [`{"component":"auth","tests":[],"namespaces":[],"classes":[],"aliases":[]}\n${ok}\n`, `${at(2)}records are not sorted by component: ai follows auth`],
    [`${ok}\n${ok}\n`, `${at(2)}records are not sorted by component: ai follows ai`],
    [`{"component":"auth","tests":[],"namespaces":[],"classes":[],"aliases":["b","a"]}\n`, `${at(1)}auth aliases are not sorted and unique`],
    [`{"component":"auth","tests":[{"path":"framework/tests/B/","tags":[]},{"path":"framework/tests/A/","tags":[]}],"namespaces":[],"classes":[],"aliases":[]}\n`, `${at(1)}auth tests are not sorted and unique by path`],
    [`{"component":"auth","tests":[{"path":"framework/tests/A/","tags":["deferred:Foundation_Cloud"]}],"namespaces":[],"classes":[],"aliases":[]}\n`, `${at(1)}auth test path framework/tests/A/ has bad tag "deferred:Foundation_Cloud"`],
    [`{"component":"auth","tests":[{"path":"framework/tests/A/","tags":["skip:x"]}],"namespaces":[],"classes":[],"aliases":[]}\n`, `${at(1)}auth test path framework/tests/A/ has bad tag "skip:x"`],
    [`{"component":"auth","tests":[{"path":"tests/A/","tags":[]}],"namespaces":[],"classes":[],"aliases":[]}\n`, `${at(1)}auth test path "tests/A/" must start with`],
    [`# h\n\n{"component":"auth",\n`, `${at(2)}blank line`],
    [`# h\n{"component":"auth",\n`, `${at(2)}malformed JSON`],
    [`{"component":"auth","tests":[],"classes":[],"namespaces":[],"aliases":[]}\n`, `${at(1)}a record has exactly the keys`],
    [`${ok}\r\n`, `${at(1)}line endings must be LF`],
    [`{"component":"auth","tests":[{"path":"framework/tests/A/","tags":[]},{"path":"framework/tests/A/","tags":[]}],"namespaces":[],"classes":[],"aliases":[]}\n`, `${at(1)}auth tests are not sorted and unique by path`],
  ];
  for (const [text, message] of bad) {
    expect(() => parseMap(text, names)).toThrow(message);
  }

  await withFixture(async (fx) => {
    writeFileSync(join(fx.dir, COMPONENT_MAP_FILE), `${HEADER}${MAP_LINES[1]}\n${MAP_LINES[0]}\n`);
    const unsorted = await cli(["check", "--root", fx.dir]);
    expect(unsorted.code).toBe(1);
    expect(unsorted.stderr).toContain(`${at(4)}records are not sorted by component: ai follows auth`);

    // A Component of the package table with no record fails too.
    fx.writeMap(MAP_LINES.filter((line) => !line.startsWith('{"component":"config"')));
    expect(check(fx.dir).problems).toContain(`${COMPONENT_MAP_FILE}: no record for Upstream Component config`);

    // A package-table row that is not an Upstream Component cannot hold a record.
    fx.writeMap([...MAP_LINES.slice(0, 7), '{"component":"runtime","tests":[],"namespaces":[],"classes":[],"aliases":[]}', ...MAP_LINES.slice(7)]);
    expect(check(fx.dir).problems).toEqual([`${COMPONENT_MAP_FILE}: runtime is not an Upstream Component`]);

    // No snapshot: exit 1 with the sync hint.
    fx.writeMap(MAP_LINES);
    rmSync(join(fx.dir, "conformance", "upstream", "mcp"), { recursive: true });
    const absent = await cli(["check", "--root", fx.dir]);
    expect(absent.code).toBe(1);
    expect(absent.stderr).toContain("conformance/upstream/mcp is missing; run bun run upstream:sync");
    expect(existsSync(join(fx.dir, "conformance", "upstream", "mcp"))).toBe(false);
  });

  expect((await cli([])).code).toBe(2);
  expect((await cli(["check", "--bogus"])).code).toBe(2);
});

// ---------------------------------------------------------------------------
// XT-conformance-48

xaravelTest("XT-conformance-48", "conformance/component-map is a Protected Path whose CODEOWNERS owner is the Maintainer, and the check runs in its own read-only workflow (FR-1.7, AD-16.1, AD-16.3)", () => {
  const entries = parseList(readFileSync(join(root, LIST_PATH), "utf8"));
  const phases = activePhases(root);
  expect(isProtected(entries, phases, COMPONENT_MAP_FILE)).toBe(true);
  expect(isProtected(entries, phases, "tools/component-map/component-map.ts")).toBe(true);
  // The committed CODEOWNERS is the rendering of the list, and its last matching line owns the map for the Maintainer.
  const codeowners = readFileSync(join(root, CODEOWNERS_PATH), "utf8");
  expect(codeowners).toBe(renderCodeowners(entries, phases));
  const owning = codeowners
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split(/\s+/))
    .filter(([pattern]) => matches(pattern!, COMPONENT_MAP_FILE))
    .at(-1);
  expect(owning).toEqual(["/conformance/", MAINTAINER]);

  // The wiring: script, typecheck include, the workflow.
  const scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
  expect(scripts["component-map:check"]).toBe("bun tools/component-map/component-map.ts check");
  const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8")) as { include: string[] };
  expect(tsconfig.include).toContain("tools/component-map/**/*.ts");
  const text = readFileSync(join(root, ".github", "workflows", "component-map.yml"), "utf8");
  const workflow = Bun.YAML.parse(text) as {
    on: Record<string, unknown>;
    permissions: unknown;
    jobs: Record<string, Record<string, unknown> & { steps: { uses?: string; with?: Record<string, unknown>; run?: string }[] }>;
  };
  expect(Object.keys(workflow.on).sort()).toEqual(["merge_group", "pull_request", "push"]);
  expect(workflow.on["push"]).toEqual({ branches: ["main"] });
  expect(workflow.permissions).toEqual({ contents: "read" });
  // The job is not named `check`, so the required `check` context means only ci.yml's job.
  expect(Object.keys(workflow.jobs)).toEqual(["component-map"]);
  const job = workflow.jobs["component-map"]!;
  expect(job["permissions"]).toBeUndefined();
  expect(job["timeout-minutes"]).toBe(15);
  expect(job.steps[0]).toEqual({ uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", with: { "persist-credentials": false } });
  expect(job.steps[1]).toEqual({ uses: "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6", with: { "bun-version-file": ".bun-version" } });
  expect(job.steps.map((step) => step.run).filter((run) => run !== undefined)).toEqual([
    "bun run upstream:sync",
    "bun run upstream:check",
    "bun run component-map:check",
    "bun test conformance/tests/xaravel/component-map.test.ts",
  ]);
  for (const node of [job, ...job.steps]) {
    expect(node["continue-on-error" as keyof typeof node]).toBeUndefined();
    expect(node["if" as keyof typeof node]).toBeUndefined();
  }
});
