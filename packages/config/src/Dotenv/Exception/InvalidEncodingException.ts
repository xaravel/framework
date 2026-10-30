// `Dotenv\Exception\InvalidEncodingException` (vlucas/phpdotenv v5.7.0): `final class InvalidEncodingException extends InvalidArgumentException implements
// ExceptionInterface`, over the runtime's SPL `InvalidArgumentException` (AD-19), the interface a brand getter (AD-9.5).
import { InvalidArgumentException, registerClass } from "@xaravel/runtime";
import { ExceptionInterface } from "./ExceptionInterface";

/** Thrown when an environment file's encoding is invalid or its conversion failed. */
export class InvalidEncodingException extends InvalidArgumentException implements ExceptionInterface {
  get [ExceptionInterface.brand](): true {
    return true;
  }
}

registerClass("Dotenv\\Exception\\InvalidEncodingException", InvalidEncodingException);
