// `Dotenv\Repository\Adapter\EnvConstAdapter` (vlucas/phpdotenv v5.7.0), ported line for line: it reads and writes PHP's
// `$_ENV`, which is the runtime's `superglobals.env` (ESC-15.2-2): seeded once from the process environment at
// boot and never re-read, so a `putenv` is not seen here, as in PHP.
import { registerClass } from "@xaravel/runtime";
import { is_scalar, superglobals, toPhpString, Error as PhpError } from "@xaravel/runtime/php";
import { Option } from "../../../PhpOption/Option";
import { Some } from "../../../PhpOption/Some";
import { AdapterInterface } from "./AdapterInterface";
import { ReaderInterface } from "./ReaderInterface";
import { WriterInterface } from "./WriterInterface";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("EnvConstAdapter");

/** The `$_ENV` adapter. */
export class EnvConstAdapter implements AdapterInterface {
  get [AdapterInterface.brand](): true {
    return true;
  }

  get [ReaderInterface.brand](): true {
    return true;
  }

  get [WriterInterface.brand](): true {
    return true;
  }

  /** Create a new env const adapter instance. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Repository\\Adapter\\EnvConstAdapter::__construct() from global scope");
    }
    //
  }

  /** Create a new instance of the adapter, if it is available. */
  static create(): Option<EnvConstAdapter> {
    return Some.create(new EnvConstAdapter(CREATE));
  }

  /** Read an environment variable, if it exists. */
  read(name: string): Option<string> {
    const value = Option.fromArraysValue<unknown>(superglobals.env, name)
      .filter((value: unknown) => {
        return is_scalar(value);
      });

    return value.map((value: unknown) => {
      if (value === false) {
        return "false";
      }

      if (value === true) {
        return "true";
      }

      return toPhpString(value);
    });
  }

  /** Write to an environment variable, if possible. */
  write(name: string, value: string): boolean {
    superglobals.env.set(name, value);

    return true;
  }

  /** Delete an environment variable, if possible. */
  delete(name: string): boolean {
    superglobals.env.delete(name);

    return true;
  }
}

registerClass("Dotenv\\Repository\\Adapter\\EnvConstAdapter", EnvConstAdapter);
