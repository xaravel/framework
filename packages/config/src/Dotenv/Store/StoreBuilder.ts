// `Dotenv\Store\StoreBuilder` (vlucas/phpdotenv v5.7.0), ported line for line.
import { registerClass } from "@xaravel/runtime";
import { array_merge, Error as PhpError } from "@xaravel/runtime/php";
import { FileStore } from "./FileStore";
import { Paths } from "./File/Paths";
import type { StoreInterface } from "./StoreInterface";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("StoreBuilder");

/** The of default name. */
const DEFAULT_NAME = ".env";

/** Builds a file store. */
export class StoreBuilder {
  /** The paths to search within. */
  private readonly paths: readonly string[];

  /** The file names to search for. */
  private readonly names: readonly string[];

  /** Should file loading short circuit? */
  private readonly shortCircuit_: boolean;

  /** The file encoding. */
  private readonly fileEncoding_: string | null;

  /** Create a new store builder instance. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE, paths: readonly string[] = [], names: readonly string[] = [], shortCircuit: boolean = false, fileEncoding: string | null = null) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Store\\StoreBuilder::__construct() from global scope");
    }
    this.paths = paths;
    this.names = names;
    this.shortCircuit_ = shortCircuit;
    this.fileEncoding_ = fileEncoding;
  }

  /** Create a new store builder instance with no names. */
  static createWithNoNames(): StoreBuilder {
    return new StoreBuilder(CREATE);
  }

  /** Create a new store builder instance with the default name. */
  static createWithDefaultName(): StoreBuilder {
    return new StoreBuilder(CREATE, [], [DEFAULT_NAME]);
  }

  /** Creates a store builder with the given path added. */
  addPath(path: string): StoreBuilder {
    return new StoreBuilder(CREATE, array_merge(this.paths, [path]) as string[], this.names, this.shortCircuit_, this.fileEncoding_);
  }

  /** Creates a store builder with the given name added. */
  addName(name: string): StoreBuilder {
    return new StoreBuilder(CREATE, this.paths, array_merge(this.names, [name]) as string[], this.shortCircuit_, this.fileEncoding_);
  }

  /** Creates a store builder with short circuit mode enabled. */
  shortCircuit(): StoreBuilder {
    return new StoreBuilder(CREATE, this.paths, this.names, true, this.fileEncoding_);
  }

  /** Creates a store builder with the specified file encoding. */
  fileEncoding(fileEncoding: string | null = null): StoreBuilder {
    return new StoreBuilder(CREATE, this.paths, this.names, this.shortCircuit_, fileEncoding);
  }

  /** Creates a new store instance. */
  make(): StoreInterface {
    return new FileStore(
      Paths.filePaths(this.paths, this.names),
      this.shortCircuit_,
      this.fileEncoding_,
    );
  }
}

registerClass("Dotenv\\Store\\StoreBuilder", StoreBuilder);
