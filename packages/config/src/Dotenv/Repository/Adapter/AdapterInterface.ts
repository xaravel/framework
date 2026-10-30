// `Dotenv\Repository\Adapter\AdapterInterface` (vlucas/phpdotenv v5.7.0) as a contract token (AD-1, AD-9.5):
// `AdapterInterface extends ReaderInterface, WriterInterface`. Its static `create()` is `AdapterInterfaceStatic`, the
// static side of a class implementing it (ESC-10.2-1).
import { contract } from "@xaravel/contracts";
import type { Option } from "../../../PhpOption/Option";
import { ReaderInterface } from "./ReaderInterface";
import { WriterInterface } from "./WriterInterface";

declare const AdapterInterfaceBrand: unique symbol;

/** An environment variable reader and writer. */
export interface AdapterInterface extends ReaderInterface, WriterInterface {
  readonly [AdapterInterface.brand]: true;
}

/** The static side of an adapter class: `AdapterInterface::create()`. */
export interface AdapterInterfaceStatic {
  /** Create a new instance of the adapter, if it is available. */
  create(): Option<AdapterInterface>;
}

export const AdapterInterface = contract<AdapterInterface, typeof AdapterInterfaceBrand>("Dotenv\\Repository\\Adapter\\AdapterInterface", {}, [ReaderInterface, WriterInterface]);
