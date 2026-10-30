// `Dotenv\Store\FileStore` (vlucas/phpdotenv v5.7.0), ported line for line. Its read is sync, through the runtime's
// `file_get_contents` (AD-6, ESC-15.2-3).
import { registerClass } from "@xaravel/runtime";
import { count, implode, sprintf } from "@xaravel/runtime/php";
import { InvalidPathException } from "../Exception/InvalidPathException";
import { Reader } from "./File/Reader";
import { StoreInterface } from "./StoreInterface";

/** A store over environment files. */
export class FileStore implements StoreInterface {
  /** The file paths. */
  private readonly filePaths: readonly string[];

  /** Should file loading short circuit? */
  private readonly shortCircuit: boolean;

  /** The file encoding. */
  private readonly fileEncoding: string | null;

  /** The `StoreInterface` brand: an `instanceof StoreInterface` check finds this class (AD-9.5). */
  get [StoreInterface.brand](): true {
    return true;
  }

  /** Create a new file store instance. */
  constructor(filePaths: readonly string[], shortCircuit: boolean, fileEncoding: string | null = null) {
    this.filePaths = filePaths;
    this.shortCircuit = shortCircuit;
    this.fileEncoding = fileEncoding;
  }

  /** Read the content of the environment file(s). */
  read(): string {
    if (this.filePaths.length === 0) {
      throw new InvalidPathException("At least one environment file path and file name must be provided.");
    }

    const contents = Reader.read(this.filePaths, this.shortCircuit, this.fileEncoding);

    if (count(contents) > 0) {
      return implode("\n", contents);
    }

    throw new InvalidPathException(
      sprintf("Unable to read any of the environment file(s) at [%s].", implode(", ", this.filePaths)),
    );
  }
}

registerClass("Dotenv\\Store\\FileStore", FileStore);
