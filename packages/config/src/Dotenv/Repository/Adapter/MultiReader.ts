// `Dotenv\Repository\Adapter\MultiReader` (vlucas/phpdotenv v5.7.0), ported line for line.
import { registerClass } from "@xaravel/runtime";
import { None } from "../../../PhpOption/None";
import type { Option } from "../../../PhpOption/Option";
import { ReaderInterface } from "./ReaderInterface";

/** Reads through each reader in turn, giving the first value found. */
export class MultiReader implements ReaderInterface {
  /** The set of readers to use. */
  private readonly readers: readonly ReaderInterface[];

  get [ReaderInterface.brand](): true {
    return true;
  }

  /** Create a new multi-reader instance. */
  constructor(readers: readonly ReaderInterface[]) {
    this.readers = readers;
  }

  /** Read an environment variable, if it exists. */
  read(name: string): Option<string> {
    for (const reader of this.readers) {
      const result = reader.read(name);
      if (result.isDefined()) {
        return result;
      }
    }

    return None.create();
  }
}

registerClass("Dotenv\\Repository\\Adapter\\MultiReader", MultiReader);
