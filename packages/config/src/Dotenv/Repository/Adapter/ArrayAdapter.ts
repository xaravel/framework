// `Dotenv\Repository\Adapter\ArrayAdapter` (vlucas/phpdotenv v5.7.0), ported line for line. Its variables are a
// `PhpArray`, so a name such as `"123"` is the int key PHP makes it (AD-9).
import { registerClass } from "@xaravel/runtime";
import { PhpArray, Error as PhpError } from "@xaravel/runtime/php";
import { Option } from "../../../PhpOption/Option";
import { Some } from "../../../PhpOption/Some";
import { AdapterInterface } from "./AdapterInterface";
import { ReaderInterface } from "./ReaderInterface";
import { WriterInterface } from "./WriterInterface";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("ArrayAdapter");

/** An adapter over a private array of variables. */
export class ArrayAdapter implements AdapterInterface {
  /** The variables and their values. */
  private readonly variables: PhpArray<string | number, string>;

  /** The `AdapterInterface` brand: an `instanceof AdapterInterface` check finds this class (AD-9.5). */
  get [AdapterInterface.brand](): true {
    return true;
  }

  /** The `ReaderInterface` brand: an `instanceof ReaderInterface` check finds this class (AD-9.5). */
  get [ReaderInterface.brand](): true {
    return true;
  }

  /** The `WriterInterface` brand: an `instanceof WriterInterface` check finds this class (AD-9.5). */
  get [WriterInterface.brand](): true {
    return true;
  }

  /** Create a new array adapter instance. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Repository\\Adapter\\ArrayAdapter::__construct() from global scope");
    }
    this.variables = new PhpArray();
  }

  /** Create a new instance of the adapter, if it is available. */
  static create(): Option<ArrayAdapter> {
    return Some.create(new ArrayAdapter(CREATE));
  }

  /** Read an environment variable, if it exists. */
  read(name: string): Option<string> {
    return Option.fromArraysValue<string>(this.variables, name);
  }

  /** Write to an environment variable, if possible. */
  write(name: string, value: string): boolean {
    this.variables.set(name, value);

    return true;
  }

  /** Delete an environment variable, if possible. */
  delete(name: string): boolean {
    this.variables.delete(name);

    return true;
  }
}

registerClass("Dotenv\\Repository\\Adapter\\ArrayAdapter", ArrayAdapter);
