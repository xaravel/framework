// PHPUnit 13.4.3's `EmptyStringException` (Story 4.3): an empty prefix or suffix. Internal to the grader.
export class EmptyStringException extends Error {
  constructor() {
    super("");
    this.name = "EmptyStringException";
  }
}
