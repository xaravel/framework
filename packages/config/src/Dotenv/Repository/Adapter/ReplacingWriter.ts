// `Dotenv\Repository\Adapter\ReplacingWriter` (vlucas/phpdotenv v5.7.0), ported line for line. Its record of seen
// variables is a `PhpArray`, keyed as PHP keys it (AD-9).
import { registerClass } from "@xaravel/runtime";
import { PhpArray } from "@xaravel/runtime/php";
import { ReaderInterface } from "./ReaderInterface";
import { WriterInterface } from "./WriterInterface";

/** Writes only variables that exist, or have existed, in the reader. */
export class ReplacingWriter implements WriterInterface {
  /** The inner writer to use. */
  private readonly writer: WriterInterface;

  /** The inner reader to use. */
  private readonly reader: ReaderInterface;

  /** The record of seen variables. */
  private readonly seen: PhpArray<string | number, string>;

  get [WriterInterface.brand](): true {
    return true;
  }

  /** Create a new replacement writer instance. */
  constructor(writer: WriterInterface, reader: ReaderInterface) {
    this.writer = writer;
    this.reader = reader;
    this.seen = new PhpArray();
  }

  /** Write to an environment variable, if possible. */
  write(name: string, value: string): boolean {
    if (this.exists(name)) {
      return this.writer.write(name, value);
    }

    // succeed if nothing to do
    return true;
  }

  /** Delete an environment variable, if possible. */
  delete(name: string): boolean {
    if (this.exists(name)) {
      return this.writer.delete(name);
    }

    // succeed if nothing to do
    return true;
  }

  /**
   * Does the given environment variable exist.
   *
   * Returns true if it currently exists, or existed at any point in the past that we are aware of.
   */
  private exists(name: string): boolean {
    if (this.seen.has(name)) {
      return true;
    }

    if (this.reader.read(name).isDefined()) {
      this.seen.set(name, "");

      return true;
    }

    return false;
  }
}

registerClass("Dotenv\\Repository\\Adapter\\ReplacingWriter", ReplacingWriter);
