// `Dotenv\Validator` (vlucas/phpdotenv v5.7.0), ported line for line. A user pattern runs through the runtime's
// `preg_match` (PORTING.md § PCRE conversion, DIV-10.1). `preg_last_error()` reads the active Scope Frame's code and 0
// outside a frame (AD-5), so outside a frame an invalid `allowedRegexValues` pattern is not told apart from one that
// matches nothing (deferred item in spec-15-2).
import { registerClass } from "@xaravel/runtime";
import { ctype_digit, filter_var, FILTER_NULL_ON_FAILURE, FILTER_VALIDATE_BOOLEAN, implode, in_array, preg_last_error, preg_match, PREG_INTERNAL_ERROR, sprintf, trim } from "@xaravel/runtime/php";
import { ValidationException } from "./Exception/ValidationException";
import type { RepositoryInterface } from "./Repository/RepositoryInterface";
import { Regex } from "./Util/Regex";
import { Str } from "./Util/Str";

/** Asserts properties of environment variables. */
export class Validator {
  /** The environment repository instance. */
  private readonly repository: RepositoryInterface;

  /** The variables to validate. */
  private readonly variables: readonly string[];

  /** Create a new validator instance. */
  constructor(repository: RepositoryInterface, variables: readonly string[]) {
    this.repository = repository;
    this.variables = variables;
  }

  /** Assert that each variable is present. */
  required(): this {
    return this.assert(
      (value: string | null) => {
        return value !== null;
      },
      "is missing",
    );
  }

  /** Assert that each variable is not empty. */
  notEmpty(): this {
    return this.assertNullable(
      (value: string) => {
        return Str.len(trim(value, " \n\r\t\0\x0B")) > 0;
      },
      "is empty",
    );
  }

  /** Assert that each specified variable is an integer. */
  isInteger(): this {
    return this.assertNullable(
      (value: string) => {
        return ctype_digit(value);
      },
      "is not an integer",
    );
  }

  /** Assert that each specified variable is a boolean. */
  isBoolean(): this {
    return this.assertNullable(
      (value: string) => {
        if (value === "") {
          return false;
        }

        return filter_var(value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) !== null;
      },
      "is not a boolean",
    );
  }

  /** Assert that each variable is amongst the given choices. */
  allowedValues(choices: readonly string[]): this {
    return this.assertNullable(
      (value: string) => {
        return in_array(value, choices, true);
      },
      sprintf("is not one of [%s]", implode(", ", choices)),
    );
  }

  /** Assert that each variable matches the given regular expression. */
  allowedRegexValues(regex: string): this {
    if (preg_match(regex, "") === false && preg_last_error() === PREG_INTERNAL_ERROR) {
      return this.assertNullable(
        (value: string) => {
          void value;
          return false;
        },
        sprintf("could not be validated against the invalid regular expression \"%s\"", regex),
      );
    }

    return this.assertNullable(
      (value: string) => {
        return Regex.matches(regex, value).success().getOrElse(false);
      },
      sprintf("does not match \"%s\"", regex),
    );
  }

  /** Assert that the callback returns true for each variable. */
  assert(callback: (value: string | null) => unknown, message: string): this {
    const failing: string[] = [];

    for (const variable of this.variables) {
      if (callback(this.repository.get(variable)) === false) {
        failing.push(sprintf("%s %s", variable, message));
      }
    }

    if (failing.length > 0) {
      throw new ValidationException(sprintf(
        "One or more environment variables failed assertions: %s.",
        implode(", ", failing),
      ));
    }

    return this;
  }

  /**
   * Assert that the callback returns true for each variable.
   *
   * Skip checking null variable values.
   */
  assertNullable(callback: (value: string) => unknown, message: string): this {
    return this.assert(
      (value: string | null) => {
        if (value === null) {
          return true;
        }

        return callback(value);
      },
      message,
    );
  }
}

registerClass("Dotenv\\Validator", Validator);
