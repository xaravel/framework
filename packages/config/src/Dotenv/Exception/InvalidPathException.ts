// `Dotenv\Exception\InvalidPathException` (vlucas/phpdotenv v5.7.0): `final class InvalidPathException extends InvalidArgumentException implements
// ExceptionInterface`, over the runtime's SPL `InvalidArgumentException` (AD-19), the interface a brand getter (AD-9.5).
import { InvalidArgumentException, registerClass } from "@xaravel/runtime";
import { ExceptionInterface } from "./ExceptionInterface";

/** Thrown when no environment file can be read. */
export class InvalidPathException extends InvalidArgumentException implements ExceptionInterface {
  /** The `ExceptionInterface` brand: an `instanceof ExceptionInterface` check finds this class (AD-9.5). */
  get [ExceptionInterface.brand](): true {
    return true;
  }
}

registerClass("Dotenv\\Exception\\InvalidPathException", InvalidPathException);
