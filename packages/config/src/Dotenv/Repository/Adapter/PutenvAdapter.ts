// `Dotenv\Repository\Adapter\PutenvAdapter` (vlucas/phpdotenv v5.7.0), ported line for line over the runtime's
// `getenv` and `putenv`, which read and write the process environment (ESC-15.2-2).
import { registerClass } from "@xaravel/runtime";
import { function_exists, getenv, is_string, putenv, strpos, Error as PhpError } from "@xaravel/runtime/php";
import { None } from "../../../PhpOption/None";
import { Option } from "../../../PhpOption/Option";
import { Some } from "../../../PhpOption/Some";
import { AdapterInterface } from "./AdapterInterface";
import { ReaderInterface } from "./ReaderInterface";
import { WriterInterface } from "./WriterInterface";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("PutenvAdapter");

/** The `getenv` / `putenv` adapter. */
export class PutenvAdapter implements AdapterInterface {
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

  /** Create a new putenv adapter instance. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Repository\\Adapter\\PutenvAdapter::__construct() from global scope");
    }
    //
  }

  /** Create a new instance of the adapter, if it is available. */
  static create(): Option<PutenvAdapter> {
    if (PutenvAdapter.isSupported()) {
      return Some.create(new PutenvAdapter(CREATE));
    }

    return None.create();
  }

  /** Determines if the adapter is supported. */
  private static isSupported(): boolean {
    return function_exists("getenv") && function_exists("putenv");
  }

  /** Read an environment variable, if it exists. */
  read(name: string): Option<string> {
    if (strpos(name, "\0") !== false) {
      return None.create();
    }

    return Option.fromValue<unknown>(getenv(name), false).filter((value: unknown) => {
      return is_string(value);
    }) as Option<string>;
  }

  /** Write to an environment variable, if possible. */
  write(name: string, value: string): boolean {
    if (strpos(name, "\0") !== false || strpos(value, "\0") !== false) {
      return false;
    }

    putenv(`${name}=${value}`);

    return true;
  }

  /** Delete an environment variable, if possible. */
  delete(name: string): boolean {
    if (strpos(name, "\0") !== false) {
      return false;
    }

    putenv(name);

    return true;
  }
}

registerClass("Dotenv\\Repository\\Adapter\\PutenvAdapter", PutenvAdapter);
