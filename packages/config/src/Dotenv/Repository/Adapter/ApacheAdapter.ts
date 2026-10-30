// `Dotenv\Repository\Adapter\ApacheAdapter` (vlucas/phpdotenv v5.7.0), ported line for line. It is supported only
// when PHP runs as an Apache module (`apache_getenv` and `apache_setenv` exist); `function_exists` finds neither in
// the runtime, so `create()` gives None, as the PHP CLI does, and `read`, `write` and `delete`
// throw the `Error` PHP's CLI throws for a call to an undefined function.
import { registerClass } from "@xaravel/runtime";
import { Error as PhpError, function_exists } from "@xaravel/runtime/php";
import { None } from "../../../PhpOption/None";
import { Option } from "../../../PhpOption/Option";
import { Some } from "../../../PhpOption/Some";
import { AdapterInterface } from "./AdapterInterface";
import { ReaderInterface } from "./ReaderInterface";
import { WriterInterface } from "./WriterInterface";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("ApacheAdapter");

/** A call to `apache_getenv` / `apache_setenv`, which the PHP CLI does not define: PHP's `Error`. */
function apache(name: string): never {
  throw new PhpError(`Call to undefined function ${name}()`);
}

/** The Apache environment adapter. */
export class ApacheAdapter implements AdapterInterface {
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

  /** Create a new apache adapter instance. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Repository\\Adapter\\ApacheAdapter::__construct() from global scope");
    }
    //
  }

  /** Create a new instance of the adapter, if it is available. */
  static create(): Option<ApacheAdapter> {
    if (ApacheAdapter.isSupported()) {
      return Some.create(new ApacheAdapter(CREATE));
    }

    return None.create();
  }

  /**
   * Determines if the adapter is supported.
   *
   * This happens if PHP is running as an Apache module.
   */
  private static isSupported(): boolean {
    return function_exists("apache_getenv") && function_exists("apache_setenv");
  }

  /** Read an environment variable, if it exists. */
  read(name: string): Option<string> {
    void name;
    return apache("apache_getenv");
  }

  /** Write to an environment variable, if possible. */
  write(name: string, value: string): boolean {
    void name;
    void value;
    return apache("apache_setenv");
  }

  /** Delete an environment variable, if possible. */
  delete(name: string): boolean {
    void name;
    return apache("apache_setenv");
  }
}

registerClass("Dotenv\\Repository\\Adapter\\ApacheAdapter", ApacheAdapter);
