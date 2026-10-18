// The grader's exception protocol (Story 4.4): how a thrown value reads as a
// PHP `Throwable` for the exception expectations and constraints.
// Internal to the grader.
//
// - A Throwable is a JS `Error`.
// - Its message is `getMessage()` when that is a function, else `message`.
// - Its code is `getCode()` when that is a function, else 0.
// - Its stack trace is the JS stack's frame locations, one `<location>\n`
//   each, in place of PHP's filtered `file:line` trace (ESC-4.4-2 item 3).

/** Whether `value` is a PHP Throwable here: a JS `Error`. */
export function isThrowable(value: unknown): value is Error {
  return value instanceof Error;
}

/** The thrown value's `getMessage()`. */
export function messageOf(value: Error): string {
  const getMessage: unknown = (value as { getMessage?: unknown }).getMessage;
  if (typeof getMessage === "function") {
    return String((getMessage as () => unknown).call(value));
  }
  return String(value.message);
}

/** The thrown value's `getCode()`. */
export function codeOf(value: Error): unknown {
  const getCode: unknown = (value as { getCode?: unknown }).getCode;
  if (typeof getCode === "function") {
    return (getCode as () => unknown).call(value);
  }
  return 0;
}

/** `Filter::stackTraceFromThrowableAsString`, from the JS stack: each frame's location and a newline. */
export function stackTraceOf(value: Error): string {
  const stack = typeof value.stack === "string" ? value.stack : "";
  let trace = "";
  for (const line of stack.split("\n")) {
    const frame = /^\s+at (?:.*? \((.*)\)|(.*))$/.exec(line);
    if (frame !== null) {
      trace += `${frame[1] ?? frame[2] ?? ""}\n`;
    }
  }
  return trace;
}
