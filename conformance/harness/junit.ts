// Bun's junit report, as the harness reads it (Story 5.3).
//
// `parseJunit(xml)` maps each `<testcase>` name (entities decoded) to its
// outcome: `failed` when it holds a `<failure>` or `<error>` element (with
// that element's `type` and `message` attributes, decoded, or null), else
// `skipped` when it holds `<skipped>`, else `passed`. Bun 1.4.3 writes the
// thrown error's `name` as `type` and its message as `message`. When a name
// appears more than once, a failure wins over a skip, and a skip over a pass.

export type JunitOutcome = "passed" | "failed" | "skipped";

export interface JunitCase {
  readonly outcome: JunitOutcome;
  readonly type: string | null;
  readonly message: string | null;
}

const RANK: Readonly<Record<JunitOutcome, number>> = { passed: 0, skipped: 1, failed: 2 };
const NAMED: Readonly<Record<string, string>> = { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&" };

/** Decodes the XML character and entity references Bun writes. */
export function unescapeXml(text: string): string {
  return text.replace(/&(quot|apos|lt|gt|amp|#\d+|#x[0-9a-f]+);/gi, (entity: string, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    }
    return NAMED[code.toLowerCase()] ?? entity;
  });
}

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attributes);
  return match === null ? null : unescapeXml(match[1]!);
}

/** Every testcase in `xml`, by name. */
export function parseJunit(xml: string): Map<string, JunitCase> {
  const cases = new Map<string, JunitCase>();
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const name = attribute(match[1]!, "name");
    if (name === null) {
      continue;
    }
    const body = match[3] ?? "";
    const failure = /<(?:failure|error)\b([^>]*?)\/?>/.exec(body);
    const result: JunitCase =
      failure !== null
        ? { outcome: "failed", type: attribute(failure[1]!, "type"), message: attribute(failure[1]!, "message") }
        : { outcome: /<skipped\b/.test(body) ? "skipped" : "passed", type: null, message: null };
    const previous = cases.get(name);
    if (previous === undefined || RANK[result.outcome] > RANK[previous.outcome]) {
      cases.set(name, result);
    }
  }
  return cases;
}
