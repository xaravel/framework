// PHPUnit 13.4.3's `TestCase\OutputBuffer` (Story 4.4), over the output
// channel `process.stdout.write` (ESC-4.4-2 item 2): while a TestCase test
// runs, what it writes there is captured; output nobody expected is written
// through to the real stream when the buffer stops, as PHPUnit prints
// unexpected output. Bun's `console.log` does not go through
// `process.stdout.write`, so it is never captured. Internal to the grader.
import { Assert } from "../Assert";

type Write = typeof process.stdout.write;

// The real `process.stdout.write`, taken once on load: a buffer always restores this one, so a test bun abandoned
// (a timeout: its lifecycle never stopped its buffer) leaves its capture in place only until the next TestCase
// test's buffer stops. Output that non-TestCase tests write in between goes into the abandoned capture and is lost.
// A wrapper someone installs over `process.stdout.write` after this module loads is replaced when a buffer stops.
// oxlint-disable-next-line typescript/unbound-method -- called with process.stdout
const REAL_WRITE: Write = process.stdout.write;

function text(chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString("utf8");
  }
  return String(chunk);
}

export class OutputBuffer {
  private output = "";
  private readonly expectedStrings: string[] = [];
  private bufferingActive = false;
  private bufferingCaptured = "";

  expectString(expectedString: string): void {
    if (!this.expectedStrings.includes(expectedString)) {
      this.expectedStrings.push(expectedString);
    }
  }

  hasExpectation(): boolean {
    return this.expectedStrings.length > 0;
  }

  expectsOutput(): boolean {
    return this.hasExpectation();
  }

  start(): void {
    if (this.bufferingActive) {
      return;
    }
    this.bufferingCaptured = "";
    const stdout = process.stdout;
    const capture = (chunk: unknown, encoding?: unknown, callback?: unknown): boolean => {
      this.bufferingCaptured += text(chunk);
      const done = typeof encoding === "function" ? encoding : callback;
      if (typeof done === "function") {
        (done as () => void)();
      }
      return true;
    };
    stdout.write = capture as Write;
    this.bufferingActive = true;
  }

  /** Stops capturing; writes the output through when nothing expected it. */
  stop(): void {
    if (!this.bufferingActive) {
      return;
    }
    process.stdout.write = REAL_WRITE;
    this.output = this.bufferingCaptured;
    this.bufferingActive = false;
    if (this.output !== "" && !this.expectsOutput()) {
      REAL_WRITE.call(process.stdout, this.output);
    }
  }

  performAssertions(): void {
    for (const expectedString of this.expectedStrings) {
      Assert.assertSame(expectedString, this.output);
    }
  }
}
