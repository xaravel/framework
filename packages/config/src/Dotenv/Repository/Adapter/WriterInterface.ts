// `Dotenv\Repository\Adapter\WriterInterface` (vlucas/phpdotenv v5.7.0) as a contract token (AD-1, AD-9.5).
import { contract } from "@xaravel/contracts";

declare const WriterInterfaceBrand: unique symbol;

/** Writes environment variables. */
export interface WriterInterface {
  readonly [WriterInterface.brand]: true;

  /** Write to an environment variable, if possible. */
  write(name: string, value: string): boolean;

  /** Delete an environment variable, if possible. */
  delete(name: string): boolean;
}

export const WriterInterface = contract<WriterInterface, typeof WriterInterfaceBrand>("Dotenv\\Repository\\Adapter\\WriterInterface", {
  write: ["name", "value"],
  delete: ["name"],
});
