// `Dotenv\Repository\Adapter\MultiWriter` (vlucas/phpdotenv v5.7.0), ported line for line.
import { registerClass } from "@xaravel/runtime";
import { WriterInterface } from "./WriterInterface";

/** Writes through each writer in turn, stopping at the first that fails. */
export class MultiWriter implements WriterInterface {
  /** The set of writers to use. */
  private readonly writers: readonly WriterInterface[];

  get [WriterInterface.brand](): true {
    return true;
  }

  /** Create a new multi-writer instance. */
  constructor(writers: readonly WriterInterface[]) {
    this.writers = writers;
  }

  /** Write to an environment variable, if possible. */
  write(name: string, value: string): boolean {
    for (const writers of this.writers) {
      if (!writers.write(name, value)) {
        return false;
      }
    }

    return true;
  }

  /** Delete an environment variable, if possible. */
  delete(name: string): boolean {
    for (const writers of this.writers) {
      if (!writers.delete(name)) {
        return false;
      }
    }

    return true;
  }
}

registerClass("Dotenv\\Repository\\Adapter\\MultiWriter", MultiWriter);
