// Laravel's `Illuminate\Testing\Exceptions\InvalidArgumentException` (Story 4.3),
// thrown by `assertArraySubset` for an argument that is neither an array nor
// ArrayAccess. Internal to the grader. PHP: `InvalidArgumentException extends
// PHPUnit\Framework\Exception`, so it extends the grader's PHPUnit `Exception`,
// which reaches the runtime's `RuntimeException` once linked (Story 9.11).
import { Exception } from "./Exception";

const CLASS_FQCN = Symbol.for("xaravel.class.fqcn");

export class InvalidArgumentException extends Exception {
  static readonly [CLASS_FQCN]: string = "Illuminate\\Testing\\Exceptions\\InvalidArgumentException";

  constructor(message: string) {
    super(message);
    this.name = "InvalidArgumentException";
  }

  static create(argument: number, type: string): InvalidArgumentException {
    const article = ["a", "e", "i", "o", "u"].includes(type[0]!.toLowerCase()) ? "an" : "a";
    return new InvalidArgumentException(`Argument #${argument} of Illuminate\\Testing\\Assert::assertArraySubset() must be ${article} ${type}`);
  }
}
