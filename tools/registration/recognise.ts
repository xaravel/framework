// The one `registerClass` recogniser (Story 6.6; AD-10), shared by the
// registration scan (`./registration.ts`, which re-exports it), the API-surface
// diff (`tools/api-surface`) and the thenable resolver
// (`tools/lint-rules/thenables.ts`, Retro 6 item 12). It imports nothing from
// `tools/async-surface`, which imports the resolver, so there is no cycle.

/** An oxc-parser ESTree node, read structurally. */
export type Node = { readonly type: string; readonly start: number; readonly end: number; readonly [key: string]: unknown };

function node(value: unknown): Node | null {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string" ? (value as Node) : null;
}

function nodes(value: unknown): Node[] {
  return Array.isArray(value) ? value.map(node).filter((n): n is Node => n !== null) : [];
}

/** A PHP FQCN: identifier segments joined by single `\`, with an optional leading `\`. */
const FQCN = /^\\?[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*(?:\\[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*)*$/;

/** A conforming registration: the FQCN without its leading `\`, the literal as written, and the class identifier. */
export interface RecognisedRegistration {
  /** The FQCN without a leading `\` (`normaliseFqcn(literal)`). */
  readonly fqcn: string;
  /** The string literal's value as written, leading `\` included. */
  readonly literal: string;
  /** The class identifier (the second argument). */
  readonly name: string;
}

/** A top-level `registerClass(...)` statement's call, and its registration when it conforms. */
export interface RecognisedCall {
  readonly call: Node;
  readonly registration: RecognisedRegistration | null;
}

/** Whether `value` is shaped as a PHP FQCN: identifier segments joined by single `\`, with an optional leading `\`. */
export function isFqcn(value: string): boolean {
  return FQCN.test(value);
}

/** A PHP FQCN without its optional leading `\` (`\A\Foo` → `A\Foo`); the case is kept. */
export function normaliseFqcn(fqcn: string): string {
  return fqcn.startsWith("\\") ? fqcn.slice(1) : fqcn;
}

/**
 * The one registration recogniser (the scan, `tools/api-surface` and the thenable resolver share it): a top-level
 * statement that is an expression statement calling the identifier `registerClass` directly (not optionally, not
 * wrapped) yields its call, with the registration when it is `registerClass('<FQCN>', X)`; any other statement yields
 * null.
 */
export function recogniseRegistration(statement: Node): RecognisedCall | null {
  if (statement.type !== "ExpressionStatement") {
    return null;
  }
  const call = node(statement["expression"]);
  if (call === null || call.type !== "CallExpression" || call["optional"] === true) {
    return null;
  }
  const callee = node(call["callee"]);
  if (callee === null || callee.type !== "Identifier" || callee["name"] !== "registerClass") {
    return null;
  }
  return { call, registration: conforming(call) };
}

/** A conforming call's registration, or null. */
function conforming(call: Node): RecognisedRegistration | null {
  const args = nodes(call["arguments"]);
  if (args.length !== 2) {
    return null;
  }
  const [fqcn, cls] = args as [Node, Node];
  if (fqcn.type !== "Literal" || typeof fqcn["value"] !== "string" || !isFqcn(fqcn["value"]) || cls.type !== "Identifier" || typeof cls["name"] !== "string") {
    return null;
  }
  return { fqcn: normaliseFqcn(fqcn["value"]), literal: fqcn["value"], name: cls["name"] };
}
