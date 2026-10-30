// `Dotenv\Repository\Adapter\ServerConstAdapter` (vlucas/phpdotenv v5.7.0), ported line for line: it reads and writes PHP's
// `$_SERVER`, which is the runtime's `superglobals.server` (ESC-15.2-2): seeded once from the process environment at
// boot and never re-read, so a `putenv` is not seen here, as in PHP.
import { registerClass } from "@xaravel/runtime";
import { is_scalar, superglobals, toPhpString, Error as PhpError } from "@xaravel/runtime/php";
import { Option } from "../../../PhpOption/Option";
import { Some } from "../../../PhpOption/Some";
import { AdapterInterface } from "./AdapterInterface";
import { ReaderInterface } from "./ReaderInterface";
import { WriterInterface } from "./WriterInterface";

/** The key to Upstream's private constructor. */
const CREATE: unique symbol = Symbol("ServerConstAdapter");

/** The `$_SERVER` adapter. */
export class ServerConstAdapter implements AdapterInterface {
  get [AdapterInterface.brand](): true {
    return true;
  }

  get [ReaderInterface.brand](): true {
    return true;
  }

  get [WriterInterface.brand](): true {
    return true;
  }

  /** Create a new server const adapter instance. Private in PHP: throws PHP's `Error`; Upstream's own callers pass the key. */
  constructor(key: typeof CREATE) {
    if (key !== CREATE) {
      throw new PhpError("Call to private Dotenv\\Repository\\Adapter\\ServerConstAdapter::__construct() from global scope");
    }
    //
  }

  /** Create a new instance of the adapter, if it is available. */
  static create(): Option<ServerConstAdapter> {
    return Some.create(new ServerConstAdapter(CREATE));
  }

  /** Read an environment variable, if it exists. */
  read(name: string): Option<string> {
    const value = Option.fromArraysValue<unknown>(superglobals.server, name)
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
    superglobals.server.set(name, value);

    return true;
  }

  /** Delete an environment variable, if possible. */
  delete(name: string): boolean {
    superglobals.server.delete(name);

    return true;
  }
}

registerClass("Dotenv\\Repository\\Adapter\\ServerConstAdapter", ServerConstAdapter);
