// `Dotenv\Exception\ValidationException` (vlucas/phpdotenv v5.7.0): `final class ValidationException extends RuntimeException implements
// ExceptionInterface`, over the runtime's SPL `RuntimeException` (AD-19), the interface a brand getter (AD-9.5).
import { RuntimeException, registerClass } from "@xaravel/runtime";
import { ExceptionInterface } from "./ExceptionInterface";

/** Thrown when an environment variable fails a validator assertion. */
export class ValidationException extends RuntimeException implements ExceptionInterface {
  /** The `ExceptionInterface` brand: an `instanceof ExceptionInterface` check finds this class (AD-9.5). */
  get [ExceptionInterface.brand](): true {
    return true;
  }
}

registerClass("Dotenv\\Exception\\ValidationException", ValidationException);
