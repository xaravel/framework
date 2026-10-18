// Laravel's `Illuminate\Testing\Exceptions\InvalidArgumentException` (Story 4.3),
// thrown by `assertArraySubset` for an argument that is neither an array nor
// ArrayAccess. Internal to the grader.
export class InvalidArgumentException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidArgumentException";
  }

  static create(argument: number, type: string): InvalidArgumentException {
    const article = ["a", "e", "i", "o", "u"].includes(type[0]!.toLowerCase()) ? "an" : "a";
    return new InvalidArgumentException(`Argument #${argument} of Illuminate\\Testing\\Assert::assertArraySubset() must be ${article} ${type}`);
  }
}
