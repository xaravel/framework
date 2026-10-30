// `Dotenv\Dotenv` (vlucas/phpdotenv v5.7.0), ported line for line: sync throughout (AD-6, ESC-15.2-3). `(array)
// $paths` is `toPhpArray`. A class-string adapter (`ArrayAdapter::class`) is the class (RepositoryBuilder's header).
// Choosing which env file loads (`.env.<APP_ENV>`) is Foundation's (Epic 51), not this class's.
import type { PhpArrayLike } from "@xaravel/contracts/config";
import { registerClass } from "@xaravel/runtime";
import { toPhpArray } from "@xaravel/runtime/php";
import { InvalidPathException } from "./Exception/InvalidPathException";
import { Loader } from "./Loader/Loader";
import type { LoaderInterface } from "./Loader/LoaderInterface";
import { Parser } from "./Parser/Parser";
import type { ParserInterface } from "./Parser/ParserInterface";
import { ArrayAdapter } from "./Repository/Adapter/ArrayAdapter";
import { PutenvAdapter } from "./Repository/Adapter/PutenvAdapter";
import { RepositoryBuilder } from "./Repository/RepositoryBuilder";
import type { RepositoryInterface } from "./Repository/RepositoryInterface";
import { StoreBuilder } from "./Store/StoreBuilder";
import type { StoreInterface } from "./Store/StoreInterface";
import { StringStore } from "./Store/StringStore";
import { Validator } from "./Validator";

/** The values of a PHP array, as `foreach ((array) $x as $v)` reads them. */
function arrayValues(value: unknown): unknown[] {
  return [...toPhpArray(value).values()];
}

/** phpdotenv's entry point: reads, parses and loads environment files. */
export class Dotenv {
  /** The store instance. */
  private readonly store: StoreInterface;

  /** The parser instance. */
  private readonly parser: ParserInterface;

  /** The loader instance. */
  private readonly loader: LoaderInterface;

  /** The repository instance. */
  private readonly repository: RepositoryInterface;

  /** Create a new dotenv instance. */
  constructor(
    store: StoreInterface,
    parser: ParserInterface,
    loader: LoaderInterface,
    repository: RepositoryInterface,
  ) {
    this.store = store;
    this.parser = parser;
    this.loader = loader;
    this.repository = repository;
  }

  /** Create a new dotenv instance. */
  static create(repository: RepositoryInterface, paths: string | readonly string[], names: string | readonly string[] | null = null, shortCircuit: boolean = true, fileEncoding: string | null = null): Dotenv {
    let builder = names === null ? StoreBuilder.createWithDefaultName() : StoreBuilder.createWithNoNames();

    for (const path of arrayValues(paths)) {
      builder = builder.addPath(path as string);
    }

    for (const name of arrayValues(names)) {
      builder = builder.addName(name as string);
    }

    if (shortCircuit) {
      builder = builder.shortCircuit();
    }

    return new Dotenv(builder.fileEncoding(fileEncoding).make(), new Parser(), new Loader(), repository);
  }

  /** Create a new mutable dotenv instance with default repository. */
  static createMutable(paths: string | readonly string[], names: string | readonly string[] | null = null, shortCircuit: boolean = true, fileEncoding: string | null = null): Dotenv {
    const repository = RepositoryBuilder.createWithDefaultAdapters().make();

    return Dotenv.create(repository, paths, names, shortCircuit, fileEncoding);
  }

  /** Create a new mutable dotenv instance with default repository with the putenv adapter. */
  static createUnsafeMutable(paths: string | readonly string[], names: string | readonly string[] | null = null, shortCircuit: boolean = true, fileEncoding: string | null = null): Dotenv {
    const repository = RepositoryBuilder.createWithDefaultAdapters()
      .addAdapter(PutenvAdapter)
      .make();

    return Dotenv.create(repository, paths, names, shortCircuit, fileEncoding);
  }

  /** Create a new immutable dotenv instance with default repository. */
  static createImmutable(paths: string | readonly string[], names: string | readonly string[] | null = null, shortCircuit: boolean = true, fileEncoding: string | null = null): Dotenv {
    const repository = RepositoryBuilder.createWithDefaultAdapters().immutable().make();

    return Dotenv.create(repository, paths, names, shortCircuit, fileEncoding);
  }

  /** Create a new immutable dotenv instance with default repository with the putenv adapter. */
  static createUnsafeImmutable(paths: string | readonly string[], names: string | readonly string[] | null = null, shortCircuit: boolean = true, fileEncoding: string | null = null): Dotenv {
    const repository = RepositoryBuilder.createWithDefaultAdapters()
      .addAdapter(PutenvAdapter)
      .immutable()
      .make();

    return Dotenv.create(repository, paths, names, shortCircuit, fileEncoding);
  }

  /** Create a new dotenv instance with an array backed repository. */
  static createArrayBacked(paths: string | readonly string[], names: string | readonly string[] | null = null, shortCircuit: boolean = true, fileEncoding: string | null = null): Dotenv {
    const repository = RepositoryBuilder.createWithNoAdapters().addAdapter(ArrayAdapter).make();

    return Dotenv.create(repository, paths, names, shortCircuit, fileEncoding);
  }

  /**
   * Parse the given content and resolve nested variables.
   *
   * This method behaves just like load(), only without mutating your actual environment. We do this by using an
   * array backed repository.
   */
  static parse(content: string): PhpArrayLike {
    const repository = RepositoryBuilder.createWithNoAdapters().addAdapter(ArrayAdapter).make();

    const phpdotenv = new Dotenv(new StringStore(content), new Parser(), new Loader(), repository);

    return phpdotenv.load();
  }

  /** Read and load environment file(s). */
  load(): PhpArrayLike {
    const entries = this.parser.parse(this.store.read());

    return this.loader.load(this.repository, entries);
  }

  /** Read and load environment file(s), silently failing if no files can be read. */
  safeLoad(): PhpArrayLike {
    try {
      return this.load();
    } catch (e) {
      if (!(e instanceof InvalidPathException)) {
        throw e;
      }
      // suppressing exception
      return [];
    }
  }

  /** Required ensures that the specified variables exist, and returns a new validator object. */
  required(variables: string | readonly string[]): Validator {
    return (new Validator(this.repository, arrayValues(variables) as string[])).required();
  }

  /** Returns a new validator object that won't check if the specified variables exist. */
  ifPresent(variables: string | readonly string[]): Validator {
    return new Validator(this.repository, arrayValues(variables) as string[]);
  }
}

registerClass("Dotenv\\Dotenv", Dotenv);
