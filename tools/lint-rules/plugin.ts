// The `xaravel` oxlint JS plugin (Story 6.2; AD-1, AD-3, AD-7, AD-10, AD-15,
// AD-23). Loaded by the root `.oxlintrc.json` (`jsPlugins`), each rule an
// error at the top level and a spine rule (`SPINE_RULES` in `./disables`), so
// no directive or nested config may switch it off.
//
//   no-identity-constructor-name  `<expr>.constructor.name` outside the grader's
//                                 locations (AD-10; decisions/ESC-6.2-1.md)
//   no-framework-json-stringify   `JSON.stringify` in `packages/<p>/src/`, `<p>`
//                                 not a grader package (AD-23)
//   no-ported-bun-expect          `expect` from `bun:test` under `tests/ported/` (AD-15)
//   no-type-import-injection      a type-only import used as a value in `inject(...)` (AD-1)
//   no-model-private              `#private` in `Model` or its concerns (AD-7)
//   no-package-default-export     a default export from `packages/<p>/src/` or `installer/src/` (AD-3)
//
// The rules need no type information. Path scopes test the file's path
// relative to `process.cwd()` when inside it, else its absolute path, by
// segment, so they hold on the real tree and on temp roots alike.

/** The minimal ESTree / TS-ESTree node shape these rules read. */
interface Node {
  readonly type: string;
  readonly parent?: Node | null;
  readonly name?: string;
  readonly value?: unknown;
  readonly computed?: boolean;
  readonly shorthand?: boolean;
  readonly object?: Node;
  readonly property?: Node;
  readonly expression?: Node;
  readonly expressions?: readonly Node[];
  readonly quasis?: readonly { readonly value: { readonly cooked: string | null } }[];
  readonly callee?: Node;
  readonly arguments?: readonly Node[];
  readonly key?: Node;
  readonly id?: Node | null;
  readonly init?: Node | null;
  readonly left?: Node;
  readonly right?: Node;
  readonly properties?: readonly Node[];
  readonly source?: Node | null;
  readonly specifiers?: readonly Node[];
  readonly body?: readonly Node[];
  readonly imported?: Node;
  readonly exported?: Node | null;
  readonly local?: Node;
  readonly importKind?: string;
  readonly exportKind?: string;
}

interface Context {
  readonly filename: string;
  report(descriptor: { node: Node; message: string }): void;
}

type Visitor = Readonly<Record<string, (node: Node) => void>>;

/** The visitor of a rule whose path scope excludes the file. */
const NONE: Visitor = {};

interface Rule {
  readonly meta: { readonly type: "problem"; readonly docs: { readonly description: string } };
  create(context: Context): Visitor;
}

/** The six rule names, as configured (`xaravel/<name>`). */
export const RULE_NAMES: readonly string[] = [
  "no-identity-constructor-name",
  "no-framework-json-stringify",
  "no-ported-bun-expect",
  "no-type-import-injection",
  "no-model-private",
  "no-package-default-export",
];

/** Grader packages, which may use `JSON.stringify` in `src/` (spine Dependency-direction table). */
export const GRADER_PACKAGES: readonly string[] = ["assert", "mockery"];

export const MESSAGES = {
  constructorName: "`constructor.name` used for identity; use fqcn() (AD-10)",
  jsonStringify: "`JSON.stringify` in framework source; encode with jsonEncode / phpSerialize from @xaravel/runtime/php (AD-23)",
  portedExpect: "`expect` from `bun:test` in a Ported Test; use portedTest(...) and @xaravel/assert (AD-15)",
  typeImportInjection: (name: string): string => `\`${name}\` is imported with \`import type\` but injected as a value; import the contract token as a value (AD-1)`,
  modelPrivate: "`#private` in Model or its concerns, which the Model Proxy cannot reach; use a Symbol slot (AD-7)",
  defaultExport: "default export from a package; use named exports only (AD-3)",
} as const;

// ---------------------------------------------------------------------------
// Paths

/** The file's path for scope tests: relative to the cwd when inside it, else absolute; `/`-separated. */
export function scopePath(filename: string, cwd: string = process.cwd()): string {
  const file = filename.replaceAll("\\", "/");
  const base = cwd.replaceAll("\\", "/").replace(/\/+$/, "");
  return file.startsWith(`${base}/`) ? file.slice(base.length + 1) : file;
}

/** The grader's locations, exempt from the identity rule: the grader cannot call fqcn() (AD-15; decisions/ESC-6.2-1.md). */
const GRADER_LOCATIONS = /^(packages\/(assert|mockery)|conformance|tools)\//;
/** The repository's root-level directories, which locate the repository root inside an absolute path. */
const ROOT_MARKER = /\/(packages\/[^/]+|conformance|tools|skeleton|installer)\//;

const PACKAGE_SRC = /(^|\/)packages\/([^/]+)\/src\//;
const INSTALLER_SRC = /(^|\/)installer\/src\//;
const PORTED_TESTS = /(^|\/)tests\/ported\//;
const MODEL_FILES = /(^|\/)packages\/database\/src\/Eloquent\/(Model\.ts$|Concerns\/)/;

export function isFrameworkSource(path: string): boolean {
  const match = PACKAGE_SRC.exec(path);
  return match !== null && !GRADER_PACKAGES.includes(match[2]!);
}

/**
 * Whether `path` is in the grader's locations. A cwd-relative path is matched at its start; an absolute one from its
 * first root-level marker segment, so a nested `tools/` or `conformance/` inside a package is not exempt.
 */
export function isGraderLocation(path: string): boolean {
  if (!path.startsWith("/") && !/^[A-Za-z]:\//.test(path)) {
    return GRADER_LOCATIONS.test(path);
  }
  const marker = ROOT_MARKER.exec(path);
  return marker !== null && GRADER_LOCATIONS.test(path.slice(marker.index + 1));
}

export function isPackageSource(path: string): boolean {
  return PACKAGE_SRC.test(path) || INSTALLER_SRC.test(path);
}

export function isPortedTest(path: string): boolean {
  return PORTED_TESTS.test(path);
}

export function isModelFile(path: string): boolean {
  return MODEL_FILES.test(path);
}

// ---------------------------------------------------------------------------
// AST helpers

/** Skips `x!`, `x as T`, `x satisfies T`, `<T>x`, a parenthesised optional chain, and parentheses (which ESTree drops). */
function unwrap(node: Node): Node {
  let current = node;
  while (
    (current.type === "TSNonNullExpression" || current.type === "TSAsExpression" || current.type === "TSSatisfiesExpression" || current.type === "TSTypeAssertion" || current.type === "ParenthesizedExpression" || current.type === "ChainExpression") &&
    current.expression !== undefined
  ) {
    current = current.expression;
  }
  return current;
}

/** A string literal's value, or a template literal's without substitutions; else null. */
function staticString(node: Node | undefined | null): string | null {
  if (node === undefined || node === null) {
    return null;
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateLiteral" && node.expressions !== undefined && node.expressions.length === 0 && node.quasis?.length === 1) {
    return node.quasis[0]!.value.cooked;
  }
  return null;
}

/** The property a member expression reads, by name (`a.b`, `a?.b`, `a["b"]`); else null. */
function memberName(node: Node): string | null {
  if (node.type !== "MemberExpression" || node.property === undefined) {
    return null;
  }
  if (node.computed === true) {
    return staticString(node.property);
  }
  return node.property.type === "Identifier" ? (node.property.name ?? null) : null;
}

/** A property key's static name (`name`, `"name"`, `["name"]`); else null. */
function keyName(property: Node): string | null {
  const key = property.key;
  if (key === undefined) {
    return null;
  }
  if (property.computed !== true && key.type === "Identifier") {
    return key.name ?? null;
  }
  return staticString(key);
}

/** An import/export specifier name (`x` or `"x"`). */
function specifierName(node: Node | undefined | null): string | null {
  if (node === undefined || node === null) {
    return null;
  }
  return node.type === "Identifier" ? (node.name ?? null) : staticString(node);
}

/** `<expr>.constructor`, but not a bare identifier named `constructor`. */
function isConstructorAccess(node: Node): boolean {
  return memberName(unwrap(node)) === "constructor";
}

/** `JSON` or `globalThis.JSON`. */
function isJsonObject(node: Node): boolean {
  const target = unwrap(node);
  if (target.type === "Identifier") {
    return target.name === "JSON";
  }
  return memberName(target) === "JSON" && target.object !== undefined && unwrap(target.object).type === "Identifier" && unwrap(target.object).name === "globalThis";
}

/** A callee `inject` or `<obj>.inject`. */
function isInjectCallee(node: Node): boolean {
  const callee = unwrap(node);
  return (callee.type === "Identifier" && callee.name === "inject") || memberName(callee) === "inject";
}

const VALUE_WRAPPERS = new Set(["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "TSInstantiationExpression"]);

function rule(description: string, create: (context: Context, path: string) => Visitor): Rule {
  return {
    meta: { type: "problem", docs: { description } },
    create(context: Context): Visitor {
      return create(context, scopePath(context.filename));
    },
  };
}

// ---------------------------------------------------------------------------
// Rules

const noIdentityConstructorName = rule("Disallow `constructor.name`; identity is fqcn() (AD-10).", (context, path) => {
  if (isGraderLocation(path)) {
    return NONE;
  }
  const reportPattern = (pattern: Node | undefined | null, source: Node | undefined | null, node: Node): void => {
    if (pattern?.type !== "ObjectPattern" || source === undefined || source === null || !isConstructorAccess(source)) {
      return;
    }
    if (pattern.properties?.some((property) => property.type === "Property" && keyName(property) === "name") === true) {
      context.report({ node, message: MESSAGES.constructorName });
    }
  };
  return {
    MemberExpression(node: Node): void {
      if (memberName(node) === "name" && node.object !== undefined && isConstructorAccess(node.object)) {
        context.report({ node, message: MESSAGES.constructorName });
      }
    },
    VariableDeclarator(node: Node): void {
      reportPattern(node.id, node.init, node);
    },
    AssignmentExpression(node: Node): void {
      reportPattern(node.left, node.right, node);
    },
  };
});

const noFrameworkJsonStringify = rule("Disallow `JSON.stringify` in framework source; use jsonEncode (AD-23).", (context, path) => {
  if (!isFrameworkSource(path)) {
    return NONE;
  }
  const reportPattern = (pattern: Node | undefined | null, source: Node | undefined | null, node: Node): void => {
    if (pattern?.type !== "ObjectPattern" || source === undefined || source === null || !isJsonObject(source)) {
      return;
    }
    if (pattern.properties?.some((property) => property.type === "Property" && keyName(property) === "stringify") === true) {
      context.report({ node, message: MESSAGES.jsonStringify });
    }
  };
  return {
    MemberExpression(node: Node): void {
      if (memberName(node) === "stringify" && node.object !== undefined && isJsonObject(node.object)) {
        context.report({ node, message: MESSAGES.jsonStringify });
      }
    },
    VariableDeclarator(node: Node): void {
      reportPattern(node.id, node.init, node);
    },
    AssignmentExpression(node: Node): void {
      reportPattern(node.left, node.right, node);
    },
  };
});

const BUN_TEST = "bun:test";

const noPortedBunExpect = rule("Disallow `expect` from `bun:test` in Ported Tests (AD-15).", (context, path) => {
  if (!isPortedTest(path)) {
    return NONE;
  }
  const report = (node: Node): void => context.report({ node, message: MESSAGES.portedExpect });
  return {
    ImportDeclaration(node: Node): void {
      if (staticString(node.source) !== BUN_TEST || node.importKind === "type") {
        return;
      }
      for (const specifier of node.specifiers ?? []) {
        if (specifier.type === "ImportNamespaceSpecifier") {
          report(specifier);
        } else if (specifier.type === "ImportSpecifier" && specifier.importKind !== "type" && specifierName(specifier.imported) === "expect") {
          report(specifier);
        }
      }
    },
    ExportNamedDeclaration(node: Node): void {
      if (staticString(node.source) !== BUN_TEST || node.exportKind === "type") {
        return;
      }
      for (const specifier of node.specifiers ?? []) {
        if (specifier.exportKind !== "type" && specifierName(specifier.local) === "expect") {
          report(specifier);
        }
      }
    },
    ExportAllDeclaration(node: Node): void {
      if (staticString(node.source) === BUN_TEST && node.exportKind !== "type") {
        report(node);
      }
    },
    ImportExpression(node: Node): void {
      if (staticString(node.source) === BUN_TEST) {
        report(node);
      }
    },
    CallExpression(node: Node): void {
      const callee = node.callee === undefined ? null : unwrap(node.callee);
      const isRequire = callee !== null && ((callee.type === "Identifier" && callee.name === "require") || memberName(callee) === "require");
      if (isRequire && staticString(node.arguments?.[0]) === BUN_TEST) {
        report(node);
      }
    },
  };
});

const noTypeImportInjection = rule("Disallow a type-only import used as a value in inject(...) (AD-1).", (context) => {
  const typeOnly = new Set<string>();

  /** Whether `node` (an Identifier) is a value reference: not a property key, member name or declaration name. */
  const isValueReference = (node: Node): boolean => {
    const parent = node.parent;
    if (parent === undefined || parent === null) {
      return false;
    }
    if (parent.type === "MemberExpression") {
      return parent.object === node || parent.computed === true;
    }
    if (parent.type === "Property") {
      return parent.value === node || (parent.key === node && parent.computed === true);
    }
    return true;
  };

  /** Whether `node` sits in value position inside the arguments of an `inject(...)` call or decorator. */
  const inInjectArguments = (node: Node): boolean => {
    let child = node;
    let parent = node.parent;
    while (parent !== undefined && parent !== null) {
      if (parent.type.startsWith("TS") && !(VALUE_WRAPPERS.has(parent.type) && parent.expression === child)) {
        return false;
      }
      if (parent.type === "CallExpression" && parent.callee !== undefined && isInjectCallee(parent.callee) && parent.arguments?.includes(child) === true) {
        return true;
      }
      if (parent.type === "Program") {
        return false;
      }
      child = parent;
      parent = parent.parent;
    }
    return false;
  };

  return {
    // Imports are hoisted, so collect them all before any `inject(...)` is visited.
    Program(node: Node): void {
      for (const statement of node.body ?? []) {
        if (statement.type !== "ImportDeclaration") {
          continue;
        }
        for (const specifier of statement.specifiers ?? []) {
          const local = specifier.local?.name;
          if (local !== undefined && (statement.importKind === "type" || specifier.importKind === "type")) {
            typeOnly.add(local);
          }
        }
      }
    },
    Identifier(node: Node): void {
      if (node.name !== undefined && typeOnly.has(node.name) && isValueReference(node) && inInjectArguments(node)) {
        context.report({ node, message: MESSAGES.typeImportInjection(node.name) });
      }
    },
  };
});

const noModelPrivate = rule("Disallow `#private` in Model and its concerns (AD-7).", (context, path) => {
  if (!isModelFile(path)) {
    return NONE;
  }
  return {
    PrivateIdentifier(node: Node): void {
      context.report({ node, message: MESSAGES.modelPrivate });
    },
  };
});

const noPackageDefaultExport = rule("Disallow default exports from packages (AD-3).", (context, path) => {
  if (!isPackageSource(path)) {
    return NONE;
  }
  const report = (node: Node): void => context.report({ node, message: MESSAGES.defaultExport });
  return {
    ExportDefaultDeclaration(node: Node): void {
      report(node);
    },
    ExportNamedDeclaration(node: Node): void {
      for (const specifier of node.specifiers ?? []) {
        if (specifierName(specifier.exported) === "default") {
          report(specifier);
        }
      }
    },
    ExportAllDeclaration(node: Node): void {
      if (specifierName(node.exported) === "default") {
        report(node);
      }
    },
  };
});

const plugin = {
  meta: { name: "xaravel" },
  rules: {
    "no-identity-constructor-name": noIdentityConstructorName,
    "no-framework-json-stringify": noFrameworkJsonStringify,
    "no-ported-bun-expect": noPortedBunExpect,
    "no-type-import-injection": noTypeImportInjection,
    "no-model-private": noModelPrivate,
    "no-package-default-export": noPackageDefaultExport,
  },
};

// oxlint loads a JS plugin from its default export.
export default plugin;
