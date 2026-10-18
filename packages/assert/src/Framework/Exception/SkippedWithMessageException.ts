// PHPUnit 13.4.3's `SkippedWithMessageException` (Story 4.4): what
// `markTestSkipped()` throws. It is a `SkippedTest`: `portedTest` and
// `xaravelTest` end a test that throws one as skipped (a pass in bun, with
// `skipped: <message>` in its report), never as a failure.
import { AssertionFailedError } from "../AssertionFailedError";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

/** The brand of PHPUnit's `SkippedTest` interface, read by the declarations. */
export const SKIPPED_TEST: unique symbol = Symbol.for("xaravel.phpunit.skipped-test");

export class SkippedWithMessageException extends AssertionFailedError {
  static readonly [CLASS_FQCN]: string = "PHPUnit\\Framework\\SkippedWithMessageException";

  constructor(message: string = "", code: number | string = 0, previous: Error | null = null) {
    super(message, code, previous);
    this.name = "SkippedWithMessageException";
  }

  get [SKIPPED_TEST](): true {
    return true;
  }
}

/** Whether `value` is a PHPUnit `SkippedTest`. */
export function isSkippedTest(value: unknown): value is SkippedWithMessageException {
  return typeof value === "object" && value !== null && (value as { [SKIPPED_TEST]?: unknown })[SKIPPED_TEST] === true;
}
