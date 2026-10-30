// `Dotenv\Repository\AdapterRepository` (vlucas/phpdotenv v5.7.0), ported line for line.
import { registerClass } from "@xaravel/runtime";
import { InvalidArgumentException } from "@xaravel/runtime/php";
import type { ReaderInterface } from "./Adapter/ReaderInterface";
import type { WriterInterface } from "./Adapter/WriterInterface";
import { RepositoryInterface } from "./RepositoryInterface";

/** A repository over one reader and one writer. */
export class AdapterRepository implements RepositoryInterface {
  /** The reader to use. */
  private readonly reader: ReaderInterface;

  /** The writer to use. */
  private readonly writer: WriterInterface;

  get [RepositoryInterface.brand](): true {
    return true;
  }

  /** Create a new adapter repository instance. */
  constructor(reader: ReaderInterface, writer: WriterInterface) {
    this.reader = reader;
    this.writer = writer;
  }

  /** Determine if the given environment variable is defined. */
  has(name: string): boolean {
    return "" !== name && this.reader.read(name).isDefined();
  }

  /** Get an environment variable. */
  get(name: string): string | null {
    if ("" === name) {
      throw new InvalidArgumentException("Expected name to be a non-empty string.");
    }

    return this.reader.read(name).getOrElse(null);
  }

  /** Set an environment variable. */
  set(name: string, value: string): boolean {
    if ("" === name) {
      throw new InvalidArgumentException("Expected name to be a non-empty string.");
    }

    return this.writer.write(name, value);
  }

  /** Clear an environment variable. */
  clear(name: string): boolean {
    if ("" === name) {
      throw new InvalidArgumentException("Expected name to be a non-empty string.");
    }

    return this.writer.delete(name);
  }
}

registerClass("Dotenv\\Repository\\AdapterRepository", AdapterRepository);
