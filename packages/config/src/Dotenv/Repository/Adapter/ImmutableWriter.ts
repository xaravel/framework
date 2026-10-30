// `Dotenv\Repository\Adapter\ImmutableWriter` (vlucas/phpdotenv v5.7.0), ported line for line. Its record of loaded
// variables is a `PhpArray`, keyed as PHP keys it (AD-9).
import { registerClass } from "@xaravel/runtime";
import { PhpArray } from "@xaravel/runtime/php";
import { ReaderInterface } from "./ReaderInterface";
import { WriterInterface } from "./WriterInterface";

/** Writes only variables that are not already defined outside phpdotenv: real environment variables win. */
export class ImmutableWriter implements WriterInterface {
  /** The inner writer to use. */
  private readonly writer: WriterInterface;

  /** The inner reader to use. */
  private readonly reader: ReaderInterface;

  /** The record of loaded variables. */
  private readonly loaded: PhpArray<string | number, string>;

  /** The `WriterInterface` brand: an `instanceof WriterInterface` check finds this class (AD-9.5). */
  get [WriterInterface.brand](): true {
    return true;
  }

  /** Create a new immutable writer instance. */
  constructor(writer: WriterInterface, reader: ReaderInterface) {
    this.writer = writer;
    this.reader = reader;
    this.loaded = new PhpArray();
  }

  /** Write to an environment variable, if possible. */
  write(name: string, value: string): boolean {
    // Don't overwrite existing environment variables
    // Ruby's dotenv does this with `ENV[key] ||= value`
    if (this.isExternallyDefined(name)) {
      return false;
    }

    // Set the value on the inner writer
    if (!this.writer.write(name, value)) {
      return false;
    }

    // Record that we have loaded the variable
    this.loaded.set(name, "");

    return true;
  }

  /** Delete an environment variable, if possible. */
  delete(name: string): boolean {
    // Don't clear existing environment variables
    if (this.isExternallyDefined(name)) {
      return false;
    }

    // Clear the value on the inner writer
    if (!this.writer.delete(name)) {
      return false;
    }

    // Leave the variable as fair game
    this.loaded.delete(name);

    return true;
  }

  /**
   * Determine if the given variable is externally defined.
   *
   * That is, is it an "existing" variable.
   */
  private isExternallyDefined(name: string): boolean {
    return this.reader.read(name).isDefined() && !this.loaded.has(name);
  }
}

registerClass("Dotenv\\Repository\\Adapter\\ImmutableWriter", ImmutableWriter);
