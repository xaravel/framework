// `Dotenv\Exception\ExceptionInterface` (vlucas/phpdotenv v5.7.0) as a contract token (AD-1, AD-9.5): PHP's
// `ExceptionInterface extends Throwable`, so the token records the runtime's `Throwable` token as its parent.
import { type ContractToken, contract } from "@xaravel/contracts";
import { Throwable } from "@xaravel/runtime";

declare const ExceptionInterfaceBrand: unique symbol;

/** The interface every phpdotenv exception implements. */
export interface ExceptionInterface extends Throwable {
  readonly [ExceptionInterface.brand]: true;
}

export const ExceptionInterface = contract<ExceptionInterface, typeof ExceptionInterfaceBrand>("Dotenv\\Exception\\ExceptionInterface", {}, [Throwable as unknown as ContractToken<object>]);
