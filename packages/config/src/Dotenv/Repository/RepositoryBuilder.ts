// `Dotenv\Repository\RepositoryBuilder` (vlucas/phpdotenv v5.7.0), ported line for line.
//
// A PHP class-string (`ServerConstAdapter::class`) is the class itself (PORTING.md § Mechanical expression rule,
// `C::class` → `C`) or its FQCN string; either names the class by its registered FQCN (AD-10), and `is_string` is
// asked of that name. `isAnAdapterClass` keeps `class_exists`, and reads
// `(new ReflectionClass($name))->implementsInterface(AdapterInterface::class)` as the class's `AdapterInterface` brand
// on its prototype (`hasBrand`, AD-9.5), the form a class implementing a contract takes. The default adapters read
// and write `$_SERVER` and `$_ENV` only (ESC-15.2-2), so by default real environment variables are those arrays'.
import { fqcn, registerClass, resolveClass } from "@xaravel/runtime";
import { array_merge, class_exists, hasBrand, InvalidArgumentException, iterator_to_array, sprintf, Error as PhpError } from "@xaravel/runtime/php";
import type { Option } from "../../PhpOption/Option";
import { Some } from "../../PhpOption/Some";
import { AdapterInterface, type AdapterInterfaceStatic } from "./Adapter/AdapterInterface";
import { EnvConstAdapter } from "./Adapter/EnvConstAdapter";
import { GuardedWriter } from "./Adapter/GuardedWriter";
import { ImmutableWriter } from "./Adapter/ImmutableWriter";
import { MultiReader } from "./Adapter/MultiReader";
import { MultiWriter } from "./Adapter/MultiWriter";
import { ReaderInterface } from "./Adapter/ReaderInterface";
import { ServerConstAdapter } from "./Adapter/ServerConstAdapter";
import { WriterInterface } from "./Adapter/WriterInterface";
import { AdapterRepository } from "./AdapterRepository";
import type { RepositoryInterface } from "./RepositoryInterface";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("RepositoryBuilder");

/** A PHP class-string for an adapter: the class, or its FQCN. */
export type AdapterClass = AdapterInterfaceStatic | string;

/** The FQCN a class-string argument names, or null when the argument is no class-string (`is_string` false). */
function className(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "function") {
    try {
      return fqcn(value);
    } catch {
      return null;
    }
  }
  return null;
}

/** `$name::create()`. */
function createAdapter(name: string): Option<AdapterInterface> {
  return (resolveClass(name) as unknown as AdapterInterfaceStatic).create();
}

/** Builds an environment variable repository. */
export class RepositoryBuilder {
  /** The set of default adapters. */
  private static readonly DEFAULT_ADAPTERS: readonly AdapterInterfaceStatic[] = [ServerConstAdapter, EnvConstAdapter];

  /** The set of readers to use. */
  private readonly readers: readonly ReaderInterface[];

  /** The set of writers to use. */
  private readonly writers: readonly WriterInterface[];

  /** Are we immutable? */
  private readonly immutable_: boolean;

  /** The variable name allow list. */
  private readonly allowList_: readonly string[] | null;

  /** Create a new repository builder instance. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE, readers: readonly ReaderInterface[] = [], writers: readonly WriterInterface[] = [], immutable: boolean = false, allowList: readonly string[] | null = null) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Repository\\RepositoryBuilder::__construct() from global scope");
    }
    this.readers = readers;
    this.writers = writers;
    this.immutable_ = immutable;
    this.allowList_ = allowList;
  }

  /** Create a new repository builder instance with no adapters added. */
  static createWithNoAdapters(): RepositoryBuilder {
    return new RepositoryBuilder(CREATE);
  }

  /** Create a new repository builder instance with the default adapters added. */
  static createWithDefaultAdapters(): RepositoryBuilder {
    const adapters = iterator_to_array(RepositoryBuilder.defaultAdapters()) as AdapterInterface[];

    return new RepositoryBuilder(CREATE, adapters, adapters);
  }

  /** Return the array of default adapters. */
  private static *defaultAdapters(): Generator<AdapterInterface, void, undefined> {
    for (const adapter of RepositoryBuilder.DEFAULT_ADAPTERS) {
      const instance = adapter.create();
      if (instance.isDefined()) {
        yield instance.get();
      }
    }
  }

  /** Determine if the given name if of an adapterclass. */
  private static isAnAdapterClass(name: string): boolean {
    if (!class_exists(name)) {
      return false;
    }

    return hasBrand(resolveClass(name), AdapterInterface);
  }

  /**
   * Creates a repository builder with the given reader added.
   *
   * Accepts either a reader instance, or a class-string for an adapter. If the adapter is not supported, then we
   * silently skip adding it.
   */
  addReader(reader: ReaderInterface | AdapterClass): RepositoryBuilder {
    const name = className(reader);
    if (!(name !== null && RepositoryBuilder.isAnAdapterClass(name)) && !(reader instanceof ReaderInterface)) {
      throw new InvalidArgumentException(
        sprintf(
          "Expected either an instance of %s or a class-string implementing %s",
          "Dotenv\\Repository\\Adapter\\ReaderInterface",
          "Dotenv\\Repository\\Adapter\\AdapterInterface",
        ),
      );
    }

    const optional = Some.create(reader).flatMap((reader: unknown): Option<ReaderInterface> => {
      const readerName = className(reader);
      return readerName !== null ? createAdapter(readerName) : Some.create(reader as ReaderInterface);
    });

    const readers = array_merge(this.readers, iterator_to_array(optional)) as ReaderInterface[];

    return new RepositoryBuilder(CREATE, readers, this.writers, this.immutable_, this.allowList_);
  }

  /**
   * Creates a repository builder with the given writer added.
   *
   * Accepts either a writer instance, or a class-string for an adapter. If the adapter is not supported, then we
   * silently skip adding it.
   */
  addWriter(writer: WriterInterface | AdapterClass): RepositoryBuilder {
    const name = className(writer);
    if (!(name !== null && RepositoryBuilder.isAnAdapterClass(name)) && !(writer instanceof WriterInterface)) {
      throw new InvalidArgumentException(
        sprintf(
          "Expected either an instance of %s or a class-string implementing %s",
          "Dotenv\\Repository\\Adapter\\WriterInterface",
          "Dotenv\\Repository\\Adapter\\AdapterInterface",
        ),
      );
    }

    const optional = Some.create(writer).flatMap((writer: unknown): Option<WriterInterface> => {
      const writerName = className(writer);
      return writerName !== null ? createAdapter(writerName) : Some.create(writer as WriterInterface);
    });

    const writers = array_merge(this.writers, iterator_to_array(optional)) as WriterInterface[];

    return new RepositoryBuilder(CREATE, this.readers, writers, this.immutable_, this.allowList_);
  }

  /**
   * Creates a repository builder with the given adapter added.
   *
   * Accepts either an adapter instance, or a class-string for an adapter. If the adapter is not supported, then we
   * silently skip adding it. We will add the adapter as both a reader and a writer.
   */
  addAdapter(adapter: AdapterInterface | AdapterClass): RepositoryBuilder {
    const name = className(adapter);
    if (!(name !== null && RepositoryBuilder.isAnAdapterClass(name)) && !(adapter instanceof AdapterInterface)) {
      throw new InvalidArgumentException(
        sprintf(
          "Expected either an instance of %s or a class-string implementing %s",
          "Dotenv\\Repository\\Adapter\\AdapterInterface",
          "Dotenv\\Repository\\Adapter\\AdapterInterface",
        ),
      );
    }

    const optional = Some.create(adapter).flatMap((adapter: unknown): Option<AdapterInterface> => {
      const adapterName = className(adapter);
      return adapterName !== null ? createAdapter(adapterName) : Some.create(adapter as AdapterInterface);
    });

    const readers = array_merge(this.readers, iterator_to_array(optional)) as ReaderInterface[];
    const writers = array_merge(this.writers, iterator_to_array(optional)) as WriterInterface[];

    return new RepositoryBuilder(CREATE, readers, writers, this.immutable_, this.allowList_);
  }

  /** Creates a repository builder with immutability enabled. */
  immutable(): RepositoryBuilder {
    return new RepositoryBuilder(CREATE, this.readers, this.writers, true, this.allowList_);
  }

  /** Creates a repository builder with the given allow list. */
  allowList(allowList: readonly string[] | null = null): RepositoryBuilder {
    return new RepositoryBuilder(CREATE, this.readers, this.writers, this.immutable_, allowList);
  }

  /** Creates a new repository instance. */
  make(): RepositoryInterface {
    const reader = new MultiReader(this.readers);
    let writer: WriterInterface = new MultiWriter(this.writers);

    if (this.immutable_) {
      writer = new ImmutableWriter(writer, reader);
    }

    if (this.allowList_ !== null) {
      writer = new GuardedWriter(writer, this.allowList_);
    }

    return new AdapterRepository(reader, writer);
  }
}

registerClass("Dotenv\\Repository\\RepositoryBuilder", RepositoryBuilder);
