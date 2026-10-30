// `Dotenv\Parser\ParserInterface` (vlucas/phpdotenv v5.7.0) as a contract token (AD-1, AD-9.5).
import { contract } from "@xaravel/contracts";
import type { Entry } from "./Entry";

declare const ParserInterfaceBrand: unique symbol;

/** Parses environment file content. */
export interface ParserInterface {
  readonly [ParserInterface.brand]: true;

  /** Parse content into an entry array. */
  parse(content: string): Entry[];
}

export const ParserInterface = contract<ParserInterface, typeof ParserInterfaceBrand>("Dotenv\\Parser\\ParserInterface", { parse: ["content"] });
