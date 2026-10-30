// `Dotenv\Repository\Adapter\GuardedWriter` (vlucas/phpdotenv v5.7.0), ported line for line.
import { registerClass } from "@xaravel/runtime";
import { in_array } from "@xaravel/runtime/php";
import { WriterInterface } from "./WriterInterface";

/** Writes only the variables of an allow list. */
export class GuardedWriter implements WriterInterface {
  /** The inner writer to use. */
  private readonly writer: WriterInterface;

  /** The variable name allow list. */
  private readonly allowList: readonly string[];

  get [WriterInterface.brand](): true {
    return true;
  }

  /** Create a new guarded writer instance. */
  constructor(writer: WriterInterface, allowList: readonly string[]) {
    this.writer = writer;
    this.allowList = allowList;
  }

  /** Write to an environment variable, if possible. */
  write(name: string, value: string): boolean {
    // Don't set non-allowed variables
    if (!this.isAllowed(name)) {
      return false;
    }

    // Set the value on the inner writer
    return this.writer.write(name, value);
  }

  /** Delete an environment variable, if possible. */
  delete(name: string): boolean {
    // Don't clear non-allowed variables
    if (!this.isAllowed(name)) {
      return false;
    }

    // Set the value on the inner writer
    return this.writer.delete(name);
  }

  /** Determine if the given variable is allowed. */
  private isAllowed(name: string): boolean {
    return in_array(name, this.allowList, true);
  }
}

registerClass("Dotenv\\Repository\\Adapter\\GuardedWriter", GuardedWriter);
