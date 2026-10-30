// `Dotenv\Repository\Adapter\ReaderInterface` (vlucas/phpdotenv v5.7.0) as a contract token (AD-1, AD-9.5).
import { contract } from "@xaravel/contracts";
import type { Option } from "../../../PhpOption/Option";

declare const ReaderInterfaceBrand: unique symbol;

/** Reads environment variables. */
export interface ReaderInterface {
  readonly [ReaderInterface.brand]: true;

  /** Read an environment variable, if it exists. */
  read(name: string): Option<string>;
}

export const ReaderInterface = contract<ReaderInterface, typeof ReaderInterfaceBrand>("Dotenv\\Repository\\Adapter\\ReaderInterface", { read: ["name"] });
